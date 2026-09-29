-- Migration v16: remodelagem funcional de operacoes e financeiro
--
-- POR QUE EXISTE
--   Esta rodada retira do produto seis ambientes (Relatorios, Documentos,
--   Alertas, Parametros, Formularios, Automacoes), enxuga o cadastro de
--   Cliente e cria o ambiente Financeiro com seus quatro registros novos
--   (categorias, fornecedores, lancamentos, condicoes comerciais BaaS).
--
-- PRINCIPIOS SEGUIDOS AQUI
--   * Nenhum RESET, TRUNCATE ou DROP SCHEMA.
--   * Nada que sai e apagado sem antes ser copiado para o arquivo morto
--     `ArquivoRemocaoV16` — colunas de Cliente, titulos de pendencia, valor de
--     Lead, respostas de formulario e definicoes de automacao. O produto nao
--     mostra mais esses dados, mas eles continuam auditaveis.
--   * Historico financeiro, de taxas, de Pipeline e de Compliance: intocados.
--   * Idempotente. Rodar duas vezes nao causa erro nem duplica arquivo morto.
--
-- ORDEM
--   1. arquivo morto            6. Compliance / Lead
--   2. enums e tabelas novas    7. Cliente
--   3. Documento                8. remocao das tabelas dos ambientes que sairam
--   4. LancamentoDiario         9. usuarios/equipes
--   5. FollowUp
--
-- Ao final, um bloco de NOTICE informa o que foi tocado.

BEGIN;

-- ===========================================================================
-- 1. ARQUIVO MORTO
--    Uma linha por valor retirado do produto. Nao e modelo de dominio: e o
--    recibo desta migration, e por isso fica fora do schema.prisma.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "ArquivoRemocaoV16" (
  id          BIGSERIAL PRIMARY KEY,
  entidade    TEXT        NOT NULL,
  entidade_id TEXT,
  campo       TEXT        NOT NULL,
  valor       TEXT,
  arquivado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE "ArquivoRemocaoV16" IS
  'Arquivo morto da migration v16. Valores retirados do produto, preservados para auditoria. Nao consultado pela aplicacao.';

-- A guarda de idempotencia: cada bloco abaixo so arquiva se ainda nao arquivou.
CREATE UNIQUE INDEX IF NOT EXISTS "ArquivoRemocaoV16_unico"
  ON "ArquivoRemocaoV16" (entidade, entidade_id, campo);

-- ===========================================================================
-- 2. ENUMS E TABELAS NOVAS DO FINANCEIRO
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE "TipoLancamento" AS ENUM ('RECEITA', 'DESPESA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PeriodicidadeLancamento" AS ENUM ('UNICA', 'RECORRENTE', 'PARCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusLancamento" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TipoParceiro" AS ENUM ('BAAS', 'WHITE_LABEL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CategoriaFinanceira" (
  "id"        TEXT PRIMARY KEY,
  "nome"      TEXT NOT NULL,
  "tipo"      "TipoLancamento" NOT NULL,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CategoriaFinanceira_nome_tipo_key"
  ON "CategoriaFinanceira" ("nome", "tipo");
CREATE INDEX IF NOT EXISTS "CategoriaFinanceira_tipo_ativo_idx"
  ON "CategoriaFinanceira" ("tipo", "ativo");

CREATE TABLE IF NOT EXISTS "Fornecedor" (
  "id"               TEXT PRIMARY KEY,
  "razaoSocial"      TEXT NOT NULL,
  "cnpj"             TEXT,
  "chavePix"         TEXT,
  "descricaoServico" TEXT,
  "categoriaId"      TEXT,
  "ativo"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Fornecedor_categoriaId_fkey" FOREIGN KEY ("categoriaId")
    REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Fornecedor_ativo_idx" ON "Fornecedor" ("ativo");
CREATE INDEX IF NOT EXISTS "Fornecedor_categoriaId_idx" ON "Fornecedor" ("categoriaId");

CREATE TABLE IF NOT EXISTS "LancamentoFinanceiro" (
  "id"            TEXT PRIMARY KEY,
  "tipo"          "TipoLancamento" NOT NULL,
  "descricao"     TEXT NOT NULL,
  "categoriaId"   TEXT NOT NULL,
  "valor"         DOUBLE PRECISION NOT NULL,
  "data"          DATE NOT NULL,
  "status"        "StatusLancamento" NOT NULL DEFAULT 'PENDENTE',
  "observacao"    TEXT,
  "periodicidade" "PeriodicidadeLancamento" NOT NULL DEFAULT 'UNICA',
  "grupoId"       TEXT,
  "parcela"       INTEGER,
  "totalParcelas" INTEGER,
  "criadoPorId"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LancamentoFinanceiro_categoriaId_fkey" FOREIGN KEY ("categoriaId")
    REFERENCES "CategoriaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LancamentoFinanceiro_criadoPorId_fkey" FOREIGN KEY ("criadoPorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_data_idx" ON "LancamentoFinanceiro" ("data");
CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_tipo_data_idx" ON "LancamentoFinanceiro" ("tipo", "data");
CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_categoriaId_idx" ON "LancamentoFinanceiro" ("categoriaId");
CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_grupoId_idx" ON "LancamentoFinanceiro" ("grupoId");
CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_status_idx" ON "LancamentoFinanceiro" ("status");

CREATE TABLE IF NOT EXISTS "LancamentoAnexo" (
  "id"           TEXT PRIMARY KEY,
  "lancamentoId" TEXT NOT NULL,
  "documentoId"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LancamentoAnexo_lancamentoId_fkey" FOREIGN KEY ("lancamentoId")
    REFERENCES "LancamentoFinanceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LancamentoAnexo_documentoId_fkey" FOREIGN KEY ("documentoId")
    REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoAnexo_documentoId_key" ON "LancamentoAnexo" ("documentoId");
CREATE INDEX IF NOT EXISTS "LancamentoAnexo_lancamentoId_idx" ON "LancamentoAnexo" ("lancamentoId");

CREATE TABLE IF NOT EXISTS "CondicaoComercial" (
  "id"               TEXT PRIMARY KEY,
  "nomeFantasia"     TEXT NOT NULL,
  "identificacao"    TEXT NOT NULL,
  "tipo"             "TipoParceiro" NOT NULL,
  "pix"              DOUBLE PRECISION,
  "kyc"              DOUBLE PRECISION,
  "sustentacao"      DOUBLE PRECISION,
  "apiMensal"        DOUBLE PRECISION,
  "overpricePercent" DOUBLE PRECISION,
  "ativo"            BOOLEAN NOT NULL DEFAULT true,
  "observacao"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CondicaoComercial_identificacao_key"
  ON "CondicaoComercial" ("identificacao");
CREATE INDEX IF NOT EXISTS "CondicaoComercial_tipo_ativo_idx"
  ON "CondicaoComercial" ("tipo", "ativo");

CREATE TABLE IF NOT EXISTS "CondicaoComercialHistorico" (
  "id"            TEXT PRIMARY KEY,
  "condicaoId"    TEXT NOT NULL,
  "campo"         TEXT NOT NULL,
  "valorAnterior" TEXT,
  "valorNovo"     TEXT,
  "userId"        TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CondicaoComercialHistorico_condicaoId_fkey" FOREIGN KEY ("condicaoId")
    REFERENCES "CondicaoComercial"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CondicaoComercialHistorico_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CondicaoComercialHistorico_condicaoId_createdAt_idx"
  ON "CondicaoComercialHistorico" ("condicaoId", "createdAt");

-- ===========================================================================
-- 3. DOCUMENTO — anexo sem cliente
--    O ambiente "Documentos" saiu, mas a capacidade de anexar arquivo
--    permanece onde o produto exige: lancamento financeiro e ZIP de
--    certificado (estoque global, sem cliente). Por isso clienteId passa a
--    aceitar nulo.
-- ===========================================================================

ALTER TABLE "Documento" ALTER COLUMN "clienteId" DROP NOT NULL;

ALTER TYPE "DocumentoOrigem" ADD VALUE IF NOT EXISTS 'LANCAMENTO_FINANCEIRO';

-- ===========================================================================
-- 4. LANCAMENTO DIARIO — clientes ativos
--    Fotografia do dia, na mesma convencao de saldoEmConta. Nulo = nao
--    informado, que e diferente de zero cliente ativo.
-- ===========================================================================

ALTER TABLE "LancamentoDiario" ADD COLUMN IF NOT EXISTS "clientesAtivos" INTEGER;

-- ===========================================================================
-- 5. FOLLOW-UP — "frequencia" deixa de ser a nomenclatura
--    Renomeacao, nao recriacao: o dado de cadencia existente e preservado.
-- ===========================================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'FollowUp' AND column_name = 'frequenciaDias'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'FollowUp' AND column_name = 'picoIntervaloDias'
  ) THEN
    ALTER TABLE "FollowUp" RENAME COLUMN "frequenciaDias" TO "picoIntervaloDias";
  END IF;
END $$;

ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "picoIntervaloDias" INTEGER;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'FollowUpTipo' AND e.enumlabel = 'PICO_OPERACIONAL'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'FollowUpTipo' AND e.enumlabel = 'PICO_TRANSACIONAL'
  ) THEN
    ALTER TYPE "FollowUpTipo" RENAME VALUE 'PICO_OPERACIONAL' TO 'PICO_TRANSACIONAL';
  END IF;
END $$;

-- ===========================================================================
-- 6. COMPLIANCE e LEAD — campos que saem do cadastro
--    Arquivados antes de cair: "titulo" e texto escrito por pessoa e
--    "value" e numero informado pelo comercial.
-- ===========================================================================

INSERT INTO "ArquivoRemocaoV16" (entidade, entidade_id, campo, valor)
SELECT 'PendenciaCompliance', p."id", 'titulo', p."titulo"
FROM "PendenciaCompliance" p
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'PendenciaCompliance' AND column_name = 'titulo'
)
ON CONFLICT (entidade, entidade_id, campo) DO NOTHING;

ALTER TABLE "PendenciaCompliance" DROP COLUMN IF EXISTS "titulo";

INSERT INTO "ArquivoRemocaoV16" (entidade, entidade_id, campo, valor)
SELECT 'Lead', l."id", 'value', l."value"::text
FROM "Lead" l
WHERE l."value" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Lead' AND column_name = 'value'
  )
ON CONFLICT (entidade, entidade_id, campo) DO NOTHING;

ALTER TABLE "Lead" DROP COLUMN IF EXISTS "value";

-- ===========================================================================
-- 7. CLIENTE — cadastro comercial enxuto
--    Permanecem: nome, cnpj, modeloOperacional, email, telefone, segmento,
--    dataFechamento, mensalidadeApi (parcela do MRR), status,
--    dataEncerramento, notas, owner, gestor.
--
--    Saem os campos de expectativa financeira e o Score de Risco. Nenhum deles
--    era fonte de verdade: realizado vem de LancamentoDiario, condicoes de
--    BaaS/White Label vem de CondicaoComercial e o minimo contratual de
--    transacoes vem de VolumetriaMinima.
-- ===========================================================================

DO $$
DECLARE
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'operacao', 'scoreRisco', 'sustentacaoWhiteLabel', 'setup', 'tpvEsperado',
    'qtdTransacoesEsperada', 'qtdMedEsperada', 'receitaPrevistaMensal',
    'descontoPercent', 'overpricePercent'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Cliente' AND column_name = col
    ) THEN
      EXECUTE format(
        'INSERT INTO "ArquivoRemocaoV16" (entidade, entidade_id, campo, valor)
         SELECT ''Cliente'', c."id", %L, c.%I::text
         FROM "Cliente" c WHERE c.%I IS NOT NULL
         ON CONFLICT (entidade, entidade_id, campo) DO NOTHING',
        col, col, col
      );
      EXECUTE format('ALTER TABLE "Cliente" DROP COLUMN %I', col);
    END IF;
  END LOOP;
END $$;

-- ScoreRisco so era usado pela coluna acima.
DROP TYPE IF EXISTS "ScoreRisco";

-- ===========================================================================
-- 8. AMBIENTES QUE SAIRAM DO PRODUTO
--
--    Formularios e Automacoes deixam de existir como produto. O conteudo
--    gerado por pessoas — respostas de formulario e a definicao das regras de
--    automacao — vai para o arquivo morto como JSON antes das tabelas cairem.
--    Parametros sai como ambiente e a tabela nao tem mais leitor: o unico
--    parametro com consumidor ativo era o multiplicador do Float, que vive em
--    FloatConfig (preservado) e nao aqui.
-- ===========================================================================

-- Respostas de formulario: conteudo enviado por cliente.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'FormularioResposta') THEN
    INSERT INTO "ArquivoRemocaoV16" (entidade, entidade_id, campo, valor)
    SELECT 'FormularioResposta', r."id", 'resposta',
           jsonb_build_object(
             'versaoId', r."versaoId", 'clienteId', r."clienteId",
             'status', r."status"::text, 'enviadaEm', r."enviadaEm",
             'valores', r."valores"
           )::text
    FROM "FormularioResposta" r
    ON CONFLICT (entidade, entidade_id, campo) DO NOTHING;
  END IF;
END $$;

-- Definicao das versoes de formulario: a estrutura que interpretava as respostas.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'FormularioVersao') THEN
    INSERT INTO "ArquivoRemocaoV16" (entidade, entidade_id, campo, valor)
    SELECT 'FormularioVersao', v."id", 'definicao', v."definicao"::text
    FROM "FormularioVersao" v
    ON CONFLICT (entidade, entidade_id, campo) DO NOTHING;
  END IF;
END $$;

-- Regras de automacao.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Automacao') THEN
    INSERT INTO "ArquivoRemocaoV16" (entidade, entidade_id, campo, valor)
    SELECT 'Automacao', a."id", 'regra',
           jsonb_build_object(
             'nome', a."nome", 'ativo', a."ativo", 'gatilho', a."gatilho"::text,
             'acao', a."acao"::text, 'condicao', a."condicao",
             'funilId', a."funilId", 'etapaId', a."etapaId"
           )::text
    FROM "Automacao" a
    ON CONFLICT (entidade, entidade_id, campo) DO NOTHING;
  END IF;
END $$;

-- Parametros configurados.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Parametro') THEN
    INSERT INTO "ArquivoRemocaoV16" (entidade, entidade_id, campo, valor)
    SELECT 'Parametro', p."id", p."chave", p."valor"
    FROM "Parametro" p
    ON CONFLICT (entidade, entidade_id, campo) DO NOTHING;
  END IF;
END $$;

-- Na ordem das dependencias (filho antes do pai).
DROP TABLE IF EXISTS "FormularioAnexo";
DROP TABLE IF EXISTS "FormularioResposta";
DROP TABLE IF EXISTS "FormularioLink";
DROP TABLE IF EXISTS "FormularioVersao";
DROP TABLE IF EXISTS "Formulario";
DROP TABLE IF EXISTS "AutomacaoExecucao";
DROP TABLE IF EXISTS "Automacao";
DROP TABLE IF EXISTS "Parametro";

DROP TYPE IF EXISTS "FormularioRespostaStatus";
DROP TYPE IF EXISTS "AutomacaoExecucaoStatus";
DROP TYPE IF EXISTS "AutomacaoAcao";
DROP TYPE IF EXISTS "AutomacaoGatilho";

-- NAO removidos de proposito:
--   * NotificacaoOrigem.AUTOMACAO e .FORMULARIO — ha notificacoes historicas
--     gravadas com essas origens. Remover o valor do enum quebraria a leitura
--     do passado. A aplicacao nao produz mais nenhuma delas.
--   * DocumentoOrigem.FORMULARIO — mesma razao.
--   * FloatConfig — o Float sai do Cockpit mas segue sendo linha de receita no
--     Conselho, entao a configuracao continua sendo lida.

-- ===========================================================================
-- 9. USUARIOS / EQUIPES
--
--    "Equipe Comercial" e "Equipe Operacional" saem do sistema. Sao
--    DESATIVADOS, nao deletados: os dois possuem registros proprios (leads,
--    deals, clientes, auditoria) e um DELETE violaria as chaves estrangeiras
--    ou exigiria apagar historico de Pipeline e de Compliance — exatamente o
--    que esta rodada proibe.
--
--    Desativado significa: nao autentica, nao aparece em selecao de
--    responsavel, e o rastro do que a pessoa fez continua legivel.
--
--    Os PAPEIS COMERCIAL e OPERACIONAL permanecem: outros usuarios os usam.
-- ===========================================================================

UPDATE "User"
SET "active" = false, "updatedAt" = now()
WHERE "active" = true
  AND (
    lower("name") IN ('equipe comercial', 'equipe operacional', 'comercial', 'operacional')
    OR lower("email") IN ('comercial@revenueops.com.br', 'operacional@revenueops.com.br')
  )
  AND "role" <> 'ADMIN';

-- ===========================================================================
-- RELATORIO
-- ===========================================================================

DO $$
DECLARE
  n_arquivo   BIGINT;
  n_desativ   BIGINT;
  n_clientes  BIGINT;
  n_lanc_dia  BIGINT;
BEGIN
  SELECT count(*) INTO n_arquivo FROM "ArquivoRemocaoV16";
  SELECT count(*) INTO n_desativ FROM "User" WHERE "active" = false;
  SELECT count(*) INTO n_clientes FROM "Cliente";
  SELECT count(*) INTO n_lanc_dia FROM "LancamentoDiario";

  RAISE NOTICE '--- migration v16 aplicada ---';
  RAISE NOTICE 'valores no arquivo morto: %', n_arquivo;
  RAISE NOTICE 'usuarios inativos agora:  %', n_desativ;
  RAISE NOTICE 'clientes preservados:     %', n_clientes;
  RAISE NOTICE 'lancamentos diarios:      %', n_lanc_dia;
  RAISE NOTICE 'confira o arquivo morto com:';
  RAISE NOTICE '  SELECT entidade, campo, count(*) FROM "ArquivoRemocaoV16" GROUP BY 1,2 ORDER BY 1,2;';
END $$;

COMMIT;
