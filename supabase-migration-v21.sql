-- =====================================================================
-- RevenueOps Cockpit — migration v21
--
-- INCREMENTAL E IDEMPOTENTE. Nao faz reset, nao faz TRUNCATE, nao faz
-- DROP de tabela nem DELETE em massa. Pode rodar duas vezes.
--
-- O que entra:
--   1. Departamento e Hierarquia do usuario   (notificacoes por area)
--   2. FollowUp.responsavelId                 (quem acompanha)
--   3. Notificacao.chave UNIQUE               (idempotencia dos lembretes)
--   4. NotificacaoOrigem += 5 origens         (tarefa, follow-up, AP, AR, LD)
--   5. MetaTipo += 5 metas de pipeline
--   6. Activity.leadId -> CASCADE             (a exclusao de lead falhava)
--
-- RLS: nada aqui desliga, afrouxa ou cria politica. As tabelas novas nao
-- existem; as colunas novas herdam a RLS da tabela que ja a tem.
-- =====================================================================

-- ── 1. Departamento e Hierarquia ────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "Departamento" AS ENUM
    ('FINANCEIRO','COMERCIAL','COMPLIANCE','OPERACOES','CONSELHO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Hierarquia" AS ENUM ('DIRETOR','OPERADOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sem DEFAULT: supor um departamento mandaria a notificacao financeira para
-- a pessoa errada. Nulo e a resposta honesta para quem foi criado antes.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "departamento" "Departamento";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hierarquia"   "Hierarquia";

CREATE INDEX IF NOT EXISTS "User_departamento_active_idx"
  ON "User" ("departamento", "active");

-- ── 2. FollowUp.responsavelId ───────────────────────────────────────
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;

DO $$ BEGIN
  ALTER TABLE "FollowUp"
    ADD CONSTRAINT "FollowUp_responsavelId_fkey"
    FOREIGN KEY ("responsavelId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "FollowUp_responsavelId_idx"  ON "FollowUp" ("responsavelId");
CREATE INDEX IF NOT EXISTS "FollowUp_proximoContato_idx" ON "FollowUp" ("proximoContato");

-- ── 3. Notificacao.chave — idempotencia dos lembretes ───────────────
-- Identifica o EVENTO ("tarefa:<id>:D-3:<destinatario>"), nao a mensagem.
-- O UNIQUE faz o banco recusar a segunda insercao do mesmo lembrete, entao
-- reprocessar o dia nao duplica aviso. Parcial: as notificacoes de acao
-- direta tem chave nula e nao disputam o indice.
ALTER TABLE "Notificacao" ADD COLUMN IF NOT EXISTS "chave" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Notificacao_chave_key"
  ON "Notificacao" ("chave") WHERE "chave" IS NOT NULL;

-- ── 4. NotificacaoOrigem — origens dos lembretes ────────────────────
-- ADD VALUE IF NOT EXISTS e idempotente por si. Cada valor na sua instrucao:
-- um valor adicionado nao pode ser USADO na mesma transacao.
ALTER TYPE "NotificacaoOrigem" ADD VALUE IF NOT EXISTS 'TAREFA';
ALTER TYPE "NotificacaoOrigem" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';
ALTER TYPE "NotificacaoOrigem" ADD VALUE IF NOT EXISTS 'CONTA_PAGAR';
ALTER TYPE "NotificacaoOrigem" ADD VALUE IF NOT EXISTS 'CONTA_RECEBER';
ALTER TYPE "NotificacaoOrigem" ADD VALUE IF NOT EXISTS 'LANCAMENTO_DIARIO';

-- ── 5. MetaTipo — metas de pipeline ─────────────────────────────────
-- Quantitativas e percentuais. Nenhuma monetaria: o valor comercial de um
-- lead nao esta validado e nao entra em meta.
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'LEADS_GERADOS';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'LEADS_GANHOS';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'LEADS_PERDIDOS';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'CONVERSAO_LEADS';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'ATIVIDADE_ASSISTIDA';

-- ── 6. Exclusão de Lead — Activity em CASCADE ───────────────────────
-- `Activity.leadId` e `Deal.leadId` estavam NO ACTION no banco: apagar um
-- lead que já tinha atividade ou card estourava violação de FK, o endpoint
-- devolvia 500 e, para o usuário, o botão simplesmente não fazia nada.
--
-- Activity vira CASCADE — é linha de log SOBRE o lead, sem vida própria.
--
-- Deal NÃO vira cascade, de propósito: o card carrega histórico de pipeline
-- (movimentações, comentários, desfecho). A API recusa com 409 e diz quantos
-- cards bloqueiam, em vez de estourar.
ALTER TABLE "Activity" DROP CONSTRAINT IF EXISTS "Activity_leadId_fkey";
ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
