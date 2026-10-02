-- ============================================================================
-- v27 — CATEGORIA BAAS UNIFICADA
--
-- Incremental e idempotente. Nenhum DROP, TRUNCATE ou DELETE em massa.
--
-- A categoria da RECEITA BaaS chamava-se "Tarifas BaaS" e a da DESPESA já
-- havia sido renomeada para "BaaS" na v26. Nomear a categoria pelo PAPEL de
-- cada registro criava nomes diferentes para a MESMA origem — e a tela de
-- Categorias, que existe para classificar por natureza, enchia de linhas
-- dizendo a mesma coisa com palavras diferentes.
--
-- "Tarifa BaaS" e "Repasse BaaS" continuam existindo, na DESCRIÇÃO, que é
-- onde o papel do registro pertence. A categoria responde "de onde vem?" e a
-- resposta é a mesma para os três registros: BaaS.
--
-- Duas linhas no banco, não uma: `CategoriaFinanceira` é única por
-- (nome, tipo), então convivem uma de RECEITA e uma de DESPESA, ambas "BaaS".
-- Receita por categoria e gasto por categoria continuam separados.
-- ============================================================================

-- ─── 1. "Tarifas BaaS" (RECEITA) → "BaaS" ───────────────────────────────────
-- RENOMEIA preservando o id: todos os lançamentos já classificados seguem
-- apontando para a mesma linha. Criar uma categoria nova e religar os
-- lançamentos faria o mesmo trabalho com risco de deixar linhas na antiga.
--
-- O guard do NOT EXISTS evita violar o UNIQUE(nome, tipo) caso uma categoria
-- "BaaS" de RECEITA já exista por outro caminho.
UPDATE "CategoriaFinanceira"
SET nome = 'BaaS', "updatedAt" = CURRENT_TIMESTAMP
WHERE tipo = 'RECEITA'
  AND nome = 'Tarifas BaaS'
  AND NOT EXISTS (
    SELECT 1 FROM "CategoriaFinanceira" c2
    WHERE c2.tipo = 'RECEITA' AND c2.nome = 'BaaS'
  );

-- Se já existia uma "BaaS" de RECEITA, os lançamentos da antiga migram para
-- ela e a antiga fica sem uso. Não é apagada aqui: categoria órfã é decisão
-- de quem administra a tela de Categorias, não de uma migration.
UPDATE "LancamentoFinanceiro" lf
SET "categoriaId" = nova.id, "updatedAt" = CURRENT_TIMESTAMP
FROM "CategoriaFinanceira" antiga, "CategoriaFinanceira" nova
WHERE lf."categoriaId" = antiga.id
  AND antiga.tipo = 'RECEITA' AND antiga.nome = 'Tarifas BaaS'
  AND nova.tipo   = 'RECEITA' AND nova.nome   = 'BaaS';

-- ─── 2. Rede de segurança: a categoria tem de existir nos DOIS tipos ────────
-- `gerarTitulos` recusa o lançamento quando a categoria falta, com instrução
-- de criá-la. Garantir aqui evita que o primeiro Lançamento BaaS após o
-- deploy falhe por configuração ausente.
INSERT INTO "CategoriaFinanceira" (id, nome, tipo, ativo, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'BaaS', 'RECEITA', true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE tipo = 'RECEITA' AND nome = 'BaaS'
);

INSERT INTO "CategoriaFinanceira" (id, nome, tipo, ativo, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'BaaS', 'DESPESA', true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" WHERE tipo = 'DESPESA' AND nome = 'BaaS'
);

-- ─── 3. O `tipo` dos títulos a receber gerados por BaaS ─────────────────────
-- `ContaReceber.tipo` é texto livre, e é o rótulo que a tela mostra como
-- badge — a categoria do título. Os que nasceram antes carregam o nome
-- antigo; passam a dizer BaaS, igual aos outros dois registros.
UPDATE "ContaReceber" cr
SET tipo = 'BaaS', "updatedAt" = CURRENT_TIMESTAMP
FROM "LancamentoBaas" lb
WHERE lb."contaReceberId" = cr.id
  AND cr.tipo <> 'BaaS';
