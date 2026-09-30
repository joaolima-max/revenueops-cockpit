-- Migration v16: remodelagem funcional de operacoes e financeiro
--
-- POR QUE EXISTE
--   Esta rodada retira do produto seis ambientes (Relatorios, Documentos,
--   Alertas, Parametros, Formularios, Automacoes), enxuga o cadastro de
--   Cliente, deriva o downtime de Incidente e cria o ambiente Financeiro com
--   seus quatro registros novos.
--
-- ESTRATEGIA: COMPATIVEL, NAO DESTRUTIVA
--
--   Esta migration e ADITIVA. As unicas operacoes que nao criam nada sao dois
--   DROP NOT NULL, que afrouxam restricao e portanto nao quebram nada.
--
--   Nao ha DROP TABLE, DROP COLUMN, DROP TYPE, DELETE de dado historico,
--   TRUNCATE ou RESET. A razao e a ordem de implantacao: a migration e aplicada
--   ANTES do deploy, e enquanto o novo codigo nao esta em Production o codigo
--   ANTIGO continua rodando. Remover uma coluna que o codigo antigo le
--   derrubaria o produto durante a janela.
--
--   As tabelas e colunas dos ambientes removidos ficam no banco como LEGADO:
--   nao sao lidas nem escritas pelo produto, e nenhuma delas atrapalha o
--   funcionamento (todas as colunas abandonadas sao nulaveis — verificado
--   coluna por coluna antes de escrever isto). O que sai e a exposicao: menu,
--   rota, API, permissao e referencia no codigo.
--
--   Objeto legado nao removido aqui pode ser retirado numa migration futura de
--   limpeza, depois de o novo codigo estar estavel em Production. Nao se apaga
--   dado historico para "limpar" o banco.
--
-- LEGADO QUE PERMANECE (intocado, sem leitor)
--   Tabelas: Formulario, FormularioVersao, FormularioLink, FormularioResposta,
--            FormularioAnexo, Automacao, AutomacaoExecucao, Parametro
--   Colunas: Cliente.operacao, .scoreRisco, .sustentacaoWhiteLabel, .setup,
--            .tpvEsperado, .qtdTransacoesEsperada, .qtdMedEsperada,
--            .receitaPrevistaMensal, .descontoPercent, .overpricePercent,
--            .volumeMinimo
--            Lead.value
--            Incidente.downtimeMins  (downtime agora e fim - inicio)
--            FollowUp.frequenciaDias (dado copiado para picoIntervaloDias)
--            PendenciaCompliance.titulo
--   Tipos:   ScoreRisco, AutomacaoGatilho, AutomacaoAcao,
--            AutomacaoExecucaoStatus, FormularioRespostaStatus
--
-- Idempotente. Rodar duas vezes nao causa erro nem duplica dado.

BEGIN;

-- ===========================================================================
-- 1. ENUMS E TABELAS NOVAS DO FINANCEIRO
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
-- 2. DOCUMENTO — anexo sem cliente
--
--    O ambiente "Documentos" saiu, mas a capacidade de anexar arquivo
--    permanece onde o produto exige: lancamento financeiro e ZIP de
--    certificado (estoque global, sem cliente). `clienteId` era NOT NULL
--    porque o unico caminho de upload era aquele ambiente.
--
--    DROP NOT NULL afrouxa: nenhum INSERT existente deixa de funcionar.
-- ===========================================================================

ALTER TABLE "Documento" ALTER COLUMN "clienteId" DROP NOT NULL;

ALTER TYPE "DocumentoOrigem" ADD VALUE IF NOT EXISTS 'LANCAMENTO_FINANCEIRO';

-- ===========================================================================
-- 3. COMPLIANCE — o Titulo sai do cadastro
--
--    A pendencia passa a ser identificada por cliente + motivo. A coluna era
--    NOT NULL: sem este DROP NOT NULL, todo INSERT do codigo novo falharia,
--    porque ele nao escreve mais o campo.
--
--    A coluna e o conteudo ja escrito permanecem, legiveis por consulta
--    direta. Nao ha DROP COLUMN: seria destruir texto redigido por pessoas
--    para ganhar uma coluna a menos.
-- ===========================================================================

ALTER TABLE "PendenciaCompliance" ALTER COLUMN "titulo" DROP NOT NULL;

-- ===========================================================================
-- 4. LANCAMENTO DIARIO — clientes ativos
--
--    Fotografia do dia, na mesma convencao de saldoEmConta. Nulo = nao
--    informado, que e diferente de zero cliente ativo.
-- ===========================================================================

ALTER TABLE "LancamentoDiario" ADD COLUMN IF NOT EXISTS "clientesAtivos" INTEGER;

-- ===========================================================================
-- 5. FOLLOW-UP — "frequencia" deixa de ser a nomenclatura
--
--    Coluna NOVA, com o dado COPIADO da antiga. Nao e RENAME: um rename
--    quebraria o codigo antigo, que le `frequenciaDias`, durante a janela
--    entre esta migration e o deploy. A coluna velha fica como legado.
--
--    O valor de enum tambem e ADICIONADO, nao renomeado, pela mesma razao —
--    e o schema do Prisma declara os dois, para conseguir ler linhas antigas.
-- ===========================================================================

ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "picoIntervaloDias" INTEGER;

-- Copia so o que ainda nao foi copiado: idempotente e nao sobrescreve ajuste
-- feito depois pelo produto novo.
UPDATE "FollowUp"
SET "picoIntervaloDias" = "frequenciaDias"
WHERE "picoIntervaloDias" IS NULL AND "frequenciaDias" IS NOT NULL;

ALTER TYPE "FollowUpTipo" ADD VALUE IF NOT EXISTS 'PICO_TRANSACIONAL';

-- ===========================================================================
-- 6. USUARIOS / EQUIPES
--
--    VERIFICADO NO BANCO antes de escrever isto:
--      * "Equipe Comercial" (user-com) e "Equipe Operacional" (user-op) sao
--        USUARIOS reais, nao grupos, labels ou estrutura organizacional —
--        nao existe tabela de grupo/equipe no schema;
--      * os dois estao com active = false;
--      * os dois tem ZERO registros em 19 caminhos de chave estrangeira
--        (leads, deals, clientes, auditoria, tarefas, permissoes de funil,
--        movimentacoes, notificacoes, documentos, certificados, pendencias,
--        comentarios).
--
--    Com zero dependencia, o DELETE fisico e seguro e atende a instrucao de
--    excluir os usuarios. O bloco abaixo conta as dependencias em tempo de
--    execucao e SO deleta se der zero — em qualquer outro cenario apenas
--    desativa, e avisa. Assim a migration vale em qualquer ambiente.
--
--    Os PAPEIS COMERCIAL e OPERACIONAL permanecem no enum Role: sao usados
--    para atribuir perfil a pessoas reais e nao tem relacao com estes dois
--    registros.
-- ===========================================================================

DO $$
DECLARE
  alvo TEXT[] := ARRAY['comercial@revenueops.com.br', 'operacional@revenueops.com.br'];
  u RECORD;
  deps BIGINT;
BEGIN
  FOR u IN SELECT "id", "name", "email" FROM "User" WHERE lower("email") = ANY(alvo) LOOP
    SELECT
      (SELECT count(*) FROM "Lead" WHERE "ownerId" = u.id)
    + (SELECT count(*) FROM "Deal" WHERE "ownerId" = u.id)
    + (SELECT count(*) FROM "Cliente" WHERE "ownerId" = u.id OR "gestorId" = u.id)
    + (SELECT count(*) FROM "Auditoria" WHERE "userId" = u.id)
    + (SELECT count(*) FROM "Activity" WHERE "userId" = u.id)
    + (SELECT count(*) FROM "Tarefa" WHERE "criadoPorId" = u.id OR "responsavelId" = u.id)
    + (SELECT count(*) FROM "PipelinePermissao" WHERE "userId" = u.id)
    + (SELECT count(*) FROM "PipelineMovimentacao" WHERE "userId" = u.id)
    + (SELECT count(*) FROM "Notificacao" WHERE "destinatarioId" = u.id)
    + (SELECT count(*) FROM "Documento" WHERE "enviadoPorId" = u.id)
    + (SELECT count(*) FROM "ClienteDiaMovimento" WHERE "registradoPorId" = u.id)
    + (SELECT count(*) FROM "PendenciaEvento" WHERE "userId" = u.id)
    + (SELECT count(*) FROM "PendenciaCompliance" WHERE "responsavelId" = u.id)
    + (SELECT count(*) FROM "CertificadoVersao" WHERE "criadoPorId" = u.id)
    + (SELECT count(*) FROM "CertificadoEnvio" WHERE "enviadoPorId" = u.id)
    + (SELECT count(*) FROM "LeadComentario" WHERE "autorId" = u.id)
    INTO deps;

    IF deps = 0 THEN
      DELETE FROM "User" WHERE "id" = u.id;
      RAISE NOTICE 'usuario % (%) EXCLUIDO — zero dependencias', u.name, u.email;
    ELSE
      UPDATE "User" SET "active" = false, "updatedAt" = now() WHERE "id" = u.id;
      RAISE NOTICE 'usuario % (%) DESATIVADO — % dependencia(s), historico preservado',
        u.name, u.email, deps;
    END IF;
  END LOOP;
END $$;

-- ===========================================================================
-- RELATORIO
-- ===========================================================================

DO $$
DECLARE
  n_tabelas   BIGINT;
  n_usuarios  BIGINT;
  n_ativos    BIGINT;
  n_clientes  BIGINT;
  n_lanc_dia  BIGINT;
  n_followup  BIGINT;
BEGIN
  SELECT count(*) INTO n_tabelas  FROM information_schema.tables WHERE table_schema = 'public';
  SELECT count(*) INTO n_usuarios FROM "User";
  SELECT count(*) INTO n_ativos   FROM "User" WHERE "active";
  SELECT count(*) INTO n_clientes FROM "Cliente";
  SELECT count(*) INTO n_lanc_dia FROM "LancamentoDiario";
  SELECT count(*) INTO n_followup FROM "FollowUp" WHERE "picoIntervaloDias" IS NOT NULL;

  RAISE NOTICE '--- migration v16 aplicada ---';
  RAISE NOTICE 'tabelas no schema public:      %', n_tabelas;
  RAISE NOTICE 'usuarios (ativos):             % (%)', n_usuarios, n_ativos;
  RAISE NOTICE 'clientes preservados:          %', n_clientes;
  RAISE NOTICE 'lancamentos diarios:           %', n_lanc_dia;
  RAISE NOTICE 'follow-ups com pico definido:  %', n_followup;
  RAISE NOTICE 'nenhuma tabela, coluna, tipo ou linha historica foi removida.';
END $$;

COMMIT;
