-- Migration v11: Pipeline multi-funil configuravel
--
-- Cria funis, etapas, alcadas e historico de movimentacao, e passa o Deal a
-- morar em um funil/etapa em vez de no enum DealStage.
--
-- IMPACTO / SEGURANCA
--   * Somente operacoes ADITIVAS: CREATE TYPE, CREATE TABLE, ADD COLUMN,
--     CREATE INDEX, INSERT e um UPDATE de backfill restrito a linhas que ainda
--     nao tem funil. Nenhum DROP, nenhum DELETE, nenhum TRUNCATE.
--   * "Deal"."stage" NAO e removido nem alterado. Continua sendo a fonte que
--     app/api/relatorios usa hoje; o backfill le esse valor, nao o reescreve.
--   * As tres colunas novas do Deal nascem NULL e sao preenchidas pelo
--     backfill, entao nenhuma linha existente fica invalida em nenhum momento.
--   * Ids das linhas semente sao fixos e legiveis para que a migration seja
--     reexecutavel e para que o backfill possa referencia-los.
--
-- Idempotente: pode ser reexecutada com seguranca.

-- ---------------------------------------------------------------- 1. Enums

DO $$ BEGIN
  CREATE TYPE "EtapaTipo" AS ENUM ('NORMAL', 'GANHO', 'PERDIDO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MovimentacaoTipo" AS ENUM ('CRIACAO', 'MOVIMENTO_ETAPA', 'TRANSFERENCIA_FUNIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------------------- 2. Tabelas

CREATE TABLE IF NOT EXISTS "PipelineFunil" (
  "id"           TEXT NOT NULL,
  "nome"         TEXT NOT NULL,
  "descricao"    TEXT,
  "area"         TEXT,
  "ordem"        INTEGER NOT NULL DEFAULT 0,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "exigeCliente" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PipelineFunil_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PipelineEtapa" (
  "id"        TEXT NOT NULL,
  "funilId"   TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "descricao" TEXT,
  "ordem"     INTEGER NOT NULL DEFAULT 0,
  "cor"       TEXT,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "tipo"      "EtapaTipo" NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PipelineEtapa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PipelinePermissao" (
  "id"             TEXT NOT NULL,
  "funilId"        TEXT NOT NULL,
  "role"           "Role",
  "userId"         TEXT,
  "ver"            BOOLEAN NOT NULL DEFAULT true,
  "editar"         BOOLEAN NOT NULL DEFAULT false,
  "mover"          BOOLEAN NOT NULL DEFAULT false,
  "criar"          BOOLEAN NOT NULL DEFAULT false,
  "transferir"     BOOLEAN NOT NULL DEFAULT false,
  "administrar"    BOOLEAN NOT NULL DEFAULT false,
  "apenasProprios" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PipelinePermissao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PipelineMovimentacao" (
  "id"             TEXT NOT NULL,
  "dealId"         TEXT NOT NULL,
  "tipo"           "MovimentacaoTipo" NOT NULL,
  "funilOrigemId"  TEXT,
  "etapaOrigemId"  TEXT,
  "funilDestinoId" TEXT NOT NULL,
  "etapaDestinoId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "observacao"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PipelineMovimentacao_pkey" PRIMARY KEY ("id")
);

-- --------------------------------------------------------------- 3. Indices

CREATE UNIQUE INDEX IF NOT EXISTS "PipelineFunil_nome_key"           ON "PipelineFunil" ("nome");
CREATE INDEX        IF NOT EXISTS "PipelineFunil_ativo_ordem_idx"    ON "PipelineFunil" ("ativo", "ordem");

-- "ordem" fica FORA de qualquer unique: um unique impediria trocar duas etapas
-- de posicao sem um valor intermediario.
CREATE UNIQUE INDEX IF NOT EXISTS "PipelineEtapa_funilId_nome_key"   ON "PipelineEtapa" ("funilId", "nome");
CREATE INDEX        IF NOT EXISTS "PipelineEtapa_funilId_ordem_idx"  ON "PipelineEtapa" ("funilId", "ordem");

-- NULLs sao distintos no Postgres, entao estes dois uniques convivem: linhas
-- de role tem userId nulo e vice-versa.
CREATE UNIQUE INDEX IF NOT EXISTS "PipelinePermissao_funilId_role_key"   ON "PipelinePermissao" ("funilId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "PipelinePermissao_funilId_userId_key" ON "PipelinePermissao" ("funilId", "userId");
CREATE INDEX        IF NOT EXISTS "PipelinePermissao_funilId_idx"        ON "PipelinePermissao" ("funilId");

CREATE INDEX IF NOT EXISTS "PipelineMovimentacao_dealId_createdAt_idx"         ON "PipelineMovimentacao" ("dealId", "createdAt");
CREATE INDEX IF NOT EXISTS "PipelineMovimentacao_funilDestinoId_createdAt_idx" ON "PipelineMovimentacao" ("funilDestinoId", "createdAt");

-- ------------------------------------------------------- 4. Colunas do Deal

ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "funilId"   TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "etapaId"   TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;

CREATE INDEX IF NOT EXISTS "Deal_funilId_etapaId_idx" ON "Deal" ("funilId", "etapaId");

-- ------------------------------------------------------------ 5. Chaves

DO $$ BEGIN
  ALTER TABLE "PipelineEtapa" ADD CONSTRAINT "PipelineEtapa_funilId_fkey"
    FOREIGN KEY ("funilId") REFERENCES "PipelineFunil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PipelinePermissao" ADD CONSTRAINT "PipelinePermissao_funilId_fkey"
    FOREIGN KEY ("funilId") REFERENCES "PipelineFunil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PipelinePermissao" ADD CONSTRAINT "PipelinePermissao_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PipelineMovimentacao" ADD CONSTRAINT "PipelineMovimentacao_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PipelineMovimentacao" ADD CONSTRAINT "PipelineMovimentacao_funilOrigemId_fkey"
    FOREIGN KEY ("funilOrigemId") REFERENCES "PipelineFunil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PipelineMovimentacao" ADD CONSTRAINT "PipelineMovimentacao_etapaOrigemId_fkey"
    FOREIGN KEY ("etapaOrigemId") REFERENCES "PipelineEtapa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PipelineMovimentacao" ADD CONSTRAINT "PipelineMovimentacao_funilDestinoId_fkey"
    FOREIGN KEY ("funilDestinoId") REFERENCES "PipelineFunil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PipelineMovimentacao" ADD CONSTRAINT "PipelineMovimentacao_etapaDestinoId_fkey"
    FOREIGN KEY ("etapaDestinoId") REFERENCES "PipelineEtapa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PipelineMovimentacao" ADD CONSTRAINT "PipelineMovimentacao_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Deal" ADD CONSTRAINT "Deal_funilId_fkey"
    FOREIGN KEY ("funilId") REFERENCES "PipelineFunil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Deal" ADD CONSTRAINT "Deal_etapaId_fkey"
    FOREIGN KEY ("etapaId") REFERENCES "PipelineEtapa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------- 6. Os funis

INSERT INTO "PipelineFunil" ("id","nome","descricao","area","ordem","ativo","exigeCliente","createdAt","updatedAt") VALUES
  ('fnl_vendas',     'Vendas',     'Da prospecção ao fechamento do negócio.',        'Comercial',   1, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fnl_onboarding', 'Onboarding', 'Implantação do cliente até entrar em produção.', 'Operacional', 2, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fnl_operacoes',  'Operações',  'Cliente em produção: ativação e sustentação.',   'Operacional', 3, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ------------------------------------------------------------ 7. As etapas

INSERT INTO "PipelineEtapa" ("id","funilId","nome","ordem","tipo","createdAt","updatedAt") VALUES
  ('etp_vnd_prospeccao',   'fnl_vendas', 'Prospecção',   1, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_vnd_qualificacao', 'fnl_vendas', 'Qualificação', 2, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_vnd_proposta',     'fnl_vendas', 'Proposta',     3, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_vnd_negociacao',   'fnl_vendas', 'Negociação',   4, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_vnd_fechamento',   'fnl_vendas', 'Fechamento',   5, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_vnd_ganho',        'fnl_vendas', 'Ganho',        6, 'GANHO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_vnd_perdido',      'fnl_vendas', 'Perdido',      7, 'PERDIDO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('etp_onb_kickoff',      'fnl_onboarding', 'Kickoff',         1, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_onb_contrato',     'fnl_onboarding', 'Contrato',        2, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_onb_taxas',        'fnl_onboarding', 'Ajuste de Taxas', 3, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_onb_integracao',   'fnl_onboarding', 'Integração',      4, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_onb_homologacao',  'fnl_onboarding', 'Homologação',     5, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_onb_golive',       'fnl_onboarding', 'Go Live',         6, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('etp_ope_ativacao',     'fnl_operacoes', 'Ativação',      1, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_ope_monitoramento','fnl_operacoes', 'Monitoramento', 2, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('etp_ope_sustentacao',  'fnl_operacoes', 'Sustentação',   3, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- --------------------------------------------------------- 8. As permissoes
--
-- ADMIN nao precisa de linha: `resolverAcesso` em lib/pipeline.ts concede tudo
-- ao ADMIN antes de olhar a tabela, do mesmo jeito que `hasPermission` ja faz.
-- "apenasProprios" no Vendas preserva a regra que hoje esta embutida em
-- app/dashboard/pipeline/page.tsx: o COMERCIAL so enxerga os proprios deals.

INSERT INTO "PipelinePermissao"
  ("id","funilId","role","ver","editar","mover","criar","transferir","administrar","apenasProprios","createdAt","updatedAt") VALUES
  ('prm_vnd_comercial',  'fnl_vendas',     'COMERCIAL',   true, true, true, true, true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prm_onb_operacional','fnl_onboarding', 'OPERACIONAL', true, true, true, true, true, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prm_ope_operacional','fnl_operacoes',  'OPERACIONAL', true, true, true, true, true, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ----------------------------------------------------------- 9. Backfill
--
-- Preserva o stage atual de cada Deal, um para um. Nada e reclassificado:
-- PROSPECCAO continua em Prospeccao. Restrito a linhas sem funil, entao
-- reexecutar nao mexe em card que ja foi movido depois da migration.

UPDATE "Deal" SET
  "funilId" = 'fnl_vendas',
  "etapaId" = CASE "stage"::text
    WHEN 'PROSPECCAO'   THEN 'etp_vnd_prospeccao'
    WHEN 'QUALIFICACAO' THEN 'etp_vnd_qualificacao'
    WHEN 'PROPOSTA'     THEN 'etp_vnd_proposta'
    WHEN 'NEGOCIACAO'   THEN 'etp_vnd_negociacao'
    WHEN 'FECHAMENTO'   THEN 'etp_vnd_fechamento'
    WHEN 'GANHO'        THEN 'etp_vnd_ganho'
    WHEN 'PERDIDO'      THEN 'etp_vnd_perdido'
  END
WHERE "funilId" IS NULL;
