-- ============================================================================
-- v28 — PREVISÃO FINANCEIRA, CENTRO DE CUSTO, SLA DE PIPELINE
--       E O AJUSTE CONTÁBIL DO LANÇAMENTO BAAS
--
-- Incremental e IDEMPOTENTE. Nenhum DROP, TRUNCATE ou DELETE em massa.
-- Nenhuma tabela existente é recriada; nenhuma coluna existente é removida.
-- Pode ser executada mais de uma vez sem efeito adicional.
--
-- ÍNDICE DESTA MIGRATION
--
--   1. CentroCusto                  — nova tabela + coluna em LancamentoFinanceiro
--   2. Orcamento                    — nova tabela
--   3. DespesaFutura                — nova tabela
--   4. ReceitaPrevista              — nova tabela
--   5. SLA de Pipeline              — PipelineEtapa.slaDias + Deal.etapaEntradaEm
--   6. Backfill de Deal.etapaEntradaEm a partir do histórico
--   7. AJUSTE CONTÁBIL DO BAAS      — a receita passa a ser o saldo INTEGRAL
--  7b. Título a receber             — passa a espelhar a receita integral
--   8. Permissões de Previsão       — view_previsao / manage_previsao
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. CENTRO DE CUSTO
--
-- Estrutura PLANA: sem pai, sem árvore, sem rateio. Centro de custo
-- hierárquico obriga a decidir, em cada tela, se o número de um nó inclui os
-- filhos — e essa decisão volta a ser tomada a cada consulta.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CentroCusto" (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  codigo      TEXT,
  descricao   TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CentroCusto_nome_key" ON "CentroCusto" (nome);
CREATE INDEX IF NOT EXISTS "CentroCusto_ativo_nome_idx" ON "CentroCusto" (ativo, nome);

-- O centro de custo no lançamento é o que liga Orçado a Realizado.
-- OPCIONAL de propósito: existe lançamento que não pertence a área nenhuma
-- (um imposto da empresa), e exigir o campo obrigaria a inventar um centro
-- "Geral" que não significa nada.
ALTER TABLE "LancamentoFinanceiro"
  ADD COLUMN IF NOT EXISTS "centroCustoId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LancamentoFinanceiro_centroCustoId_fkey'
  ) THEN
    ALTER TABLE "LancamentoFinanceiro"
      ADD CONSTRAINT "LancamentoFinanceiro_centroCustoId_fkey"
      FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LancamentoFinanceiro_centroCustoId_idx"
  ON "LancamentoFinanceiro" ("centroCustoId");


-- ────────────────────────────────────────────────────────────────────────────
-- ENUMS DA PREVISÃO
--
-- Separados dos enums de lançamento de propósito: "pago" não é um estado de
-- previsão, e "previsto" não é um estado de lançamento. Reaproveitar
-- StatusLancamento faria uma despesa futura poder nascer PAGA.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusPrevisao') THEN
    CREATE TYPE "StatusPrevisao" AS ENUM ('PREVISTO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusOrcamento') THEN
    CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'APROVADO', 'ENCERRADO');
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. ORÇAMENTO
--
-- O grão é (periodo, tipo, centro de custo, categoria) e é UNIQUE: duas linhas
-- para o mesmo recorte seriam dois tetos para o mesmo gasto, e o "% utilizado"
-- passaria a depender de qual das duas a tela somou primeiro.
--
-- NOTA SOBRE O UNIQUE E O NULL: em Postgres, NULL nunca é igual a NULL, então
-- o índice único não impede duas linhas com `centroCustoId` nulo e o mesmo
-- período. Por isso existe também o índice parcial abaixo, que cobre os casos
-- com nulo — é ele que torna a restrição real para orçamento de área inteira
-- (sem categoria) e para orçamento sem centro de custo.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Orcamento" (
  id              TEXT PRIMARY KEY,
  periodo         TEXT NOT NULL,
  tipo            "TipoLancamento" NOT NULL,
  "centroCustoId" TEXT,
  "categoriaId"   TEXT,
  valor           DOUBLE PRECISION NOT NULL,
  observacao      TEXT,
  "responsavelId" TEXT,
  status          "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
  "criadoPorId"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Orcamento_centroCustoId_fkey') THEN
    ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_centroCustoId_fkey"
      FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Orcamento_categoriaId_fkey') THEN
    ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_categoriaId_fkey"
      FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Orcamento_responsavelId_fkey') THEN
    ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_responsavelId_fkey"
      FOREIGN KEY ("responsavelId") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Orcamento_criadoPorId_fkey') THEN
    ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_criadoPorId_fkey"
      FOREIGN KEY ("criadoPorId") REFERENCES "User"(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Orcamento_periodo_tipo_centroCustoId_categoriaId_key"
  ON "Orcamento" (periodo, tipo, "centroCustoId", "categoriaId");

-- Os três índices parciais que fecham o buraco do NULL no UNIQUE acima.
CREATE UNIQUE INDEX IF NOT EXISTS "Orcamento_recorte_sem_categoria_key"
  ON "Orcamento" (periodo, tipo, "centroCustoId")
  WHERE "categoriaId" IS NULL AND "centroCustoId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Orcamento_recorte_sem_centro_key"
  ON "Orcamento" (periodo, tipo, "categoriaId")
  WHERE "centroCustoId" IS NULL AND "categoriaId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Orcamento_recorte_global_key"
  ON "Orcamento" (periodo, tipo)
  WHERE "centroCustoId" IS NULL AND "categoriaId" IS NULL;

CREATE INDEX IF NOT EXISTS "Orcamento_periodo_tipo_idx"     ON "Orcamento" (periodo, tipo);
CREATE INDEX IF NOT EXISTS "Orcamento_centroCustoId_idx"    ON "Orcamento" ("centroCustoId");
CREATE INDEX IF NOT EXISTS "Orcamento_categoriaId_idx"      ON "Orcamento" ("categoriaId");
CREATE INDEX IF NOT EXISTS "Orcamento_status_idx"           ON "Orcamento" (status);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. DESPESA FUTURA
--
-- NÃO é um LancamentoFinanceiro de status PENDENTE. O lançamento pendente JÁ
-- ACONTECEU (tem competência, entra na Despesa do período e em Contas a
-- Pagar); a despesa futura é expectativa, não toca o resultado contábil e
-- serve à projeção de caixa. Confundir as duas faria a Despesa do mês incluir
-- o que ainda nem foi contratado.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DespesaFutura" (
  id               TEXT PRIMARY KEY,
  descricao        TEXT NOT NULL,
  "fornecedorId"   TEXT,
  "categoriaId"    TEXT,
  "centroCustoId"  TEXT,
  valor            DOUBLE PRECISION NOT NULL,
  "dataPrevista"   DATE NOT NULL,
  recorrencia      "PeriodicidadeLancamento" NOT NULL DEFAULT 'UNICA',
  "recorrenciaFim" DATE,
  "responsavelId"  TEXT,
  observacao       TEXT,
  status           "StatusPrevisao" NOT NULL DEFAULT 'PREVISTO',
  "lancamentoId"   TEXT,
  "criadoPorId"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DespesaFutura_fornecedorId_fkey') THEN
    ALTER TABLE "DespesaFutura" ADD CONSTRAINT "DespesaFutura_fornecedorId_fkey"
      FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DespesaFutura_categoriaId_fkey') THEN
    ALTER TABLE "DespesaFutura" ADD CONSTRAINT "DespesaFutura_categoriaId_fkey"
      FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DespesaFutura_centroCustoId_fkey') THEN
    ALTER TABLE "DespesaFutura" ADD CONSTRAINT "DespesaFutura_centroCustoId_fkey"
      FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DespesaFutura_responsavelId_fkey') THEN
    ALTER TABLE "DespesaFutura" ADD CONSTRAINT "DespesaFutura_responsavelId_fkey"
      FOREIGN KEY ("responsavelId") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DespesaFutura_lancamentoId_fkey') THEN
    ALTER TABLE "DespesaFutura" ADD CONSTRAINT "DespesaFutura_lancamentoId_fkey"
      FOREIGN KEY ("lancamentoId") REFERENCES "LancamentoFinanceiro"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DespesaFutura_criadoPorId_fkey') THEN
    ALTER TABLE "DespesaFutura" ADD CONSTRAINT "DespesaFutura_criadoPorId_fkey"
      FOREIGN KEY ("criadoPorId") REFERENCES "User"(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- UNIQUE: um lançamento concretiza no máximo UMA despesa futura. Sem isso, a
-- mesma saída poderia ser abatida de duas linhas de previsão.
CREATE UNIQUE INDEX IF NOT EXISTS "DespesaFutura_lancamentoId_key"
  ON "DespesaFutura" ("lancamentoId");

CREATE INDEX IF NOT EXISTS "DespesaFutura_dataPrevista_idx"        ON "DespesaFutura" ("dataPrevista");
CREATE INDEX IF NOT EXISTS "DespesaFutura_status_dataPrevista_idx" ON "DespesaFutura" (status, "dataPrevista");
CREATE INDEX IF NOT EXISTS "DespesaFutura_centroCustoId_idx"       ON "DespesaFutura" ("centroCustoId");
CREATE INDEX IF NOT EXISTS "DespesaFutura_categoriaId_idx"         ON "DespesaFutura" ("categoriaId");
CREATE INDEX IF NOT EXISTS "DespesaFutura_fornecedorId_idx"        ON "DespesaFutura" ("fornecedorId");


-- ────────────────────────────────────────────────────────────────────────────
-- 4. RECEITA PREVISTA
--
-- NÃO guarda "valor realizado". O realizado é apurado dos lançamentos de
-- receita do período, pelo mesmo caminho que a Visão Geral usa. Um campo de
-- realizado preenchido à mão criaria uma segunda versão do faturamento,
-- divergente da primeira no primeiro ajuste de lançamento.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ReceitaPrevista" (
  id              TEXT PRIMARY KEY,
  descricao       TEXT NOT NULL,
  periodo         TEXT NOT NULL,
  "categoriaId"   TEXT,
  "condicaoId"    TEXT,
  "clienteId"     TEXT,
  "centroCustoId" TEXT,
  "valorPrevisto" DOUBLE PRECISION NOT NULL,
  observacao      TEXT,
  status          "StatusPrevisao" NOT NULL DEFAULT 'PREVISTO',
  "criadoPorId"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceitaPrevista_categoriaId_fkey') THEN
    ALTER TABLE "ReceitaPrevista" ADD CONSTRAINT "ReceitaPrevista_categoriaId_fkey"
      FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceitaPrevista_condicaoId_fkey') THEN
    ALTER TABLE "ReceitaPrevista" ADD CONSTRAINT "ReceitaPrevista_condicaoId_fkey"
      FOREIGN KEY ("condicaoId") REFERENCES "CondicaoComercial"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceitaPrevista_clienteId_fkey') THEN
    ALTER TABLE "ReceitaPrevista" ADD CONSTRAINT "ReceitaPrevista_clienteId_fkey"
      FOREIGN KEY ("clienteId") REFERENCES "Cliente"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceitaPrevista_centroCustoId_fkey') THEN
    ALTER TABLE "ReceitaPrevista" ADD CONSTRAINT "ReceitaPrevista_centroCustoId_fkey"
      FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceitaPrevista_criadoPorId_fkey') THEN
    ALTER TABLE "ReceitaPrevista" ADD CONSTRAINT "ReceitaPrevista_criadoPorId_fkey"
      FOREIGN KEY ("criadoPorId") REFERENCES "User"(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ReceitaPrevista_periodo_idx"        ON "ReceitaPrevista" (periodo);
CREATE INDEX IF NOT EXISTS "ReceitaPrevista_status_periodo_idx" ON "ReceitaPrevista" (status, periodo);
CREATE INDEX IF NOT EXISTS "ReceitaPrevista_condicaoId_idx"     ON "ReceitaPrevista" ("condicaoId");
CREATE INDEX IF NOT EXISTS "ReceitaPrevista_clienteId_idx"      ON "ReceitaPrevista" ("clienteId");
CREATE INDEX IF NOT EXISTS "ReceitaPrevista_centroCustoId_idx"  ON "ReceitaPrevista" ("centroCustoId");
CREATE INDEX IF NOT EXISTS "ReceitaPrevista_categoriaId_idx"    ON "ReceitaPrevista" ("categoriaId");


-- ────────────────────────────────────────────────────────────────────────────
-- 5. SLA DE PIPELINE
--
-- `slaDias` NULO é o default, e é deliberado: um default numérico faria toda
-- etapa já existente nascer com um prazo que ninguém definiu, e cards
-- passariam a vencer SLA retroativamente no primeiro carregamento do quadro.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "PipelineEtapa"
  ADD COLUMN IF NOT EXISTS "slaDias" INTEGER;

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "etapaEntradaEm" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Deal_etapaId_etapaEntradaEm_idx"
  ON "Deal" ("etapaId", "etapaEntradaEm");


-- ────────────────────────────────────────────────────────────────────────────
-- 6. BACKFILL DE Deal."etapaEntradaEm"
--
-- A partir do HISTÓRICO, nunca de `createdAt` do card: o relógio do SLA
-- reinicia a cada mudança de etapa, e medir desde a criação faria um card que
-- acabou de chegar em Proposta aparecer vencido pelo tempo que passou em
-- Prospecção.
--
-- A fonte é `PipelineMovimentacao`: a ÚLTIMA movimentação cujo destino é a
-- etapa em que o card está hoje. Cards sem histórico (anteriores ao registro
-- de movimentações) caem em `createdAt` — é a única informação verdadeira que
-- existe sobre eles, e a alternativa seria deixá-los fora do SLA para sempre.
--
-- Idempotente: só preenche onde está nulo.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE "Deal" d
SET "etapaEntradaEm" = sub."createdAt"
FROM (
  SELECT m."dealId", m."etapaDestinoId", MAX(m."createdAt") AS "createdAt"
  FROM "PipelineMovimentacao" m
  WHERE m.tipo IN ('CRIACAO', 'MOVIMENTO_ETAPA', 'TRANSFERENCIA_FUNIL')
  GROUP BY m."dealId", m."etapaDestinoId"
) sub
WHERE d.id = sub."dealId"
  AND d."etapaId" = sub."etapaDestinoId"
  AND d."etapaEntradaEm" IS NULL;

-- Retaguarda para os cards sem histórico de movimentação na etapa atual.
UPDATE "Deal"
SET "etapaEntradaEm" = "createdAt"
WHERE "etapaEntradaEm" IS NULL
  AND "etapaId" IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. AJUSTE CONTÁBIL DO LANÇAMENTO BAAS
--
-- ── A REGRA NOVA ──────────────────────────────────────────────────────────
--
-- Quando o saldo apurado do período é lançado, esse saldo ESTAVA NA CONTA DA
-- BASS PAGO. Portanto o valor integral apurado entra como RECEITA da Bass
-- Pago — e ela inclui as tarifas, o overprice E a parcela do parceiro. A
-- parcela devida ao BaaS é, depois, DESPESA da Bass Pago.
--
--   RECEITA BaaS  = saldo integral apurado no período  ("saldoInicial")
--   DESPESA BaaS  = valor/comissão devida ao parceiro  ("valorCliente")
--   RESULTADO     = Receita − Despesa = tarifas + overprice
--
-- O RESULTADO NÃO MUDA. O que muda é que ele deixa de ser uma receita líquida
-- de 25 mil e passa a ser 100 mil de receita menos 75 mil de despesa. O
-- pagamento ao BaaS deixa de ficar fora do resultado.
--
-- ── POR QUE OS REGISTROS ANTIGOS TÊM DE SER RESTATED ──────────────────────
--
-- Até a v27, a despesa do repasse era EXCLUÍDA do Resultado por um filtro em
-- `lib/financeiro.ts` (`SEM_REPASSE_BAAS`), e a receita gravada era só
-- tarifas + overprice. Esse filtro sai nesta rodada. Se os lançamentos antigos
-- ficassem como estão, o Resultado passaria a subtrair 75 mil de uma receita
-- de 25 mil — um prejuízo de 50 mil que nunca existiu, em todos os períodos
-- já lançados.
--
-- Então restaurar a receita ao valor integral não é "alterar histórico por
-- conveniência": é o que mantém o resultado dos períodos passados correto sob
-- a regra nova. O valor do RESULTADO de cada período fica idêntico ao que era
-- antes da migration.
--
-- ── O QUE NÃO É TOCADO ────────────────────────────────────────────────────
--
--   * a DESPESA do repasse — já vale `valorCliente`, que é o número certo;
--   * o TÍTULO A RECEBER JÁ PAGO OU FATURADO — ver a seção 7b;
--   * nenhum lançamento financeiro que não tenha nascido de um Lançamento
--     BaaS — o `JOIN` por `lancamentoId` garante isso.
--
-- Idempotente: a segunda execução não encontra nada para atualizar, porque o
-- WHERE compara com o valor de destino.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE "LancamentoFinanceiro" lf
SET valor = lb."saldoInicial",
    descricao = 'Apuração BaaS — ' || cc."nomeFantasia",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "LancamentoBaas" lb
JOIN "CondicaoComercial" cc ON cc.id = lb."condicaoId"
WHERE lb."lancamentoId" = lf.id
  AND lf.tipo = 'RECEITA'
  AND lf.valor <> lb."saldoInicial";

-- A descrição da DESPESA passa a dizer o que ela é sob a regra nova: a
-- comissão devida ao parceiro, e não um "repasse" fora do resultado.
UPDATE "LancamentoFinanceiro" lf
SET descricao = 'Comissão BaaS — ' || cc."nomeFantasia",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "LancamentoBaas" lb
JOIN "CondicaoComercial" cc ON cc.id = lb."condicaoId"
WHERE lb."contaPagarId" = lf.id
  AND lf.tipo = 'DESPESA'
  AND lf.descricao <> 'Comissão BaaS — ' || cc."nomeFantasia";


-- ────────────────────────────────────────────────────────────────────────────
-- 7b. O TÍTULO A RECEBER PASSA A ESPELHAR A RECEITA
--
-- ── A DECISÃO ─────────────────────────────────────────────────────────────
--
-- Até a v27 o título a receber valia só as TARIFAS, porque a receita era a
-- margem. Com a receita bruta, a assimetria deixou de ter sentido: um título
-- de 10 mil ao lado de uma receita de 100 mil obriga quem confere a somar os
-- dois lados à mão para descobrir que a diferença era o overprice.
--
-- Então o título passa a valer o saldo INTEGRAL apurado, igual à receita.
--
-- ── POR QUE ISSO NÃO CRIA DUPLA CONTAGEM ──────────────────────────────────
--
-- Porque nem `lib/financeiro.ts` nem `lib/previsao.ts` leem `ContaReceber`
-- para apurar receita, resultado ou caixa — a origem única é
-- `LancamentoFinanceiro`. O título existe para a COBRANÇA e para a
-- INADIMPLÊNCIA, e não entra em nenhuma soma de receita.
--
-- ── O QUE NÃO É REESCRITO, E A CONSEQUÊNCIA ───────────────────────────────
--
-- Título JÁ PAGO, FATURADO ou com data de pagamento NÃO é tocado. Dois
-- motivos:
--
--   1. o valor movimentado é o histórico. Reescrevê-lo apagaria o que de fato
--      foi recebido, e um título pago de 10 mil passaria a dizer que 100 mil
--      entraram;
--   2. nota fiscal emitida é problema fiscal, não ajuste de cadastro — é a
--      mesma razão por que `liquidacaoDe` trava a edição desses lançamentos.
--
-- CONSEQUÊNCIA ACEITA: em Contas a Receber vão conviver títulos antigos pelas
-- tarifas e novos pelo integral. É assimetria real, e preferível a reescrever
-- liquidação — a tela de Lançamentos BaaS mostra a composição de cada um.
--
-- Idempotente: o WHERE compara com o valor de destino.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE "ContaReceber" cr
SET valor = lb."saldoInicial",
    descricao = 'Apuração BaaS — ' || cc."nomeFantasia",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "LancamentoBaas" lb
JOIN "CondicaoComercial" cc ON cc.id = lb."condicaoId"
WHERE lb."contaReceberId" = cr.id
  -- NUNCA mexe em liquidado: o valor movimentado é o histórico.
  AND cr.status NOT IN ('PAGO', 'FATURADO')
  AND cr."dataPago" IS NULL
  AND cr.valor <> lb."saldoInicial";

-- Quantos ficaram para trás, e por quê — para quem aplicar a migration saber
-- que a assimetria existe em vez de descobri-la na tela.
DO $$
DECLARE liquidados int;
BEGIN
  SELECT count(*) INTO liquidados
  FROM "ContaReceber" cr
  JOIN "LancamentoBaas" lb ON lb."contaReceberId" = cr.id
  WHERE cr.status IN ('PAGO', 'FATURADO') OR cr."dataPago" IS NOT NULL;

  IF liquidados > 0 THEN
    RAISE NOTICE 'v28: % titulo(s) a receber JA LIQUIDADO(S) mantiveram o valor antigo (tarifas). Liquidacao nao se reescreve.', liquidados;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 8. PERMISSÕES DE PREVISÃO
--
-- `view_previsao` e `manage_previsao` são chaves COMUNS, não restritas: elas
-- seguem o atalho de ADMIN e o default por perfil, como `view_financeiro`.
-- Previsão é trabalho do Financeiro, não um dado de sócio.
--
-- Esta seção CONCEDE as chaves a quem já administra o financeiro — quem tem
-- `manage_financeiro` gravado recebe as duas, e quem tem apenas
-- `view_financeiro` recebe a de leitura. Sem isto, um usuário com lista
-- explícita de permissões não veria o módulo novo, mesmo respondendo pelo
-- Financeiro.
--
-- Usuários SEM lista (`permissoes` nulo) não precisam de nada aqui: eles caem
-- no `DEFAULT_PERMISSIONS` do perfil, que já inclui as chaves novas.
-- ────────────────────────────────────────────────────────────────────────────
-- ── A CONCESSÃO, LINHA POR LINHA, COM TOLERÂNCIA A JSON INVÁLIDO ───────────
--
-- POR QUE NÃO UM `UPDATE` ÚNICO.
--
-- A primeira versão desta seção era um `UPDATE ... WHERE permissoes::jsonb ?
-- 'manage_financeiro'`. Elegante, e frágil num ponto que importa: `::jsonb`
-- ESTOURA quando o texto não é JSON válido, e o erro derruba o statement
-- inteiro — ou seja, a migration toda.
--
-- E JSON inválido é um estado POSSÍVEL nesta coluna. `listaDe()` (em
-- lib/autorizacao.ts) trata explicitamente o caso: "lista corrompida é ausência
-- de permissão, nunca permissão total". O aplicativo tolera; a migration tinha
-- de tolerar também, senão um único registro malformado em Production impediria
-- o deploy inteiro — e o diagnóstico seria um erro de cast sem dizer qual linha.
--
-- Então: laço com `EXCEPTION` por linha. Quem não puder ser interpretado é
-- PULADO e contado, e a migration segue. O usuário pulado simplesmente não
-- recebe a chave automaticamente — ele é concedido na tela de Usuários, que é
-- onde essa decisão pertence.
--
-- Idempotente: a condição só casa quando a chave AINDA NÃO está na lista.
DO $$
DECLARE
  u            RECORD;
  lista        jsonb;
  novas        text[];
  pulados      int := 0;
  concedidos   int := 0;
BEGIN
  FOR u IN SELECT id, permissoes FROM "User" WHERE permissoes IS NOT NULL LOOP
    BEGIN
      lista := u.permissoes::jsonb;
    EXCEPTION WHEN others THEN
      -- Lista corrompida: não se adivinha o que ela queria dizer.
      pulados := pulados + 1;
      CONTINUE;
    END;

    IF jsonb_typeof(lista) <> 'array' THEN
      pulados := pulados + 1;
      CONTINUE;
    END IF;

    novas := ARRAY[]::text[];

    /*
     * `array_append`, e NÃO `novas || 'view_previsao'`.
     *
     * O operador `||` entre `text[]` e um literal sem tipo é AMBÍGUO: o
     * Postgres resolve o literal como ARRAY e tenta parseá-lo, estourando
     *
     *     22P02: malformed array literal: "view_previsao"
     *     DETAIL: Array value must start with "{" or dimension information.
     *
     * `array_append(text[], text)` não tem essa ambiguidade — a assinatura diz
     * que o segundo argumento é um elemento.
     *
     * Esta linha JÁ FALHOU numa tentativa de aplicação, e o motivo de ter
     * passado nos testes locais vale registrar: nenhum usuário do banco de
     * verificação tinha `manage_financeiro` na lista ANTES da migration rodar,
     * então o ramo nunca era executado. SQL sem dado que o exercite não está
     * testado — está apenas sintaticamente aceito.
     */
    -- Quem ADMINISTRA o financeiro recebe as duas chaves.
    IF lista ? 'manage_financeiro' THEN
      IF NOT (lista ? 'view_previsao') THEN
        novas := array_append(novas, 'view_previsao');
      END IF;
      IF NOT (lista ? 'manage_previsao') THEN
        novas := array_append(novas, 'manage_previsao');
      END IF;
    -- Quem apenas CONSULTA recebe só a de leitura: lançar orçamento é decisão
    -- de quem responde pelo planejamento, não consequência de ver o financeiro.
    ELSIF lista ? 'view_financeiro' THEN
      IF NOT (lista ? 'view_previsao') THEN
        novas := array_append(novas, 'view_previsao');
      END IF;
    END IF;

    IF array_length(novas, 1) IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE "User"
    SET permissoes = (lista || to_jsonb(novas))::text,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = u.id;

    concedidos := concedidos + 1;
  END LOOP;

  RAISE NOTICE 'v28 permissões de Previsão: % usuários concedidos, % pulados por lista inválida',
    concedidos, pulados;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- CENTROS DE CUSTO INICIAIS
--
-- As sete áreas da Bass Pago. Entram aqui, e não num seed, porque o módulo de
-- Previsão é inútil sem nenhum centro de custo cadastrado: o primeiro
-- orçamento não teria onde ser lançado.
--
-- Idempotente pelo nome: reexecutar não duplica, e um centro renomeado na tela
-- NÃO é recriado com o nome antigo (o INSERT só age quando o nome não existe,
-- então renomear "Comercial" para "Vendas" faria "Comercial" voltar — por isso
-- o guard é por `codigo`, que a tela não oferece para edição em massa).
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO "CentroCusto" (id, nome, codigo, ativo, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.nome, v.codigo, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('Comercial',      'COM'),
  ('Financeiro',     'FIN'),
  ('Operações',      'OPS'),
  ('Tecnologia',     'TEC'),
  ('Compliance',     'CPL'),
  ('Marketing',      'MKT'),
  ('Administrativo', 'ADM')
) AS v(nome, codigo)
WHERE NOT EXISTS (
  SELECT 1 FROM "CentroCusto" c WHERE c.codigo = v.codigo OR c.nome = v.nome
);


-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY NAS TABELAS NOVAS
--
-- Mesma regra da v18, pelo mesmo motivo: o Supabase concede SELECT aos papéis
-- `anon` e `authenticated` por padrão, e o PostgREST expõe o schema `public`
-- na internet. A chave anon é `NEXT_PUBLIC_` e viaja no bundle do navegador —
-- uma tabela nova sem RLS nasce legível por qualquer pessoa que abra o app e
-- copie a chave. Orçamento e previsão de faturamento são exatamente o tipo de
-- dado que não pode sair por esse caminho.
--
-- `ENABLE ROW LEVEL SECURITY` sem criar política nenhuma: sem política, a
-- tabela nega tudo a quem está sujeito a RLS. O produto não usa PostgREST para
-- dado nenhum — o Prisma entra pelo papel `postgres`, que é dono das tabelas e
-- tem `rolbypassrls` —, então nada do aplicativo é afetado.
--
-- Escrever política aqui seria uma segunda descrição da autorização que já vive
-- em `lib/permissions.ts`, livre para divergir dela.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "CentroCusto"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Orcamento"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DespesaFutura"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReceitaPrevista" ENABLE ROW LEVEL SECURITY;
