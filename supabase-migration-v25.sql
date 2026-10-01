-- =====================================================================
-- RevenueOps Cockpit — migration v25
--
-- Duas correções de DADOS, nenhuma de estrutura.
--
-- 1. FECHADO deixou de existir como conceito. O fechamento era manual e não
--    protegia nada: um lançamento com título já pago continuava editável
--    enquanto ninguém o fechasse, e um sem liquidação ficava travado no
--    instante em que fosse fechado. O que impede mexer no passado passou a
--    ser a LIQUIDAÇÃO dos títulos (ver `liquidacaoDe`).
--
--    As linhas gravadas com FECHADO voltam para LANCADO — que é o que elas
--    são: lançamentos com títulos gerados. O valor fica no enum porque
--    removê-lo exigiria reescrever o tipo.
--
-- 2. O título a receber passou a cobrar SÓ AS TARIFAS. Os títulos criados
--    antes disso carregam tarifas + overprice. O valor correto é copiado de
--    `LancamentoBaas.totalTarifas` — já persistido, sem recomputar a cascata.
--
-- 3. As descrições vão para o formato final, "<o quê> — <parceiro> —
--    <competência>". O critério é "não está no formato final", e não um
--    padrão antigo específico: houve duas versões anteriores, e adivinhar
--    qual delas cada linha carrega deixaria linhas de fora.
--
-- NÃO TOCA EM TÍTULO LIQUIDADO. Histórico movimentado não se reescreve.
--
-- Incremental e idempotente. Sem reset, TRUNCATE, DROP ou DELETE em massa.
-- =====================================================================

-- ── 1. FECHADO → LANCADO ────────────────────────────────────────────
UPDATE "LancamentoBaas"
   SET status = 'LANCADO', "updatedAt" = now()
 WHERE status = 'FECHADO';

-- ── 2. O AR passa a valer as TARIFAS ────────────────────────────────
UPDATE "ContaReceber" cr
   SET valor = lb."totalTarifas", "updatedAt" = now()
  FROM "LancamentoBaas" lb
 WHERE lb."contaReceberId" = cr.id
   AND cr.valor <> lb."totalTarifas"
   AND cr.status = 'PENDENTE'
   AND cr."dataPago" IS NULL;

-- ── 3. Descrições no formato final ──────────────────────────────────
UPDATE "ContaReceber" cr
   SET descricao = 'Tarifas BaaS — ' || c."nomeFantasia" || ' — '
                   || to_char(lb."periodoFim", 'MM/YYYY'),
       "updatedAt" = now()
  FROM "LancamentoBaas" lb
  JOIN "CondicaoComercial" c ON c.id = lb."condicaoId"
 WHERE lb."contaReceberId" = cr.id
   AND cr.descricao NOT LIKE 'Tarifas BaaS — %';

UPDATE "LancamentoFinanceiro" lf
   SET descricao = 'Lançamento BaaS — ' || c."nomeFantasia" || ' — '
                   || to_char(lb."periodoFim", 'MM/YYYY'),
       "updatedAt" = now()
  FROM "LancamentoBaas" lb
  JOIN "CondicaoComercial" c ON c.id = lb."condicaoId"
 WHERE lb."lancamentoId" = lf.id
   AND lf.descricao NOT LIKE 'Lançamento BaaS — %';

UPDATE "LancamentoFinanceiro" lf
   SET descricao = 'Repasse ao parceiro — ' || c."nomeFantasia" || ' — '
                   || to_char(lb."periodoFim", 'MM/YYYY'),
       "updatedAt" = now()
  FROM "LancamentoBaas" lb
  JOIN "CondicaoComercial" c ON c.id = lb."condicaoId"
 WHERE lb."contaPagarId" = lf.id
   AND lf.descricao NOT LIKE 'Repasse ao parceiro — %';
