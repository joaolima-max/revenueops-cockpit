-- =====================================================================
-- RevenueOps Cockpit — migration v23
--
-- INCREMENTAL E IDEMPOTENTE. Sem reset, sem TRUNCATE, sem DROP de tabela,
-- sem DELETE em massa. Pode rodar duas vezes.
--
-- O que entra:
--   1. CondicaoProduto.unidade — o que o VOLUME conta
--
-- Nada mais precisou de banco nesta rodada: a correção do Conselho, as
-- permissões de Usuários e a reorganização da Sidebar são de código. As
-- chaves `view_usuarios` e `manage_usuarios` vivem em `User.permissoes`
-- (coluna JSON que já existia), e `isPartner` entrou na v22.
--
-- RLS: nada aqui desliga, afrouxa ou cria política. A coluna nova herda a
-- RLS de CondicaoProduto, ligada desde a v22.
-- =====================================================================

-- ── 1. Unidade do produto tarifado ──────────────────────────────────
-- O que se CONTA no volume: "transação", "conta", "mês", "consulta". Entra no
-- rótulo da coluna de volume do Lançamento BaaS — sem isso, "100" é ambíguo.
--
-- Texto livre com default: o contrato pode cobrar por qualquer coisa, e uma
-- lista fechada obrigaria migration a cada produto novo.
--
-- O PREÇO continua Float (dinheiro, nunca texto). O OVERPRICE continua sendo
-- a única exceção percentual do cadastro, em CondicaoComercial.overpricePercent.
ALTER TABLE "CondicaoProduto"
  ADD COLUMN IF NOT EXISTS "unidade" TEXT DEFAULT 'transação';

-- Produtos semeados antes desta coluna recebem o default explícito, para que
-- a tela não precise tratar nulo como caso especial.
UPDATE "CondicaoProduto" SET "unidade" = 'transação' WHERE "unidade" IS NULL;
