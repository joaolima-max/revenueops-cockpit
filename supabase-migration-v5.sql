-- ============================================================
-- RevOps — Migration v5 (ForecastGeral)
-- Cole no Supabase → SQL Editor → New query → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS "ForecastGeral" (
  "id"                      TEXT NOT NULL,
  "mesRef"                  TEXT NOT NULL,
  "tpvPrevisto"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qtdTransacoesPrevista"   INTEGER NOT NULL DEFAULT 0,
  "faturamentoPrevisto"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "margemPrevista"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tpvRealizado"            DOUBLE PRECISION,
  "qtdTransacoesRealizadas" INTEGER,
  "faturamentoRealizado"    DOUBLE PRECISION,
  "margemRealizada"         DOUBLE PRECISION,
  "notas"                   TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastGeral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForecastGeral_mesRef_key" ON "ForecastGeral"("mesRef");
