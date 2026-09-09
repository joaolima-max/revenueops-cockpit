-- Migration v10: Volumetria minima por CLIENTE
--
-- Evolui a tabela existente "VolumetriaMinima" (antes: um minimo GERAL por
-- periodo) para o vinculo contratual Cliente <-> quantidade minima de
-- transacoes, com periodo de vigencia e status ativo/inativo.
--
-- IMPACTO / SEGURANCA
--   * Somente operacoes ADITIVAS. Nenhum DROP COLUMN, nenhum DELETE.
--   * As linhas existentes ficam com "clienteId" NULL e passam a ser tratadas
--     pela aplicacao como "contrato geral legado", apenas leitura. Os alertas
--     de meses ja fechados continuam produzindo o mesmo resultado.
--   * A coluna "periodo" e reaproveitada como INICIO da vigencia (mesmo
--     formato YYYY-MM), por isso nao precisa de backfill.
--   * O unico indice destrutivo-em-aparencia e o DROP do unique de "periodo":
--     ele impede mais de um cliente no mesmo mes. Nenhum dado e perdido, so a
--     restricao. Substituido por unique (clienteId, periodo).
--
-- Idempotente: pode ser reexecutada com seguranca.

ALTER TABLE "VolumetriaMinima" ADD COLUMN IF NOT EXISTS "clienteId"   TEXT;
ALTER TABLE "VolumetriaMinima" ADD COLUMN IF NOT EXISTS "vigenciaFim" TEXT;
ALTER TABLE "VolumetriaMinima" ADD COLUMN IF NOT EXISTS "ativo"       BOOLEAN NOT NULL DEFAULT true;

-- FK para Cliente. Cascade acompanha ContaReceber e FollowUp, que ja usam o
-- mesmo comportamento: excluir o cliente leva junto o que so existe por causa
-- dele. Cliente so e excluido por ADMIN.
DO $$ BEGIN
  ALTER TABLE "VolumetriaMinima"
    ADD CONSTRAINT "VolumetriaMinima_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Troca do unique global de periodo pelo unique por cliente.
ALTER TABLE "VolumetriaMinima" DROP CONSTRAINT IF EXISTS "VolumetriaMinima_periodo_key";
DROP INDEX IF EXISTS "VolumetriaMinima_periodo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "VolumetriaMinima_clienteId_periodo_key"
  ON "VolumetriaMinima" ("clienteId", "periodo");

CREATE INDEX IF NOT EXISTS "VolumetriaMinima_clienteId_ativo_idx"
  ON "VolumetriaMinima" ("clienteId", "ativo");
