-- Migration v15: alinhar o enum MetaTipo ao schema.prisma
--
-- POR QUE EXISTE
--   O `schema.prisma` declara tres valores legados de MetaTipo — RECEITA, MRR
--   e CLIENTES_ATIVOS — com o comentario de que metas antigas em Production
--   ainda os usam. Depois da limpeza do banco esses valores nao existem mais no
--   tipo, e o Prisma Client passou a discordar do banco.
--
--   O impacto pratico hoje e nulo (a tabela Meta esta vazia e a interface so
--   oferece os cinco valores atuais), mas schema e banco discordando sobre um
--   tipo e um bug latente: qualquer leitura ou escrita futura com um desses
--   valores falharia so em producao.
--
-- IMPACTO / SEGURANCA
--   * Somente ADD VALUE. Nenhum dado e tocado, nenhum valor e removido.
--   * ADD VALUE nao pode ser referenciado na mesma transacao em que e criado;
--     como nada aqui insere linha, nao ha conflito.
--
-- Idempotente.

ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'RECEITA';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'MRR';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'CLIENTES_ATIVOS';
