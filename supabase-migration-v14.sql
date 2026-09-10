-- Migration v14: Automacoes + Formularios
--
-- IMPACTO / SEGURANCA
--   * Somente ADITIVA: CREATE TABLE, CREATE INDEX, ADD CONSTRAINT.
--     Nenhum DROP, DELETE ou TRUNCATE. Nenhuma linha existente e tocada.
--   * Depende da v12 (enums) e da v11 (PipelineFunil / PipelineEtapa).
--
-- Idempotente.

-- ------------------------------------------------------------- 1. Automacao

CREATE TABLE IF NOT EXISTS "Automacao" (
  "id"                 TEXT NOT NULL,
  "nome"               TEXT NOT NULL,
  "ativo"              BOOLEAN NOT NULL DEFAULT true,
  "gatilho"            "AutomacaoGatilho" NOT NULL,
  "funilId"            TEXT,
  "etapaId"            TEXT,
  "acao"               "AutomacaoAcao" NOT NULL,
  "funilDestinoId"     TEXT,
  "etapaDestinoId"     TEXT,
  "destinatarioRole"   "Role",
  "destinatarioUserId" TEXT,
  "condicao"           JSONB,
  "titulo"             TEXT,
  "mensagem"           TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Automacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Automacao_ativo_gatilho_idx" ON "Automacao" ("ativo","gatilho");

DO $$ BEGIN
  ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_funilId_fkey"
    FOREIGN KEY ("funilId") REFERENCES "PipelineFunil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_etapaId_fkey"
    FOREIGN KEY ("etapaId") REFERENCES "PipelineEtapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_funilDestinoId_fkey"
    FOREIGN KEY ("funilDestinoId") REFERENCES "PipelineFunil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_etapaDestinoId_fkey"
    FOREIGN KEY ("etapaDestinoId") REFERENCES "PipelineEtapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_destinatarioUserId_fkey"
    FOREIGN KEY ("destinatarioUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------- 2. AutomacaoExecucao

CREATE TABLE IF NOT EXISTS "AutomacaoExecucao" (
  "id"          TEXT NOT NULL,
  "automacaoId" TEXT NOT NULL,
  "status"      "AutomacaoExecucaoStatus" NOT NULL,
  "dealId"      TEXT,
  "respostaId"  TEXT,
  "contexto"    JSONB,
  "resultado"   TEXT,
  "erro"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomacaoExecucao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomacaoExecucao_automacaoId_createdAt_idx" ON "AutomacaoExecucao" ("automacaoId","createdAt");

DO $$ BEGIN
  ALTER TABLE "AutomacaoExecucao" ADD CONSTRAINT "AutomacaoExecucao_automacaoId_fkey"
    FOREIGN KEY ("automacaoId") REFERENCES "Automacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------ 3. Formulario

CREATE TABLE IF NOT EXISTS "Formulario" (
  "id"          TEXT NOT NULL,
  "nome"        TEXT NOT NULL,
  "descricao"   TEXT,
  "ativo"       BOOLEAN NOT NULL DEFAULT true,
  "criadoPorId" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Formulario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Formulario_ativo_idx" ON "Formulario" ("ativo");

DO $$ BEGIN
  ALTER TABLE "Formulario" ADD CONSTRAINT "Formulario_criadoPorId_fkey"
    FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------ 4. FormularioVersao
-- `definicao` guarda secoes, campos, ordem, validacoes, layout e aparencia.
-- Publicada, a versao nao muda mais: editar cria a proxima.

CREATE TABLE IF NOT EXISTS "FormularioVersao" (
  "id"           TEXT NOT NULL,
  "formularioId" TEXT NOT NULL,
  "versao"       INTEGER NOT NULL,
  "definicao"    JSONB NOT NULL,
  "publicadaEm"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FormularioVersao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FormularioVersao_formularioId_versao_key"     ON "FormularioVersao" ("formularioId","versao");
CREATE INDEX        IF NOT EXISTS "FormularioVersao_formularioId_publicadaEm_idx" ON "FormularioVersao" ("formularioId","publicadaEm");

DO $$ BEGIN
  ALTER TABLE "FormularioVersao" ADD CONSTRAINT "FormularioVersao_formularioId_fkey"
    FOREIGN KEY ("formularioId") REFERENCES "Formulario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------- 5. FormularioLink
-- O token e aleatorio e NUNCA o id interno: id em URL publica vaza a
-- existencia e a ordem dos registros.

CREATE TABLE IF NOT EXISTS "FormularioLink" (
  "id"         TEXT NOT NULL,
  "versaoId"   TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "clienteId"  TEXT,
  "expiraEm"   TIMESTAMP(3),
  "usosMax"    INTEGER,
  "usos"       INTEGER NOT NULL DEFAULT 0,
  "revogadoEm" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormularioLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FormularioLink_token_key"    ON "FormularioLink" ("token");
CREATE INDEX        IF NOT EXISTS "FormularioLink_versaoId_idx" ON "FormularioLink" ("versaoId");

DO $$ BEGIN
  ALTER TABLE "FormularioLink" ADD CONSTRAINT "FormularioLink_versaoId_fkey"
    FOREIGN KEY ("versaoId") REFERENCES "FormularioVersao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FormularioLink" ADD CONSTRAINT "FormularioLink_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------- 6. FormularioResposta

CREATE TABLE IF NOT EXISTS "FormularioResposta" (
  "id"            TEXT NOT NULL,
  "versaoId"      TEXT NOT NULL,
  "linkId"        TEXT,
  "clienteId"     TEXT,
  "responsavelId" TEXT,
  "status"        "FormularioRespostaStatus" NOT NULL DEFAULT 'ENVIADA',
  "valores"       JSONB NOT NULL,
  "aceiteEm"      TIMESTAMP(3),
  "assinatura"    TEXT,
  "ip"            TEXT,
  "enviadaEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FormularioResposta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FormularioResposta_versaoId_enviadaEm_idx" ON "FormularioResposta" ("versaoId","enviadaEm");
CREATE INDEX IF NOT EXISTS "FormularioResposta_clienteId_idx"          ON "FormularioResposta" ("clienteId");

DO $$ BEGIN
  ALTER TABLE "FormularioResposta" ADD CONSTRAINT "FormularioResposta_versaoId_fkey"
    FOREIGN KEY ("versaoId") REFERENCES "FormularioVersao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FormularioResposta" ADD CONSTRAINT "FormularioResposta_linkId_fkey"
    FOREIGN KEY ("linkId") REFERENCES "FormularioLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FormularioResposta" ADD CONSTRAINT "FormularioResposta_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FormularioResposta" ADD CONSTRAINT "FormularioResposta_responsavelId_fkey"
    FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------- 7. FormularioAnexo

CREATE TABLE IF NOT EXISTS "FormularioAnexo" (
  "id"          TEXT NOT NULL,
  "respostaId"  TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "campo"       TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormularioAnexo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FormularioAnexo_documentoId_key" ON "FormularioAnexo" ("documentoId");
CREATE INDEX        IF NOT EXISTS "FormularioAnexo_respostaId_idx"  ON "FormularioAnexo" ("respostaId");

DO $$ BEGIN
  ALTER TABLE "FormularioAnexo" ADD CONSTRAINT "FormularioAnexo_respostaId_fkey"
    FOREIGN KEY ("respostaId") REFERENCES "FormularioResposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FormularioAnexo" ADD CONSTRAINT "FormularioAnexo_documentoId_fkey"
    FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
