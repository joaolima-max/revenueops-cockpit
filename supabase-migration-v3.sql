-- ============================================================
-- RevOps — Migration v3 (Evolução Completa)
-- Cole no Supabase → SQL Editor → New query → Run
-- ============================================================

-- Novos enums
CREATE TYPE "Segmento" AS ENUM ('IGAMING','ECOMMERCE','SAAS','ERP','TELECOM','CRIPTOMOEDAS','VAREJO','OUTROS');
CREATE TYPE "OperacaoCom" AS ENUM ('CASH_IN','CASH_OUT','BAAS','WHITE_LABEL');
CREATE TYPE "ScoreRisco" AS ENUM ('BAIXO','MEDIO','ALTO','CRITICO');
CREATE TYPE "TarefaStatus" AS ENUM ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','CANCELADA');
CREATE TYPE "TarefaPrioridade" AS ENUM ('BAIXA','MEDIA','ALTA','CRITICA');
CREATE TYPE "IncidenteCriticidade" AS ENUM ('BAIXA','MEDIA','ALTA','CRITICA');
CREATE TYPE "PedidoStatus" AS ENUM ('PENDENTE','FATURADO','PAGO','CANCELADO');

-- Novos MetaTipo values
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'NOVOS_CLIENTES';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'RETENCAO';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'TRANSACOES';

-- Novos campos em Lead
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "segmento" "Segmento";
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "operacao" "OperacaoCom";

-- Novos campos em Deal
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "segmento" "Segmento";
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "operacao" "OperacaoCom";

-- Novos campos em Cliente
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "segmento"          "Segmento";
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "operacao"          "OperacaoCom";
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "scoreRisco"        "ScoreRisco";
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "volumeMinimo"      DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "descontoPercent"   DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "overpricePercent"  DOUBLE PRECISION;

-- Tabela Tarefa
CREATE TABLE IF NOT EXISTS "Tarefa" (
  "id"            TEXT NOT NULL,
  "titulo"        TEXT NOT NULL,
  "descricao"     TEXT,
  "status"        "TarefaStatus"     NOT NULL DEFAULT 'PENDENTE',
  "prioridade"    "TarefaPrioridade" NOT NULL DEFAULT 'MEDIA',
  "dueDate"       TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clienteId"     TEXT,
  "criadoPorId"   TEXT NOT NULL,
  "responsavelId" TEXT NOT NULL,
  CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Tarefa" ADD CONSTRAINT IF NOT EXISTS "Tarefa_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tarefa" ADD CONSTRAINT IF NOT EXISTS "Tarefa_criadoPorId_fkey"
  FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tarefa" ADD CONSTRAINT IF NOT EXISTS "Tarefa_responsavelId_fkey"
  FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tabela Incidente
CREATE TABLE IF NOT EXISTS "Incidente" (
  "id"           TEXT NOT NULL,
  "titulo"       TEXT NOT NULL,
  "descricao"    TEXT,
  "inicio"       TIMESTAMP(3) NOT NULL,
  "fim"          TIMESTAMP(3),
  "downtimeMins" INTEGER,
  "criticidade"  "IncidenteCriticidade" NOT NULL DEFAULT 'MEDIA',
  "satisfacao"   INTEGER,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Incidente_pkey" PRIMARY KEY ("id")
);

-- Tabela de junção IncidenteCliente
CREATE TABLE IF NOT EXISTS "IncidenteCliente" (
  "incidenteId" TEXT NOT NULL,
  "clienteId"   TEXT NOT NULL,
  CONSTRAINT "IncidenteCliente_pkey" PRIMARY KEY ("incidenteId","clienteId")
);
ALTER TABLE "IncidenteCliente" ADD CONSTRAINT IF NOT EXISTS "IncidenteCliente_incidenteId_fkey"
  FOREIGN KEY ("incidenteId") REFERENCES "Incidente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidenteCliente" ADD CONSTRAINT IF NOT EXISTS "IncidenteCliente_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tabela PedidoCobravel
CREATE TABLE IF NOT EXISTS "PedidoCobravel" (
  "id"        TEXT NOT NULL,
  "tipo"      TEXT NOT NULL,
  "descricao" TEXT,
  "valor"     DOUBLE PRECISION NOT NULL,
  "mesRef"    TEXT NOT NULL,
  "status"    "PedidoStatus" NOT NULL DEFAULT 'PENDENTE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clienteId" TEXT NOT NULL,
  CONSTRAINT "PedidoCobravel_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PedidoCobravel" ADD CONSTRAINT IF NOT EXISTS "PedidoCobravel_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tabela Auditoria
CREATE TABLE IF NOT EXISTS "Auditoria" (
  "id"         TEXT NOT NULL,
  "acao"       TEXT NOT NULL,
  "entidade"   TEXT NOT NULL,
  "entidadeId" TEXT,
  "detalhes"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId"     TEXT NOT NULL,
  CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Auditoria" ADD CONSTRAINT IF NOT EXISTS "Auditoria_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Atualizar segmento dos clientes demo
UPDATE "Cliente" SET "segmento" = 'ECOMMERCE', "operacao" = 'CASH_IN', "scoreRisco" = 'BAIXO'  WHERE "id" = 'cli-1';
UPDATE "Cliente" SET "segmento" = 'SAAS',      "operacao" = 'BAAS',    "scoreRisco" = 'BAIXO'  WHERE "id" = 'cli-2';
UPDATE "Cliente" SET "segmento" = 'VAREJO',    "operacao" = 'CASH_IN', "scoreRisco" = 'MEDIO'  WHERE "id" = 'cli-3';
UPDATE "Cliente" SET "segmento" = 'IGAMING',   "operacao" = 'CASH_OUT',"scoreRisco" = 'ALTO'   WHERE "id" = 'cli-4';
UPDATE "Cliente" SET "segmento" = 'TELECOM',   "operacao" = 'CASH_IN', "scoreRisco" = 'CRITICO' WHERE "id" = 'cli-5';
