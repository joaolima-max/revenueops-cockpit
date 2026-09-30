-- Migration v17: resultado do pipeline, metas percentuais, contas a pagar e
--                receita por parceiro
--
-- POR QUE EXISTE
--   1. PIPELINE — Ganho e Perdido deixam de ser ETAPAS e passam a ser o
--      RESULTADO do card (Deal.resultado). As duas colunas do funil de Vendas
--      saem do quadro; os cards que estavam nelas voltam para a etapa em que
--      o processo realmente parou, carregando o desfecho.
--   2. METAS — ganham direcao (maior/menor e melhor) e unidade, para que uma
--      meta de MED em 2% possa ser avaliada corretamente.
--   3. FINANCEIRO — lancamento ganha data de vencimento (Contas a Pagar),
--      fornecedor e vinculo opcional com BaaS/White Label; a categoria ganha
--      natureza (Float/Setup/Sustentacao); a condicao comercial ganha
--      mensalidade de conta ativa e data de inicio da sustentacao.
--   4. CARD — anotacoes (DealComentario) e historico de mudanca de resultado.
--
-- ESTRATEGIA: COMPATIVEL, NAO DESTRUTIVA
--
--   Nao ha DROP TABLE, DROP COLUMN, DROP TYPE, TRUNCATE, DELETE de dado
--   historico nem RESET. Tudo o que esta aqui e ADITIVO, com duas excecoes que
--   nao destroem nada:
--
--     * UPDATE em "Deal" — move cards que estavam nas etapas Ganho/Perdido
--       para a ultima etapa NORMAL do funil, gravando o desfecho em
--       `resultado`. Nenhum card e perdido; a informacao "ganhou/perdeu", que
--       antes so existia como posicao de coluna, passa a ser um campo.
--     * UPDATE em "PipelineEtapa" — inativa as etapas Ganho e Perdido. Elas
--       CONTINUAM existindo, porque PipelineMovimentacao as referencia como
--       origem e destino: apaga-las reescreveria o historico do pipeline.
--
--   Deal.value continua no banco, agora com DEFAULT 0. O card nao tem mais
--   valor financeiro na aplicacao; o dado antigo nao e zerado.
--
-- ORDEM DE IMPLANTACAO
--   Esta migration e aplicada ANTES do deploy. Tudo o que ela adiciona tem
--   DEFAULT ou e nulavel, entao o codigo ANTIGO continua funcionando durante
--   a janela entre a migration e o deploy.
--
-- Idempotente. Rodar duas vezes nao causa erro nem duplica dado.

BEGIN;

-- ===========================================================================
-- 0. INVENTARIO ANTES
-- ===========================================================================

DO $$
DECLARE
  n_deals BIGINT; n_mov BIGINT; n_lanc BIGINT; n_metas BIGINT; n_cond BIGINT;
BEGIN
  SELECT count(*) INTO n_deals FROM "Deal";
  SELECT count(*) INTO n_mov   FROM "PipelineMovimentacao";
  SELECT count(*) INTO n_lanc  FROM "LancamentoFinanceiro";
  SELECT count(*) INTO n_metas FROM "Meta";
  SELECT count(*) INTO n_cond  FROM "CondicaoComercial";
  RAISE NOTICE '--- antes da v17 ---';
  RAISE NOTICE 'cards (Deal):                  %', n_deals;
  RAISE NOTICE 'movimentacoes de pipeline:     %', n_mov;
  RAISE NOTICE 'lancamentos financeiros:       %', n_lanc;
  RAISE NOTICE 'metas:                         %', n_metas;
  RAISE NOTICE 'condicoes comerciais:          %', n_cond;
END $$;

-- ===========================================================================
-- 1. TIPOS NOVOS
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE "ResultadoCard" AS ENUM ('EM_ANDAMENTO', 'GANHO', 'PERDIDO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MetaDirecao" AS ENUM ('MAIOR_MELHOR', 'MENOR_MELHOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MetaUnidade" AS ENUM ('VALOR', 'QUANTIDADE', 'PERCENTUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CategoriaNatureza" AS ENUM ('FLOAT', 'SETUP', 'SUSTENTACAO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Valores novos em enums existentes. ADD VALUE IF NOT EXISTS e idempotente e
-- nao reescreve nenhuma linha.
ALTER TYPE "MovimentacaoTipo" ADD VALUE IF NOT EXISTS 'MUDANCA_RESULTADO';
ALTER TYPE "MetaTipo"         ADD VALUE IF NOT EXISTS 'MED_PERCENTUAL';
ALTER TYPE "MetaTipo"         ADD VALUE IF NOT EXISTS 'TAKE_RATE';

COMMIT;

-- Postgres nao deixa usar um valor de enum acrescentado na MESMA transacao
-- que o criou. A parte que escreve dado usando 'MUDANCA_RESULTADO' fica,
-- portanto, na transacao seguinte.
BEGIN;

-- ===========================================================================
-- 2. PIPELINE — RESULTADO DO CARD
-- ===========================================================================

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "resultado"   "ResultadoCard" NOT NULL DEFAULT 'EM_ANDAMENTO',
  ADD COLUMN IF NOT EXISTS "resultadoEm" TIMESTAMP(3);

-- O card nao tem mais valor financeiro. A coluna fica (historico), agora com
-- default para que a criacao nao precise informar nada.
ALTER TABLE "Deal" ALTER COLUMN "value" SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Deal_resultado_idx" ON "Deal" ("resultado");

-- Anotacoes do card.
CREATE TABLE IF NOT EXISTS "DealComentario" (
  "id"        TEXT PRIMARY KEY,
  "dealId"    TEXT NOT NULL,
  "autorId"   TEXT NOT NULL,
  "texto"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealComentario_dealId_fkey"  FOREIGN KEY ("dealId")
    REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DealComentario_autorId_fkey" FOREIGN KEY ("autorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DealComentario_dealId_createdAt_idx"
  ON "DealComentario" ("dealId", "createdAt");

-- Historico da mudanca de resultado.
ALTER TABLE "PipelineMovimentacao"
  ADD COLUMN IF NOT EXISTS "resultadoAnterior" "ResultadoCard",
  ADD COLUMN IF NOT EXISTS "resultadoNovo"     "ResultadoCard";

-- ---------------------------------------------------------------------------
-- 2.1 BACKFILL — cards que moravam nas colunas Ganho / Perdido
--
-- Para cada card numa etapa de tipo GANHO ou PERDIDO:
--   * `resultado`   recebe o desfecho que a coluna representava;
--   * `resultadoEm` recebe `closedAt`, ou o updatedAt do card;
--   * `etapaId`     volta para a ULTIMA etapa NORMAL do mesmo funil — que e
--                   onde o processo comercial de fato terminou. Sem isso o
--                   card ficaria numa coluna que sai do quadro.
--
-- So altera cards que ainda estao em etapa de encerramento; rodar de novo nao
-- encontra nenhum e nao faz nada.
-- ---------------------------------------------------------------------------

WITH ultima_normal AS (
  SELECT DISTINCT ON (e."funilId") e."funilId", e."id" AS "etapaId"
  FROM "PipelineEtapa" e
  WHERE e."tipo" = 'NORMAL' AND e."ativo"
  ORDER BY e."funilId", e."ordem" DESC
),
alvos AS (
  SELECT d."id" AS "dealId",
         e."tipo"::text AS "desfecho",
         un."etapaId"   AS "novaEtapa"
  FROM "Deal" d
  JOIN "PipelineEtapa" e ON e."id" = d."etapaId"
  LEFT JOIN ultima_normal un ON un."funilId" = e."funilId"
  WHERE e."tipo" IN ('GANHO', 'PERDIDO')
)
UPDATE "Deal" d
SET "resultado"   = a."desfecho"::"ResultadoCard",
    "resultadoEm" = COALESCE(d."closedAt", d."updatedAt"),
    "closedAt"    = COALESCE(d."closedAt", d."updatedAt"),
    "etapaId"     = COALESCE(a."novaEtapa", d."etapaId")
FROM alvos a
WHERE d."id" = a."dealId";

-- O `stage` legado tambem descrevia o desfecho. Cards ja marcados como
-- GANHO/PERDIDO ali, mas que nao estavam numa coluna de encerramento, recebem
-- o resultado correspondente.
UPDATE "Deal"
SET "resultado"   = "stage"::text::"ResultadoCard",
    "resultadoEm" = COALESCE("closedAt", "updatedAt")
WHERE "stage" IN ('GANHO', 'PERDIDO')
  AND "resultado" = 'EM_ANDAMENTO';

-- Uma linha de historico para cada card cujo desfecho foi reconstruido, para
-- que a mudanca apareca na linha do tempo em vez de surgir do nada.
INSERT INTO "PipelineMovimentacao" (
  "id", "dealId", "tipo", "funilOrigemId", "etapaOrigemId",
  "funilDestinoId", "etapaDestinoId", "resultadoAnterior", "resultadoNovo",
  "userId", "observacao", "createdAt"
)
SELECT
  'mv17_' || d."id",
  d."id",
  'MUDANCA_RESULTADO',
  NULL, NULL,
  d."funilId", d."etapaId",
  'EM_ANDAMENTO', d."resultado",
  d."ownerId",
  'Desfecho reconstruido na migration v17: Ganho e Perdido deixaram de ser etapas.',
  COALESCE(d."resultadoEm", CURRENT_TIMESTAMP)
FROM "Deal" d
WHERE d."resultado" <> 'EM_ANDAMENTO'
  AND d."funilId" IS NOT NULL
  AND d."etapaId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "PipelineMovimentacao" m WHERE m."id" = 'mv17_' || d."id");

-- ---------------------------------------------------------------------------
-- 2.2 As colunas Ganho e Perdido saem do quadro
--
-- INATIVADAS, nao excluidas: PipelineMovimentacao as referencia como origem e
-- destino, e apagar a etapa levaria o historico junto (ON DELETE RESTRICT
-- barraria, ou um CASCADE reescreveria o passado). O quadro so mostra etapas
-- ativas, entao inativar e o suficiente para elas sumirem das colunas.
-- ---------------------------------------------------------------------------

UPDATE "PipelineEtapa"
SET "ativo" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "tipo" IN ('GANHO', 'PERDIDO') AND "ativo";

-- ===========================================================================
-- 3. METAS — DIRECAO E UNIDADE
-- ===========================================================================

ALTER TABLE "Meta"
  ADD COLUMN IF NOT EXISTS "direcao" "MetaDirecao" NOT NULL DEFAULT 'MAIOR_MELHOR',
  ADD COLUMN IF NOT EXISTS "unidade" "MetaUnidade" NOT NULL DEFAULT 'VALOR';

-- Backfill honesto das metas que ja existem:
--   * MEDS e contagem, e menos e melhor;
--   * TRANSACOES e CLIENTES_ATIVOS sao contagem, e mais e melhor;
--   * o resto e valor monetario, e mais e melhor (o default ja cobre).
UPDATE "Meta" SET "unidade" = 'QUANTIDADE'
WHERE "tipo" IN ('MEDS', 'TRANSACOES', 'CLIENTES_ATIVOS') AND "unidade" = 'VALOR';

UPDATE "Meta" SET "direcao" = 'MENOR_MELHOR'
WHERE "tipo" = 'MEDS' AND "direcao" = 'MAIOR_MELHOR';

-- ===========================================================================
-- 4. FINANCEIRO
-- ===========================================================================

-- 4.1 Natureza da categoria ------------------------------------------------
ALTER TABLE "CategoriaFinanceira"
  ADD COLUMN IF NOT EXISTS "natureza" "CategoriaNatureza";

CREATE INDEX IF NOT EXISTS "CategoriaFinanceira_natureza_idx"
  ON "CategoriaFinanceira" ("natureza");

-- Categorias de receita ja cadastradas com esses nomes passam a ser
-- reconhecidas pelos graficos. Prefixo em minusculas resolve "Sustentacao" e
-- "Sustentação" sem depender da extensao unaccent.
UPDATE "CategoriaFinanceira"
SET "natureza" = 'FLOAT'::"CategoriaNatureza"
WHERE "tipo" = 'RECEITA' AND "natureza" IS NULL AND lower("nome") LIKE 'float%';

UPDATE "CategoriaFinanceira"
SET "natureza" = 'SETUP'::"CategoriaNatureza"
WHERE "tipo" = 'RECEITA' AND "natureza" IS NULL AND lower("nome") LIKE 'setup%';

UPDATE "CategoriaFinanceira"
SET "natureza" = 'SUSTENTACAO'::"CategoriaNatureza"
WHERE "tipo" = 'RECEITA' AND "natureza" IS NULL AND lower("nome") LIKE 'sustenta%';

-- As tres categorias de receita existem sempre: sem elas o produto nao teria
-- onde classificar Float, Setup e Sustentacao, e os graficos correspondentes
-- ficariam sem fonte. Criadas so se faltarem.
INSERT INTO "CategoriaFinanceira" ("id", "nome", "tipo", "natureza", "ativo", "createdAt", "updatedAt")
SELECT 'cat_rec_float', 'Float', 'RECEITA', 'FLOAT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo" = 'RECEITA' AND "natureza" = 'FLOAT'
) AND NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo" = 'RECEITA' AND "nome" = 'Float'
);

INSERT INTO "CategoriaFinanceira" ("id", "nome", "tipo", "natureza", "ativo", "createdAt", "updatedAt")
SELECT 'cat_rec_setup', 'Setup', 'RECEITA', 'SETUP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo" = 'RECEITA' AND "natureza" = 'SETUP'
) AND NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo" = 'RECEITA' AND "nome" = 'Setup'
);

INSERT INTO "CategoriaFinanceira" ("id", "nome", "tipo", "natureza", "ativo", "createdAt", "updatedAt")
SELECT 'cat_rec_sustentacao', 'Sustentação', 'RECEITA', 'SUSTENTACAO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo" = 'RECEITA' AND "natureza" = 'SUSTENTACAO'
) AND NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE "tipo" = 'RECEITA' AND "nome" = 'Sustentação'
);

-- 4.2 Lancamento: vencimento, fornecedor, parceiro e recorrencia -----------
ALTER TABLE "LancamentoFinanceiro"
  ADD COLUMN IF NOT EXISTS "dataVencimento"       DATE,
  ADD COLUMN IF NOT EXISTS "recorrenteIndefinido" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recorrenciaFim"       DATE,
  ADD COLUMN IF NOT EXISTS "fornecedorId"         TEXT,
  ADD COLUMN IF NOT EXISTS "condicaoId"           TEXT;

DO $$ BEGIN
  ALTER TABLE "LancamentoFinanceiro"
    ADD CONSTRAINT "LancamentoFinanceiro_fornecedorId_fkey"
    FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LancamentoFinanceiro"
    ADD CONSTRAINT "LancamentoFinanceiro_condicaoId_fkey"
    FOREIGN KEY ("condicaoId") REFERENCES "CondicaoComercial"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_dataVencimento_idx"
  ON "LancamentoFinanceiro" ("dataVencimento");
CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_fornecedorId_idx"
  ON "LancamentoFinanceiro" ("fornecedorId");
CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_condicaoId_idx"
  ON "LancamentoFinanceiro" ("condicaoId");

-- Despesas que ja existem nunca tiveram vencimento informado. Em vez de
-- inventar uma data, adotamos a data de lancamento: e a unica informacao
-- verdadeira disponivel, e mantem Contas a Pagar consistente com o que a tela
-- de Lancamentos ja mostrava. Receitas ficam sem vencimento, que e o correto.
UPDATE "LancamentoFinanceiro"
SET "dataVencimento" = "data"
WHERE "tipo" = 'DESPESA' AND "dataVencimento" IS NULL;

-- 4.3 Condicao comercial: conta ativa e inicio da sustentacao --------------
ALTER TABLE "CondicaoComercial"
  ADD COLUMN IF NOT EXISTS "mensalidadeContaAtiva" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "sustentacaoInicio"     DATE;

COMMIT;

-- ===========================================================================
-- RELATORIO
-- ===========================================================================

DO $$
DECLARE
  n_deals      BIGINT; n_ganhos BIGINT; n_perdidos BIGINT; n_andamento BIGINT;
  n_etapas_off BIGINT; n_mov BIGINT; n_lanc BIGINT; n_venc BIGINT;
  n_metas BIGINT; n_cond BIGINT; n_cat_nat BIGINT; n_comentarios BIGINT;
BEGIN
  SELECT count(*) INTO n_deals      FROM "Deal";
  SELECT count(*) INTO n_ganhos     FROM "Deal" WHERE "resultado" = 'GANHO';
  SELECT count(*) INTO n_perdidos   FROM "Deal" WHERE "resultado" = 'PERDIDO';
  SELECT count(*) INTO n_andamento  FROM "Deal" WHERE "resultado" = 'EM_ANDAMENTO';
  SELECT count(*) INTO n_etapas_off FROM "PipelineEtapa" WHERE "tipo" <> 'NORMAL';
  SELECT count(*) INTO n_mov        FROM "PipelineMovimentacao";
  SELECT count(*) INTO n_lanc       FROM "LancamentoFinanceiro";
  SELECT count(*) INTO n_venc       FROM "LancamentoFinanceiro" WHERE "dataVencimento" IS NOT NULL;
  SELECT count(*) INTO n_metas      FROM "Meta";
  SELECT count(*) INTO n_cond       FROM "CondicaoComercial";
  SELECT count(*) INTO n_cat_nat    FROM "CategoriaFinanceira" WHERE "natureza" IS NOT NULL;
  SELECT count(*) INTO n_comentarios FROM "DealComentario";

  RAISE NOTICE '--- migration v17 aplicada ---';
  RAISE NOTICE 'cards (Deal):                  %', n_deals;
  RAISE NOTICE '  em andamento / ganho / perdido: % / % / %', n_andamento, n_ganhos, n_perdidos;
  RAISE NOTICE 'etapas Ganho/Perdido (inativas): %', n_etapas_off;
  RAISE NOTICE 'movimentacoes de pipeline:     %', n_mov;
  RAISE NOTICE 'lancamentos financeiros:       % (com vencimento: %)', n_lanc, n_venc;
  RAISE NOTICE 'categorias com natureza:       %', n_cat_nat;
  RAISE NOTICE 'metas:                         %', n_metas;
  RAISE NOTICE 'condicoes comerciais:          %', n_cond;
  RAISE NOTICE 'anotacoes de card:             %', n_comentarios;
  RAISE NOTICE 'nenhuma tabela, coluna, tipo ou linha historica foi removida.';
END $$;
