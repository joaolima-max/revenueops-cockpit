-- Migration v19: certificado para cliente antigo + categorias de receita
--
-- POR QUE EXISTE
--
--   1. CERTIFICADO PARA CLIENTE ANTIGO
--      Ha envios historicos para empresas que nao estao mais na base. Hoje
--      `CertificadoEnvio.clienteId` e NOT NULL, entao registrar um desses
--      obrigaria a recriar a empresa como Cliente — sujando a Carteira com
--      uma linha que nao e cliente, contaminando contagens, MRR e filtros.
--
--      A coluna passa a ser nulavel, e entra `clienteNomeHistorico` para o
--      nome digitado. Exatamente um dos dois fica preenchido; a regra e
--      aplicada na API (lib/certificados.ts), nao por CHECK — um CHECK
--      impediria corrigir uma linha historica importada errada.
--
--   2. CATEGORIAS DE RECEITA Float / Setup / Sustentacao
--      As tres foram excluidas pela tela de Categorias em 01/10 (registrado em
--      Auditoria). Elas carregam `natureza`, de que o Financeiro depende para
--      o grafico de Float/Setup/Sustentacao e para a regra "lancado substitui
--      o derivado". Sem elas nao ha como classificar um lancamento com essas
--      naturezas.
--
--      Sao CATEGORIAS NORMAIS, de tipo RECEITA — nao subcategorias. Nao existe
--      hierarquia em CategoriaFinanceira, e nada aqui cria uma.
--
-- ESTRATEGIA
--   Aditiva. O unico ALTER em coluna existente e um DROP NOT NULL, que afrouxa
--   restricao: nenhuma linha atual deixa de ser valida.
--   Sem DROP TABLE/COLUMN/TYPE, sem TRUNCATE, sem DELETE.
--   Idempotente: rodar duas vezes nao duplica categoria nem falha.

BEGIN;

-- ===========================================================================
-- 0. INVENTARIO ANTES
-- ===========================================================================

DO $$
DECLARE
  n_envios BIGINT; n_sem_cliente BIGINT; n_cat BIGINT; n_cat_nat BIGINT;
BEGIN
  SELECT count(*) INTO n_envios      FROM "CertificadoEnvio";
  SELECT count(*) INTO n_sem_cliente FROM "CertificadoEnvio" WHERE "clienteId" IS NULL;
  SELECT count(*) INTO n_cat         FROM "CategoriaFinanceira";
  SELECT count(*) INTO n_cat_nat     FROM "CategoriaFinanceira" WHERE "natureza" IS NOT NULL;
  RAISE NOTICE '--- antes da v19 ---';
  RAISE NOTICE 'envios de certificado:        %', n_envios;
  RAISE NOTICE '  sem cliente vinculado:      %', n_sem_cliente;
  RAISE NOTICE 'categorias financeiras:       %', n_cat;
  RAISE NOTICE '  com natureza definida:      %', n_cat_nat;
END $$;

-- ===========================================================================
-- 1. CERTIFICADO ENVIADO A CLIENTE ANTIGO
-- ===========================================================================

ALTER TABLE "CertificadoEnvio" ALTER COLUMN "clienteId" DROP NOT NULL;

ALTER TABLE "CertificadoEnvio"
  ADD COLUMN IF NOT EXISTS "clienteNomeHistorico" TEXT;

-- O indice existente cobre ("clienteId", "enviadoEm"). Com clienteId nulo ele
-- deixa de servir a busca pelo historico; este cobre o caso.
CREATE INDEX IF NOT EXISTS "CertificadoEnvio_clienteNomeHistorico_idx"
  ON "CertificadoEnvio" ("clienteNomeHistorico");

-- ===========================================================================
-- 2. CATEGORIAS DE RECEITA — Float, Setup, Sustentacao
--
-- Recriadas SOMENTE se ausentes. A dupla checagem (natureza E nome) evita
-- criar uma segunda "Float" quando ja existe uma categoria com esse nome mas
-- sem natureza — nesse caso o UPDATE abaixo e que resolve.
-- ===========================================================================

-- Primeiro adota categorias que ja existem pelo nome e estao sem natureza.
UPDATE "CategoriaFinanceira" SET "natureza" = 'FLOAT'::"CategoriaNatureza"
WHERE "tipo" = 'RECEITA' AND "natureza" IS NULL AND lower("nome") LIKE 'float%';

UPDATE "CategoriaFinanceira" SET "natureza" = 'SETUP'::"CategoriaNatureza"
WHERE "tipo" = 'RECEITA' AND "natureza" IS NULL AND lower("nome") LIKE 'setup%';

UPDATE "CategoriaFinanceira" SET "natureza" = 'SUSTENTACAO'::"CategoriaNatureza"
WHERE "tipo" = 'RECEITA' AND "natureza" IS NULL AND lower("nome") LIKE 'sustenta%';

-- Depois cria as que faltarem.
INSERT INTO "CategoriaFinanceira" ("id","nome","tipo","natureza","ativo","createdAt","updatedAt")
SELECT 'cat_rec_float', 'Float', 'RECEITA', 'FLOAT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo"='RECEITA' AND "natureza"='FLOAT')
  AND NOT EXISTS (SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo"='RECEITA' AND "nome"='Float');

INSERT INTO "CategoriaFinanceira" ("id","nome","tipo","natureza","ativo","createdAt","updatedAt")
SELECT 'cat_rec_setup', 'Setup', 'RECEITA', 'SETUP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo"='RECEITA' AND "natureza"='SETUP')
  AND NOT EXISTS (SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo"='RECEITA' AND "nome"='Setup');

INSERT INTO "CategoriaFinanceira" ("id","nome","tipo","natureza","ativo","createdAt","updatedAt")
SELECT 'cat_rec_sustentacao', 'Sustentação', 'RECEITA', 'SUSTENTACAO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo"='RECEITA' AND "natureza"='SUSTENTACAO')
  AND NOT EXISTS (SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo"='RECEITA' AND "nome"='Sustentação');

-- Tabela nova desta rodada nao existe; RLS da v18 continua valendo para todas.

COMMIT;

-- ===========================================================================
-- RELATORIO
-- ===========================================================================

DO $$
DECLARE
  n_envios BIGINT; n_hist BIGINT; n_cat BIGINT; n_nat BIGINT;
  col_nullable TEXT; n_sem_rls BIGINT;
BEGIN
  SELECT count(*) INTO n_envios FROM "CertificadoEnvio";
  SELECT count(*) INTO n_hist   FROM "CertificadoEnvio" WHERE "clienteNomeHistorico" IS NOT NULL;
  SELECT count(*) INTO n_cat    FROM "CategoriaFinanceira";
  SELECT count(*) INTO n_nat    FROM "CategoriaFinanceira" WHERE "natureza" IS NOT NULL;
  SELECT is_nullable INTO col_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='CertificadoEnvio' AND column_name='clienteId';
  SELECT count(*) INTO n_sem_rls FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;

  RAISE NOTICE '--- migration v19 aplicada ---';
  RAISE NOTICE 'CertificadoEnvio.clienteId nullable: %', col_nullable;
  RAISE NOTICE 'envios de certificado:              %', n_envios;
  RAISE NOTICE '  com nome historico:               %', n_hist;
  RAISE NOTICE 'categorias financeiras:             %', n_cat;
  RAISE NOTICE '  com natureza (esperado >= 3):     %', n_nat;
  RAISE NOTICE 'tabelas sem RLS (deve ser 0):       %', n_sem_rls;

  IF col_nullable <> 'YES' THEN
    RAISE EXCEPTION 'CertificadoEnvio.clienteId continua NOT NULL.';
  END IF;
  IF n_nat < 3 THEN
    RAISE EXCEPTION 'Faltam categorias de receita com natureza: % de 3.', n_nat;
  END IF;
  IF n_sem_rls > 0 THEN
    RAISE EXCEPTION 'RLS da v18 regrediu: % tabela(s) sem RLS.', n_sem_rls;
  END IF;
END $$;
