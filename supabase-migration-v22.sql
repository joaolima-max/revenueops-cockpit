-- =====================================================================
-- RevenueOps Cockpit — migration v22
--
-- INCREMENTAL E IDEMPOTENTE. Nao faz reset, nao faz TRUNCATE, nao faz
-- DROP de tabela nem DELETE em massa. Pode rodar duas vezes.
--
-- O que entra:
--   1. User.isPartner                     (SOCIO — eixo proprio)
--   2. Cliente.numeroConta                (opcional, nunca gerado)
--   3. Lead.deletedAt / deletedById       (LIXEIRA — soft delete)
--   4. SegmentoComercial                  (segmento como entidade)
--   5. segmentoComercialId em Cliente, Lead e Deal
--   6. CondicaoProduto                    (produtos tarifados dinamicos)
--   7. LancamentoBaas + LancamentoBaasItem (snapshot de tarifas)
--   8. Semeadura de segmentos e de produtos a partir do que ja existe
--
-- RLS: as tabelas NOVAS entram com RLS LIGADA e ZERO POLITICAS — deny-all
-- para anon e authenticated, exatamente como as 48 existentes desde a v18.
-- Nada aqui desliga, afrouxa ou cria politica.
-- =====================================================================

-- ── 1. SOCIO ────────────────────────────────────────────────────────
-- Eixo PROPRIO. Ser ADMIN e operar o sistema; ser Diretor e estar no topo
-- da hierarquia; estar no departamento CONSELHO e trabalhar com o conselho.
-- Nenhuma das tres e ser socio, e so socio entra no Conselho.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPartner" BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Numero da conta do cliente ───────────────────────────────────
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "numeroConta" TEXT;

-- ATIVOS primeiro, alfabetico; INATIVOS depois, alfabetico. O indice existe
-- para a ordenacao funcionar com paginacao, em vez de ordenar em memoria.
CREATE INDEX IF NOT EXISTS "Cliente_status_nome_idx" ON "Cliente" ("status", "nome");

-- ── 3. LIXEIRA DE LEADS ─────────────────────────────────────────────
-- Excluir passa a significar MOVER PARA A LIXEIRA. O historico fica inteiro:
-- cards, movimentacoes e comentarios continuam existindo e apontando para o
-- lead. Apagar fisicamente destruia esse historico.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "deletedAt"   TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

DO $$ BEGIN
  ALTER TABLE "Lead"
    ADD CONSTRAINT "Lead_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Lead_deletedAt_idx"            ON "Lead" ("deletedAt");
CREATE INDEX IF NOT EXISTS "Lead_deletedAt_createdAt_idx"  ON "Lead" ("deletedAt", "createdAt");

-- ── 4. SEGMENTO COMO ENTIDADE ───────────────────────────────────────
-- O enum `Segmento` continua e continua gravado nas colunas antigas: um enum
-- nao se apaga sem reescrever os dados que o usam. Os dois convivem.
CREATE TABLE IF NOT EXISTS "SegmentoComercial" (
  "id"        TEXT         NOT NULL,
  "nome"      TEXT         NOT NULL,
  "slug"      TEXT         NOT NULL,
  "ativo"     BOOLEAN      NOT NULL DEFAULT true,
  "ordem"     INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SegmentoComercial_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SegmentoComercial_nome_key" ON "SegmentoComercial" ("nome");
CREATE UNIQUE INDEX IF NOT EXISTS "SegmentoComercial_slug_key" ON "SegmentoComercial" ("slug");
CREATE INDEX IF NOT EXISTS "SegmentoComercial_ativo_ordem_idx" ON "SegmentoComercial" ("ativo", "ordem");

ALTER TABLE "SegmentoComercial" ENABLE ROW LEVEL SECURITY;

-- ── 5. Vinculo de segmento nas tres tabelas ─────────────────────────
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "segmentoComercialId" TEXT;
ALTER TABLE "Lead"    ADD COLUMN IF NOT EXISTS "segmentoComercialId" TEXT;
ALTER TABLE "Deal"    ADD COLUMN IF NOT EXISTS "segmentoComercialId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_segmentoComercialId_fkey"
    FOREIGN KEY ("segmentoComercialId") REFERENCES "SegmentoComercial"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_segmentoComercialId_fkey"
    FOREIGN KEY ("segmentoComercialId") REFERENCES "SegmentoComercial"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Deal" ADD CONSTRAINT "Deal_segmentoComercialId_fkey"
    FOREIGN KEY ("segmentoComercialId") REFERENCES "SegmentoComercial"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Cliente_segmentoComercialId_idx" ON "Cliente" ("segmentoComercialId");
CREATE INDEX IF NOT EXISTS "Lead_segmentoComercialId_idx"    ON "Lead" ("segmentoComercialId");
CREATE INDEX IF NOT EXISTS "Deal_segmentoComercialId_idx"    ON "Deal" ("segmentoComercialId");

-- ── 6. PRODUTOS TARIFADOS ───────────────────────────────────────────
-- Antes as tarifas eram colunas fixas (`pix`, `kyc`): nao dava para cadastrar
-- produto novo sem migration, e o Lancamento BaaS precisa listar TODOS.
CREATE TABLE IF NOT EXISTS "CondicaoProduto" (
  "id"         TEXT         NOT NULL,
  "condicaoId" TEXT         NOT NULL,
  "nome"       TEXT         NOT NULL,
  "preco"      DOUBLE PRECISION NOT NULL,
  "ativo"      BOOLEAN      NOT NULL DEFAULT true,
  "ordem"      INTEGER      NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CondicaoProduto_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "CondicaoProduto" ADD CONSTRAINT "CondicaoProduto_condicaoId_fkey"
    FOREIGN KEY ("condicaoId") REFERENCES "CondicaoComercial"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "CondicaoProduto_condicaoId_nome_key"
  ON "CondicaoProduto" ("condicaoId", "nome");
CREATE INDEX IF NOT EXISTS "CondicaoProduto_condicaoId_ativo_ordem_idx"
  ON "CondicaoProduto" ("condicaoId", "ativo", "ordem");

ALTER TABLE "CondicaoProduto" ENABLE ROW LEVEL SECURITY;

-- ── 7. LANCAMENTO BAAS ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "StatusLancamentoBaas" AS ENUM ('RASCUNHO','LANCADO','FECHADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "LancamentoBaas" (
  "id"                TEXT         NOT NULL,
  "condicaoId"        TEXT         NOT NULL,
  "numeroConta"       TEXT         NOT NULL,
  "periodoInicio"     DATE         NOT NULL,
  "periodoFim"        DATE         NOT NULL,
  "saldoInicial"      DOUBLE PRECISION NOT NULL,
  "totalTarifas"      DOUBLE PRECISION NOT NULL,
  "saldoRemanescente" DOUBLE PRECISION NOT NULL,
  "overpricePercent"  DOUBLE PRECISION,
  "overpriceValor"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "valorCliente"      DOUBLE PRECISION NOT NULL,
  "status"            "StatusLancamentoBaas" NOT NULL DEFAULT 'RASCUNHO',
  "observacao"        TEXT,
  "lancamentoId"      TEXT,
  "contaReceberId"    TEXT,
  "contaPagarId"      TEXT,
  "criadoPorId"       TEXT         NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LancamentoBaas_pkey" PRIMARY KEY ("id")
);

-- IDEMPOTENCIA PELO BANCO: um lancamento BaaS nunca gera dois lancamentos
-- financeiros, dois titulos a receber nem dois a pagar. O UNIQUE e o que
-- garante, nao a ordem das chamadas.
CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoBaas_lancamentoId_key"   ON "LancamentoBaas" ("lancamentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoBaas_contaReceberId_key" ON "LancamentoBaas" ("contaReceberId");
CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoBaas_contaPagarId_key"   ON "LancamentoBaas" ("contaPagarId");
-- Um parceiro nao lanca o MESMO periodo duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoBaas_condicaoId_periodoInicio_periodoFim_key"
  ON "LancamentoBaas" ("condicaoId", "periodoInicio", "periodoFim");
CREATE INDEX IF NOT EXISTS "LancamentoBaas_condicaoId_periodoInicio_idx"
  ON "LancamentoBaas" ("condicaoId", "periodoInicio");
CREATE INDEX IF NOT EXISTS "LancamentoBaas_status_idx" ON "LancamentoBaas" ("status");

DO $$ BEGIN
  ALTER TABLE "LancamentoBaas" ADD CONSTRAINT "LancamentoBaas_condicaoId_fkey"
    FOREIGN KEY ("condicaoId") REFERENCES "CondicaoComercial"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LancamentoBaas" ADD CONSTRAINT "LancamentoBaas_lancamentoId_fkey"
    FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoFinanceiro"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LancamentoBaas" ADD CONSTRAINT "LancamentoBaas_contaReceberId_fkey"
    FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LancamentoBaas" ADD CONSTRAINT "LancamentoBaas_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "LancamentoFinanceiro"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LancamentoBaas" ADD CONSTRAINT "LancamentoBaas_criadoPorId_fkey"
    FOREIGN KEY ("criadoPorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "LancamentoBaas" ENABLE ROW LEVEL SECURITY;

-- SNAPSHOT das tarifas. Preco copiado de proposito: se a tarifa do PIX passar
-- de R$ 0,10 para R$ 0,15, o lancamento de setembro continua valendo R$ 0,10.
CREATE TABLE IF NOT EXISTS "LancamentoBaasItem" (
  "id"               TEXT    NOT NULL,
  "lancamentoBaasId" TEXT    NOT NULL,
  "produtoId"        TEXT,
  "nome"             TEXT    NOT NULL,
  "preco"            DOUBLE PRECISION NOT NULL,
  "volume"           INTEGER NOT NULL,
  "total"            DOUBLE PRECISION NOT NULL,
  "ordem"            INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "LancamentoBaasItem_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "LancamentoBaasItem" ADD CONSTRAINT "LancamentoBaasItem_lancamentoBaasId_fkey"
    FOREIGN KEY ("lancamentoBaasId") REFERENCES "LancamentoBaas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "LancamentoBaasItem_lancamentoBaasId_ordem_idx"
  ON "LancamentoBaasItem" ("lancamentoBaasId", "ordem");

ALTER TABLE "LancamentoBaasItem" ENABLE ROW LEVEL SECURITY;

-- ── 8. SEMEADURA ────────────────────────────────────────────────────
-- Segmentos: os valores do enum, com o slug IGUAL ao valor antigo, para que
-- os registros legados casem. Nada muda de significado no dia da migration.
INSERT INTO "SegmentoComercial" ("id","nome","slug","ordem","updatedAt")
VALUES
  (gen_random_uuid()::text, 'Cripto Exchanges',       'CRYPTO_EXCHANGES',     10, now()),
  (gen_random_uuid()::text, 'Remessa / FX',           'REMESSA_FX',           20, now()),
  (gen_random_uuid()::text, 'Gateway de Pagamentos',  'GATEWAY_PAGAMENTOS',   30, now()),
  (gen_random_uuid()::text, 'BaaS',                   'BAAS',                 40, now()),
  (gen_random_uuid()::text, 'Telecom',                'TELECOM',              50, now()),
  (gen_random_uuid()::text, 'ERP',                    'ERP',                  60, now()),
  (gen_random_uuid()::text, 'iGaming',                'IGAMING',              70, now()),
  (gen_random_uuid()::text, 'SaaS',                   'SAAS',                 80, now()),
  (gen_random_uuid()::text, 'E-commerce',             'ECOMMERCE',            90, now()),
  (gen_random_uuid()::text, 'Criptomoedas',           'CRIPTOMOEDAS',        100, now()),
  (gen_random_uuid()::text, 'Varejo',                 'VAREJO',              110, now()),
  (gen_random_uuid()::text, 'Outros',                 'OUTROS',              120, now())
ON CONFLICT ("slug") DO NOTHING;

-- Casa os registros existentes pelo slug. Idempotente: so preenche o que
-- ainda esta nulo, e nunca sobrescreve um vinculo ja feito a mao.
UPDATE "Cliente" c SET "segmentoComercialId" = s."id"
  FROM "SegmentoComercial" s
 WHERE c."segmentoComercialId" IS NULL
   AND c."segmento" IS NOT NULL
   AND s."slug" = c."segmento"::text;

UPDATE "Lead" l SET "segmentoComercialId" = s."id"
  FROM "SegmentoComercial" s
 WHERE l."segmentoComercialId" IS NULL
   AND l."segmento" IS NOT NULL
   AND s."slug" = l."segmento"::text;

UPDATE "Deal" d SET "segmentoComercialId" = s."id"
  FROM "SegmentoComercial" s
 WHERE d."segmentoComercialId" IS NULL
   AND d."segmento" IS NOT NULL
   AND s."slug" = d."segmento"::text;

-- Produtos: PIX e KYC que JA existem nas condicoes viram produtos, para que o
-- Lancamento BaaS os encontre sem ninguem recadastrar. As colunas ficam no
-- lugar; deixam de ser a fonte.
INSERT INTO "CondicaoProduto" ("id","condicaoId","nome","preco","ordem","updatedAt")
SELECT gen_random_uuid()::text, c."id", 'PIX', c."pix", 10, now()
  FROM "CondicaoComercial" c
 WHERE c."pix" IS NOT NULL AND c."pix" > 0
ON CONFLICT ("condicaoId","nome") DO NOTHING;

INSERT INTO "CondicaoProduto" ("id","condicaoId","nome","preco","ordem","updatedAt")
SELECT gen_random_uuid()::text, c."id", 'KYC', c."kyc", 20, now()
  FROM "CondicaoComercial" c
 WHERE c."kyc" IS NOT NULL AND c."kyc" > 0
ON CONFLICT ("condicaoId","nome") DO NOTHING;

-- ── 9. CATEGORIAS, recriadas de forma IDEMPOTENTE ───────────────────
-- Float, Setup e Sustentação são categorias NORMAIS de receita, sem
-- subcategoria. A `natureza` não aparece na tela: é o papel econômico que os
-- gráficos reconhecem, e existe para não depender do nome digitado.
--
-- Entram também as duas que o Lançamento BaaS usa: a receita que a Bass Pago
-- cobrou (tarifas + overprice) e a despesa do valor residual devido ao
-- cliente. Sem elas o lançamento automático não teria onde classificar.
--
-- ON CONFLICT no par (nome, tipo): rodar duas vezes não duplica, e uma
-- categoria que o usuário já criou à mão é preservada como está.
INSERT INTO "CategoriaFinanceira" ("id","nome","tipo","natureza","updatedAt")
VALUES
  (gen_random_uuid()::text, 'Float',        'RECEITA', 'FLOAT',       now()),
  (gen_random_uuid()::text, 'Setup',        'RECEITA', 'SETUP',       now()),
  (gen_random_uuid()::text, 'Sustentação',  'RECEITA', 'SUSTENTACAO', now()),
  (gen_random_uuid()::text, 'Tarifas BaaS', 'RECEITA', NULL,          now()),
  (gen_random_uuid()::text, 'Repasse a Cliente BaaS', 'DESPESA', NULL, now())
ON CONFLICT ("nome","tipo") DO NOTHING;
