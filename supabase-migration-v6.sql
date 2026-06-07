-- Migration v6: ContaReceber + User avatar

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar" TEXT;

CREATE TYPE IF NOT EXISTS "ContaReceberStatus" AS ENUM ('PENDENTE', 'FATURADO', 'PAGO', 'INADIMPLENTE');

CREATE TABLE IF NOT EXISTS "ContaReceber" (
  "id"          TEXT NOT NULL,
  "descricao"   TEXT NOT NULL,
  "tipo"        TEXT NOT NULL,
  "valor"       DOUBLE PRECISION NOT NULL,
  "parcela"     INTEGER,
  "totalParcel" INTEGER,
  "dataVenc"    TIMESTAMP(3) NOT NULL,
  "dataFatura"  TIMESTAMP(3),
  "dataPago"    TIMESTAMP(3),
  "status"      "ContaReceberStatus" NOT NULL DEFAULT 'PENDENTE',
  "notas"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clienteId"   TEXT NOT NULL,
  CONSTRAINT "ContaReceber_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ContaReceber_clienteId_idx" ON "ContaReceber"("clienteId");
CREATE INDEX IF NOT EXISTS "ContaReceber_dataVenc_idx" ON "ContaReceber"("dataVenc");
CREATE INDEX IF NOT EXISTS "ContaReceber_status_idx" ON "ContaReceber"("status");
