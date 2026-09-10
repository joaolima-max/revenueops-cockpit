-- Migration v13: Certificados (estoque global) + Pendencias Compliance
--
-- IMPACTO / SEGURANCA
--   * Somente ADITIVA: CREATE TABLE, CREATE INDEX, ADD CONSTRAINT.
--     Nenhum DROP, DELETE ou TRUNCATE. Nenhuma linha existente e tocada.
--   * Depende da v12 (enums e tabela Documento).
--   * NAO semeia certificado nenhum: estoque e criado pela aplicacao, que
--     precisa cifrar as senhas com CERTIFICADO_ENCRYPTION_KEY. Uma senha
--     inserida por SQL entraria em claro no banco.
--
-- Idempotente.

-- ------------------------------------------------------ 1. CertificadoVersao
-- UM ZIP = exatamente 50 certificados. Estoque GLOBAL: nao tem clienteId.

CREATE TABLE IF NOT EXISTS "CertificadoVersao" (
  "id"            TEXT NOT NULL,
  "identificacao" TEXT NOT NULL,
  "descricao"     TEXT,
  "quantidade"    INTEGER NOT NULL DEFAULT 50,
  "status"        "CertificadoVersaoStatus" NOT NULL DEFAULT 'ATIVA',
  "documentoId"   TEXT,
  "substituiId"   TEXT,
  "criadoPorId"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificadoVersao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoVersao_identificacao_key" ON "CertificadoVersao" ("identificacao");
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoVersao_documentoId_key"   ON "CertificadoVersao" ("documentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoVersao_substituiId_key"   ON "CertificadoVersao" ("substituiId");
CREATE INDEX        IF NOT EXISTS "CertificadoVersao_status_idx"        ON "CertificadoVersao" ("status");

DO $$ BEGIN
  ALTER TABLE "CertificadoVersao" ADD CONSTRAINT "CertificadoVersao_documentoId_fkey"
    FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CertificadoVersao" ADD CONSTRAINT "CertificadoVersao_substituiId_fkey"
    FOREIGN KEY ("substituiId") REFERENCES "CertificadoVersao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CertificadoVersao" ADD CONSTRAINT "CertificadoVersao_criadoPorId_fkey"
    FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------- 2. CertificadoEnvio
-- Criada antes de Certificado porque Certificado."envioId" a referencia.

CREATE TABLE IF NOT EXISTS "CertificadoEnvio" (
  "id"            TEXT NOT NULL,
  "clienteId"     TEXT NOT NULL,
  "versaoId"      TEXT NOT NULL,
  "tipo"          "CertificadoEnvioTipo" NOT NULL,
  "quantidade"    INTEGER NOT NULL,
  "numeroInicial" INTEGER NOT NULL,
  "numeroFinal"   INTEGER NOT NULL,
  "status"        "CertificadoEnvioStatus" NOT NULL DEFAULT 'ENVIADO',
  "observacao"    TEXT,
  "enviadoPorId"  TEXT NOT NULL,
  "enviadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "canceladoEm"   TIMESTAMP(3),
  CONSTRAINT "CertificadoEnvio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CertificadoEnvio_clienteId_enviadoEm_idx" ON "CertificadoEnvio" ("clienteId","enviadoEm");
CREATE INDEX IF NOT EXISTS "CertificadoEnvio_versaoId_idx"            ON "CertificadoEnvio" ("versaoId");

DO $$ BEGIN
  ALTER TABLE "CertificadoEnvio" ADD CONSTRAINT "CertificadoEnvio_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CertificadoEnvio" ADD CONSTRAINT "CertificadoEnvio_versaoId_fkey"
    FOREIGN KEY ("versaoId") REFERENCES "CertificadoVersao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CertificadoEnvio" ADD CONSTRAINT "CertificadoEnvio_enviadoPorId_fkey"
    FOREIGN KEY ("enviadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------ 3. Certificado
-- Numeracao RELATIVA a versao: 1..50 em cada ZIP. A unicidade e
-- (versaoId, numero) — nunca uma sequencia global.

CREATE TABLE IF NOT EXISTS "Certificado" (
  "id"           TEXT NOT NULL,
  "versaoId"     TEXT NOT NULL,
  "numero"       INTEGER NOT NULL,
  "senhaCifrada" TEXT NOT NULL,
  "status"       "CertificadoStatus" NOT NULL DEFAULT 'DISPONIVEL',
  "envioId"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Certificado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Certificado_versaoId_numero_key" ON "Certificado" ("versaoId","numero");
CREATE INDEX        IF NOT EXISTS "Certificado_versaoId_status_idx" ON "Certificado" ("versaoId","status");
CREATE INDEX        IF NOT EXISTS "Certificado_envioId_idx"         ON "Certificado" ("envioId");

DO $$ BEGIN
  ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_versaoId_fkey"
    FOREIGN KEY ("versaoId") REFERENCES "CertificadoVersao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_envioId_fkey"
    FOREIGN KEY ("envioId") REFERENCES "CertificadoEnvio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------- 4. PendenciaCompliance

CREATE TABLE IF NOT EXISTS "PendenciaCompliance" (
  "id"            TEXT NOT NULL,
  "clienteId"     TEXT NOT NULL,
  "motivo"        "PendenciaMotivo" NOT NULL,
  "criticidade"   "IncidenteCriticidade" NOT NULL DEFAULT 'MEDIA',
  "titulo"        TEXT NOT NULL,
  "observacoes"   TEXT,
  "prazo"         TIMESTAMP(3),
  "status"        "PendenciaStatus" NOT NULL DEFAULT 'ABERTA',
  "responsavelId" TEXT NOT NULL,
  "resolvidaEm"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PendenciaCompliance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PendenciaCompliance_clienteId_status_idx" ON "PendenciaCompliance" ("clienteId","status");
CREATE INDEX IF NOT EXISTS "PendenciaCompliance_status_prazo_idx"     ON "PendenciaCompliance" ("status","prazo");

DO $$ BEGIN
  ALTER TABLE "PendenciaCompliance" ADD CONSTRAINT "PendenciaCompliance_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PendenciaCompliance" ADD CONSTRAINT "PendenciaCompliance_responsavelId_fkey"
    FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------- 5. PendenciaEvento

CREATE TABLE IF NOT EXISTS "PendenciaEvento" (
  "id"          TEXT NOT NULL,
  "pendenciaId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "statusDe"    "PendenciaStatus",
  "statusPara"  "PendenciaStatus",
  "comentario"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendenciaEvento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PendenciaEvento_pendenciaId_createdAt_idx" ON "PendenciaEvento" ("pendenciaId","createdAt");

DO $$ BEGIN
  ALTER TABLE "PendenciaEvento" ADD CONSTRAINT "PendenciaEvento_pendenciaId_fkey"
    FOREIGN KEY ("pendenciaId") REFERENCES "PendenciaCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PendenciaEvento" ADD CONSTRAINT "PendenciaEvento_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
