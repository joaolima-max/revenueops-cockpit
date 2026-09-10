-- Migration v12: Fundacao — papeis, notificacoes, documentos e movimento diario
--
-- IMPACTO / SEGURANCA
--   * Somente ADITIVA: CREATE TYPE, ALTER TYPE ADD VALUE, CREATE TABLE,
--     ADD COLUMN, CREATE INDEX. Nenhum DROP, DELETE ou TRUNCATE.
--   * Nenhuma linha existente e alterada.
--   * Todos os enums dos modulos seguintes sao criados AQUI, de uma vez:
--     CREATE TYPE e barato, e criar na v14 um tipo que a v12 ja podia ter
--     criado e exatamente a fragmentacao que este plano evita.
--
-- NOTA: ALTER TYPE ... ADD VALUE nao pode ser referenciado na mesma transacao
-- em que e criado. Por isso os ADD VALUE ficam isolados no topo e nenhuma
-- linha inserida nesta migration usa os valores novos.
--
-- Idempotente.

-- ------------------------------------------------- 1. Valores de enum novos

ALTER TYPE "Role"          ADD VALUE IF NOT EXISTS 'GESTOR';
ALTER TYPE "ClienteStatus" ADD VALUE IF NOT EXISTS 'STANDBY';

ALTER TYPE "Segmento" ADD VALUE IF NOT EXISTS 'CRYPTO_EXCHANGES';
ALTER TYPE "Segmento" ADD VALUE IF NOT EXISTS 'REMESSA_FX';
ALTER TYPE "Segmento" ADD VALUE IF NOT EXISTS 'GATEWAY_PAGAMENTOS';
ALTER TYPE "Segmento" ADD VALUE IF NOT EXISTS 'BAAS';

-- ------------------------------------------------------------ 2. Enums novos

DO $$ BEGIN CREATE TYPE "Canal" AS ENUM ('OUTBOUND','INDICACAO','INBOUND','EVENTOS','OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "NotificacaoOrigem" AS ENUM ('PIPELINE','AUTOMACAO','COMPLIANCE','FORMULARIO','CERTIFICADO','SISTEMA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "DocumentoCategoria" AS ENUM ('CONTRATO','KYC_KYB','CERTIFICADO','COMPROVANTE','COMERCIAL','FINANCEIRO','OUTROS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "DocumentoOrigem" AS ENUM ('UPLOAD_MANUAL','CERTIFICADO','FORMULARIO','COMPLIANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "CertificadoVersaoStatus" AS ENUM ('ATIVA','ESGOTADA','SUBSTITUIDA','CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "CertificadoStatus" AS ENUM ('DISPONIVEL','ENVIADO','REVOGADO','EXPIRADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "CertificadoEnvioTipo" AS ENUM ('UNICO','LOTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "CertificadoEnvioStatus" AS ENUM ('ENVIADO','CANCELADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "PendenciaMotivo" AS ENUM ('ATUALIZACAO_CADASTRAL','EXPLICACAO_MOVIMENTACAO','EXPLICACAO_DENUNCIA','REGULARIZACAO_DOCUMENTO','OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "PendenciaStatus" AS ENUM ('ABERTA','EM_ANALISE','AGUARDANDO_CLIENTE','RESOLVIDA','CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "AutomacaoGatilho" AS ENUM ('CARD_CRIADO','ETAPA_CONCLUIDA','CARD_TRANSFERIDO','FORMULARIO_ENVIADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "AutomacaoAcao" AS ENUM ('TRANSFERIR_FUNIL','NOTIFICAR','CRIAR_TAREFA','ABRIR_PENDENCIA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "AutomacaoExecucaoStatus" AS ENUM ('SUCESSO','FALHA','IGNORADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "FormularioRespostaStatus" AS ENUM ('RASCUNHO','ENVIADA','EM_ANALISE','CONCLUIDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------- 3. Colunas em tabelas existentes

ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "gestorId" TEXT;
ALTER TABLE "Lead"    ADD COLUMN IF NOT EXISTS "cnpj"     TEXT;
ALTER TABLE "Lead"    ADD COLUMN IF NOT EXISTS "canal"    "Canal";

DO $$ BEGIN
  ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_gestorId_fkey"
    FOREIGN KEY ("gestorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Cliente_gestorId_idx" ON "Cliente" ("gestorId");

-- -------------------------------------------------------- 4. LeadComentario

CREATE TABLE IF NOT EXISTS "LeadComentario" (
  "id"        TEXT NOT NULL,
  "leadId"    TEXT NOT NULL,
  "autorId"   TEXT NOT NULL,
  "texto"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadComentario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadComentario_leadId_createdAt_idx" ON "LeadComentario" ("leadId","createdAt");

DO $$ BEGIN
  ALTER TABLE "LeadComentario" ADD CONSTRAINT "LeadComentario_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LeadComentario" ADD CONSTRAINT "LeadComentario_autorId_fkey"
    FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------- 5. Notificacao

CREATE TABLE IF NOT EXISTS "Notificacao" (
  "id"             TEXT NOT NULL,
  "destinatarioId" TEXT NOT NULL,
  "titulo"         TEXT NOT NULL,
  "mensagem"       TEXT NOT NULL,
  "origem"         "NotificacaoOrigem" NOT NULL DEFAULT 'SISTEMA',
  "entidade"       TEXT,
  "entidadeId"     TEXT,
  "href"           TEXT,
  "lidaEm"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notificacao_destinatarioId_lidaEm_idx"    ON "Notificacao" ("destinatarioId","lidaEm");
CREATE INDEX IF NOT EXISTS "Notificacao_destinatarioId_createdAt_idx" ON "Notificacao" ("destinatarioId","createdAt");

DO $$ BEGIN
  ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_destinatarioId_fkey"
    FOREIGN KEY ("destinatarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------- 6. Documento

CREATE TABLE IF NOT EXISTS "Documento" (
  "id"           TEXT NOT NULL,
  "clienteId"    TEXT NOT NULL,
  "nome"         TEXT NOT NULL,
  "categoria"    "DocumentoCategoria" NOT NULL DEFAULT 'OUTROS',
  "origem"       "DocumentoOrigem" NOT NULL DEFAULT 'UPLOAD_MANUAL',
  "mime"         TEXT NOT NULL,
  "tamanho"      INTEGER NOT NULL,
  "storageKey"   TEXT NOT NULL,
  "descricao"    TEXT,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "enviadoPorId" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Documento_storageKey_key"      ON "Documento" ("storageKey");
CREATE INDEX        IF NOT EXISTS "Documento_clienteId_ativo_idx" ON "Documento" ("clienteId","ativo");
CREATE INDEX        IF NOT EXISTS "Documento_categoria_idx"       ON "Documento" ("categoria");

DO $$ BEGIN
  ALTER TABLE "Documento" ADD CONSTRAINT "Documento_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Documento" ADD CONSTRAINT "Documento_enviadoPorId_fkey"
    FOREIGN KEY ("enviadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------- 7. ClienteDiaMovimento

CREATE TABLE IF NOT EXISTS "ClienteDiaMovimento" (
  "id"              TEXT NOT NULL,
  "clienteId"       TEXT NOT NULL,
  "data"            DATE NOT NULL,
  "movimentou"      BOOLEAN NOT NULL,
  "registradoPorId" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClienteDiaMovimento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClienteDiaMovimento_clienteId_data_key" ON "ClienteDiaMovimento" ("clienteId","data");
CREATE INDEX        IF NOT EXISTS "ClienteDiaMovimento_data_idx"           ON "ClienteDiaMovimento" ("data");

DO $$ BEGIN
  ALTER TABLE "ClienteDiaMovimento" ADD CONSTRAINT "ClienteDiaMovimento_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ClienteDiaMovimento" ADD CONSTRAINT "ClienteDiaMovimento_registradoPorId_fkey"
    FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
