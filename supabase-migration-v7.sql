-- Migration v7: FollowUp (CRM calendar)

DO $$ BEGIN
  CREATE TYPE "FollowUpTipo" AS ENUM ('PICO_OPERACIONAL','REUNIAO','MONITORAMENTO','FOLLOW_UP','ALERTA','OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FollowUp" (
  "id"          TEXT NOT NULL,
  "titulo"      TEXT NOT NULL,
  "descricao"   TEXT,
  "tipo"        "FollowUpTipo" NOT NULL DEFAULT 'FOLLOW_UP',
  "recorrente"  BOOLEAN NOT NULL DEFAULT false,
  "diaSemana"   INTEGER,
  "horaInicio"  TEXT,
  "horaFim"     TEXT,
  "dataInicio"  TIMESTAMP(3),
  "dataFim"     TIMESTAMP(3),
  "notas"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clienteId"   TEXT NOT NULL,
  CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "FollowUp_clienteId_idx" ON "FollowUp"("clienteId");
CREATE INDEX IF NOT EXISTS "FollowUp_diaSemana_idx"  ON "FollowUp"("diaSemana");
