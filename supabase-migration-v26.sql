-- ============================================================================
-- v26 — EXCLUSÃO DE CARD, CATEGORIA BAAS, DESCRIÇÕES CURTAS, view_conselho
--
-- Incremental e idempotente. Nenhum DROP, TRUNCATE ou DELETE em massa.
-- Preserva Leads, Pipeline, lançamentos, títulos, auditoria e permissões.
--
-- ATENÇÃO: a parte 1 (ADD VALUE no enum) vai numa transação SEPARADA. Um
-- valor acrescentado por ALTER TYPE não pode ser USADO na mesma transação em
-- que nasceu — e as partes seguintes não o usam, mas manter a separação evita
-- que uma edição futura esbarre nisso.
-- ============================================================================

-- ─── 1. MovimentacaoTipo += EXCLUSAO_CARD ───────────────────────────────────
-- A exclusão de card é uma movimentação como as outras: entra no mesmo
-- histórico, com funil e etapa de origem.
ALTER TYPE "MovimentacaoTipo" ADD VALUE IF NOT EXISTS 'EXCLUSAO_CARD';
-- ─── 2. Deal: soft delete ───────────────────────────────────────────────────
-- EXCLUIR CARD ≠ EXCLUIR LEAD. O card sai do Pipeline; o lead continua em
-- Leads, com histórico, comentários e atividades intactos. Apagar o card
-- fisicamente levaria embora as movimentações e os comentários dele — que são
-- exatamente o histórico que a exclusão precisa preservar.
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "deletedAt"   TIMESTAMP(3);
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Deal_deletedById_fkey'
  ) THEN
    ALTER TABLE "Deal"
      ADD CONSTRAINT "Deal_deletedById_fkey"
      FOREIGN KEY ("deletedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Sem o índice, cada leitura do quadro varreria a tabela para descartar os
-- cards excluídos.
CREATE INDEX IF NOT EXISTS "Deal_deletedAt_idx" ON "Deal"("deletedAt");

-- ─── 3. CATEGORIA DO REPASSE: "Repasse a Cliente BaaS" → "BaaS" ─────────────
-- RENOMEIA, não cria outra: o id permanece, e todos os lançamentos já
-- classificados seguem apontando para ela. Criar uma categoria nova e
-- religar os lançamentos faria o mesmo trabalho com risco de deixar linhas
-- na antiga.
--
-- O nome antigo dizia "a Cliente", e o residual é devido ao PARCEIRO
-- (BaaS/White Label), que não é cliente da carteira — o rótulo confundia os
-- dois lados do lançamento.
UPDATE "CategoriaFinanceira"
SET nome = 'BaaS', "updatedAt" = CURRENT_TIMESTAMP
WHERE tipo = 'DESPESA'
  AND nome = 'Repasse a Cliente BaaS'
  AND NOT EXISTS (
    SELECT 1 FROM "CategoriaFinanceira" c2
    WHERE c2.tipo = 'DESPESA' AND c2.nome = 'BaaS'
  );

-- Rede de segurança: se a categoria não existir por nenhum caminho, cria.
INSERT INTO "CategoriaFinanceira" (id, nome, tipo, ativo, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'BaaS', 'DESPESA', true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE tipo = 'DESPESA' AND nome = 'BaaS'
);

-- ─── 4. DESCRIÇÕES CURTAS ───────────────────────────────────────────────────
-- A versão anterior carregava a competência ("Tarifas BaaS — teste —
-- 09/2026"). A data já é uma coluna da tabela, e a composição por produto
-- está no painel de detalhes: repeti-las na descrição só roubava largura da
-- linha.
--
-- Receita e título a receber → "Tarifa BaaS — <parceiro>"
-- Repasse (contas a pagar)   → "Repasse BaaS — <parceiro>"
UPDATE "LancamentoFinanceiro" lf
SET descricao = 'Tarifa BaaS — ' || cc."nomeFantasia",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "LancamentoBaas" lb
JOIN "CondicaoComercial" cc ON cc.id = lb."condicaoId"
WHERE lb."lancamentoId" = lf.id
  AND lf.descricao <> 'Tarifa BaaS — ' || cc."nomeFantasia";

UPDATE "LancamentoFinanceiro" lf
SET descricao = 'Repasse BaaS — ' || cc."nomeFantasia",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "LancamentoBaas" lb
JOIN "CondicaoComercial" cc ON cc.id = lb."condicaoId"
WHERE lb."contaPagarId" = lf.id
  AND lf.descricao <> 'Repasse BaaS — ' || cc."nomeFantasia";

UPDATE "ContaReceber" cr
SET descricao = 'Tarifa BaaS — ' || cc."nomeFantasia",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "LancamentoBaas" lb
JOIN "CondicaoComercial" cc ON cc.id = lb."condicaoId"
WHERE lb."contaReceberId" = cr.id
  AND cr.descricao <> 'Tarifa BaaS — ' || cc."nomeFantasia";

-- ─── 5. view_conselho PARA QUEM JÁ TINHA O ACESSO ───────────────────────────
-- O Conselho passou a exigir DUAS condições: ser sócio E ter `view_conselho`.
-- Sem esta concessão, João Lima e Manuel — que já eram sócios autorizados —
-- perderiam o acesso no mesmo deploy que criou a chave.
--
-- Acrescenta ao FIM da lista existente, preservando todas as outras chaves, e
-- só quando a chave ainda não está lá (idempotente). Nenhum outro usuário é
-- tocado: quem não é sócio não ganharia acesso de todo modo, e conceder a
-- chave a quem ninguém autorizou não é trabalho de uma migration.
UPDATE "User"
SET permissoes = (permissoes::jsonb || '["view_conselho"]'::jsonb)::text,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isPartner" = true
  AND permissoes IS NOT NULL
  AND NOT (permissoes::jsonb @> '["view_conselho"]'::jsonb);
