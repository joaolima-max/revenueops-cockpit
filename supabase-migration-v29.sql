-- ============================================================================
-- v29 — NORMALIZACAO DO HISTORICO DIARIO
--       E AS TRES METAS DE RECEITA QUE ALIMENTAM A PREVISAO
--
-- Incremental e IDEMPOTENTE. Nenhum DROP, TRUNCATE ou DELETE. Nenhum
-- lancamento e apagado. Pode ser executada mais de uma vez sem efeito
-- adicional.
--
-- ── APLICADA EM PRODUCTION COMO DUAS MIGRATIONS ─────────────────────────────
--
-- Este arquivo e o registro FIEL do que rodou, e rodou em duas partes:
--
--   v29a_metatipo_receita_previsao        a secao 1
--   v29b_normalizacao_historico_diario    as secoes 2 a 5
--
-- A razao da divisao: `ALTER TYPE ... ADD VALUE` e a unica instrucao aqui que
-- o Postgres trata de forma especial dentro de transacao. Isolando-a, a
-- normalizacao (parte 2) pode abortar e ser reexecutada sem arrastar o enum
-- com ela — e as tres linhas do enum sao aditivas e idempotentes, logo seguras
-- por si.
--
-- O TEXTO E SEM ACENTO de proposito: e exatamente o que foi submetido ao
-- banco. Um arquivo que "documenta" a migration com outra pontuacao do que a
-- que rodou e um arquivo que ninguem pode conferir.
--
-- ÍNDICE
--
--   1. MetaTipo                  — tres novos tipos de meta de receita
--   2. NormalizacaoHistorica     — a tabela de rastreabilidade
--   3. NORMALIZACAO              — distribui os consolidados mensais dia a dia
--   4. CONFERENCIA               — aborta a migration inteira se houver
--                                  qualquer divergencia de soma
--   5. RLS na tabela nova
--
-- ============================================================================
-- O DEFEITO QUE A SECAO 3 CORRIGE
--
-- De fevereiro a setembro de 2026, `LancamentoDiario` tinha UM registro por
-- mes, gravado no ULTIMO DIA do mes, carregando o valor do MES INTEIRO:
--
--   30/09/2026   TPV R$ 1.484.984.678,90   —   o TPV de setembro todo
--
-- Isso quebrava tudo o que le a tabela como serie diaria:
--
--   - a "Evolucao Atividade Operacional Diaria" desenharia 29 dias vazios e
--     um pico de R$ 1,4 bilhao — e e por isso que havia um piso artificial de
--     01/10/2026 cortando o historico inteiro;
--   - a comparacao "01–07/10 vs 01–07/09" nao tinha com o que comparar:
--     01–07/09 nao existia como dado;
--   - a media e a tendencia do forecast liam 1 "dia" por mes.
--
-- A CORRECAO: distribuir o valor mensal pelos dias do mes.
--
--   VALOR DIARIO = VALOR MENSAL / QUANTIDADE DE DIAS DO MES
--
-- com o ULTIMO DIA absorvendo o arredondamento, para que
--
--   SOMA DISTRIBUIDA = VALOR ORIGINAL
--
-- exatamente. "Exatamente" aqui e na PRECISAO DO DADO — centavos —, e isso e
-- uma decisao consciente, nao uma concessao: as colunas monetarias sao
-- `double precision`, e a soma de 30 doubles de ~R$ 49 milhoes acumula erro na
-- ordem de 1e-7. Igualdade bit a bit de float nao e um criterio de correcao
-- para dinheiro; igualdade em centavos e. A secao 4 confere com
-- `round(..., 2)` e ABORTA a migration inteira se algum mes divergir.
--
-- ── FLUXO x ESTOQUE: SO O FLUXO E DIVIDIDO ──────────────────────────────────
--
-- DIVIDIDOS (fluxo — acumulam ao longo do mes):
--   receitaTarifaria, tpv, qtdTransacoes, qtdMed
--
-- NAO DIVIDIDOS (estoque — sao uma fotografia de um instante):
--   saldoEmConta, clientesAtivos
--
-- Dividir um SALDO por 30 produziria "o saldo do dia" como 1/30 do saldo, que
-- nao e o saldo de nenhum dia. E replica-lo nos 30 dias seria inventar 29
-- observacoes que ninguem fez.
--
-- Entao o estoque FICA ONDE ESTAVA: no registro original, que e o ultimo dia
-- do mes. Os dias criados recebem 0 em `saldoEmConta` (o default da coluna) e
-- NULL em `clientesAtivos` — que e exatamente "nao informado naquele dia", a
-- semantica que a coluna ja documenta.
--
-- CONSEQUENCIA, declarada: `clientesAtivos` do mes continua correto, porque
-- `clientesAtivosDoMes` le o ULTIMO dia que informou (setembro continua
-- 1.663). Ja `saldoMedio` passa a dividir por 30 em vez de por 1 — e o efeito
-- nos dados REAIS e nenhum, porque `saldoEmConta` e 0 em todos os oito
-- consolidados. Esta escrito aqui para que, se um dia houver consolidado com
-- saldo, ninguem precise descobrir isto por acidente.
--
-- ── O ORIGINAL NAO E APAGADO ────────────────────────────────────────────────
--
-- A data do consolidado JA E o ultimo dia do mes, entao ele nao precisa ser
-- apagado nem recriado: ele VIRA o ultimo dia, com o valor da ultima cota mais
-- o resto. Os dias 1..n-1 sao linhas NOVAS.
--
-- Os valores originais ficam gravados em `NormalizacaoHistorica` — e o que
-- torna a conferencia possivel depois do fato, e e o que torna esta migration
-- idempotente.
--
-- ── A JANELA E NOMEADA DE PROPOSITO ────────────────────────────────────────
--
-- A secao 3 so toca meses entre 2026-02 e 2026-09. Um criterio generico
-- ("mes com um lancamento so, no ultimo dia") pegaria, no futuro, um mes
-- legitimo em que so o dia 31 foi lancado — e normaliza-lo distribuiria um dia
-- real por 31 dias. Uma migration de dado conserta o dado que ela conhece.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — aplicada como `v29a_metatipo_receita_previsao`
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. METATIPO — as tres metas de receita que alimentam a Previsao
--
-- RECEITA PREVISTA = MRR projetado + meta tarifaria + meta de lancamentos
-- WL/BaaS + meta de servicos + meta de setup (+ receitas lancadas).
--
-- Sustentacao e mensalidade de API NAO tem meta: elas entram pelo MRR
-- projetado, que vem do cadastro de condicoes comerciais e da carteira.
-- Meta-las contaria o mesmo contrato duas vezes.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'RECEITA_LANCAMENTOS_WL_BAAS';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'RECEITA_SERVICOS';
ALTER TYPE "MetaTipo" ADD VALUE IF NOT EXISTS 'RECEITA_SETUP';


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — aplicada como `v29b_normalizacao_historico_diario`
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 2. NORMALIZACAOHISTORICA — a rastreabilidade
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NormalizacaoHistorica" (
  id                       TEXT PRIMARY KEY,
  "lancamentoId"           TEXT NOT NULL,
  "dataOriginal"           DATE NOT NULL,
  "diasNoMes"              INTEGER NOT NULL,
  "receitaOriginal"        DOUBLE PRECISION NOT NULL,
  "tpvOriginal"            DOUBLE PRECISION NOT NULL,
  "transacoesOriginal"     INTEGER NOT NULL,
  "medOriginal"            INTEGER NOT NULL,
  "saldoOriginal"          DOUBLE PRECISION NOT NULL,
  "clientesAtivosOriginal" INTEGER,
  "diasCriados"            INTEGER NOT NULL,
  "aplicadoEm"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "NormalizacaoHistorica_dataOriginal_key"
  ON "NormalizacaoHistorica" ("dataOriginal");
CREATE INDEX IF NOT EXISTS "NormalizacaoHistorica_dataOriginal_idx"
  ON "NormalizacaoHistorica" ("dataOriginal");


-- ────────────────────────────────────────────────────────────────────────────
-- 3. A NORMALIZACAO
-- ────────────────────────────────────────────────────────────────────────────
DO $normaliza$
DECLARE
  r              RECORD;
  dias           INTEGER;
  d              INTEGER;
  ct_rec BIGINT; base_rec BIGINT; resto_rec BIGINT;
  ct_tpv BIGINT; base_tpv BIGINT; resto_tpv BIGINT;
  base_tx  INTEGER; resto_tx  INTEGER;
  base_med INTEGER; resto_med INTEGER;
  criados        INTEGER;
  total_meses    INTEGER := 0;
BEGIN
  FOR r IN
    WITH por_mes AS (
      SELECT
        date_trunc('month', data)::date AS mes,
        count(*)                        AS n,
        min(data)                       AS data_unica
      FROM "LancamentoDiario"
      -- A JANELA NOMEADA. Ver o cabecalho: um criterio generico pegaria, no
      -- futuro, um mes legitimo lancado so no ultimo dia.
      WHERE data >= DATE '2026-02-01' AND data < DATE '2026-10-01'
      GROUP BY 1
    )
    SELECT l.*
    FROM por_mes m
    JOIN "LancamentoDiario" l ON l.data = m.data_unica
    WHERE m.n = 1
      -- O consolidado esta no ULTIMO DIA do mes. Um lancamento no dia 05 nao
      -- e consolidado de nada — e um dia solto.
      AND m.data_unica = (m.mes + INTERVAL '1 month - 1 day')::date
      -- IDEMPOTENCIA: mes ja normalizado nao e tocado de novo.
      AND NOT EXISTS (
        SELECT 1 FROM "NormalizacaoHistorica" nh WHERE nh."dataOriginal" = l.data
      )
    ORDER BY l.data
  LOOP
    dias := EXTRACT(DAY FROM (date_trunc('month', r.data) + INTERVAL '1 month - 1 day'))::int;

    -- Um mes de um dia nao existe; se existisse, dividir por 1 seria no-op.
    IF dias <= 1 THEN CONTINUE; END IF;

    -- VALOR NEGATIVO ABORTA. A distribuicao usa divisao inteira, que trunca
    -- para zero — com valor negativo o resto teria sinal e a soma nao
    -- fecharia. Nenhum consolidado real e negativo; se um aparecer, e melhor
    -- a migration parar do que distribuir errado em silencio.
    IF r."receitaTarifaria" < 0 OR r.tpv < 0
       OR r."qtdTransacoes" < 0 OR r."qtdMed" < 0 THEN
      RAISE EXCEPTION
        'v29: lancamento % (%) tem valor negativo — normalizacao abortada',
        r.id, r.data;
    END IF;

    -- CENTAVOS, em numeric, para que a divisao seja exata e o resto conhecido.
    ct_rec    := round(r."receitaTarifaria"::numeric * 100)::bigint;
    base_rec  := ct_rec / dias;
    resto_rec := ct_rec - base_rec * dias;

    ct_tpv    := round(r.tpv::numeric * 100)::bigint;
    base_tpv  := ct_tpv / dias;
    resto_tpv := ct_tpv - base_tpv * dias;

    base_tx   := r."qtdTransacoes" / dias;
    resto_tx  := r."qtdTransacoes" - base_tx * dias;

    base_med  := r."qtdMed" / dias;
    resto_med := r."qtdMed" - base_med * dias;

    -- OS DIAS 1..n-1 SAO LINHAS NOVAS.
    --
    -- `saldoEmConta` fica em 0 e `clientesAtivos` em NULL: sao ESTOQUE, e o
    -- valor observado continua no registro original (o ultimo dia). Ver o
    -- cabecalho.
    criados := 0;
    FOR d IN 1 .. (dias - 1) LOOP
      INSERT INTO "LancamentoDiario" (
        id, data, "receitaTarifaria", tpv, "saldoEmConta",
        "qtdTransacoes", "qtdMed", "clientesAtivos", notas,
        "createdAt", "updatedAt"
      ) VALUES (
        'v29norm_' || to_char(r.data, 'YYYYMMDD') || '_' || lpad(d::text, 2, '0'),
        (date_trunc('month', r.data) + ((d - 1) || ' days')::interval)::date,
        (base_rec::numeric / 100)::double precision,
        (base_tpv::numeric / 100)::double precision,
        0,
        base_tx,
        base_med,
        NULL,
        'Distribuido do consolidado mensal de ' || to_char(r.data, 'DD/MM/YYYY')
          || ' (migration v29). Valor diario = valor mensal / ' || dias || ' dias.',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      -- Se o dia ja existir, nao ha nada a fazer: o mes tinha 1 registro so
      -- quando entrou no laco, entao isto so pode acontecer numa reexecucao
      -- parcial — e ai a linha correta ja esta la.
      ON CONFLICT (data) DO NOTHING;

      IF FOUND THEN criados := criados + 1; END IF;
    END LOOP;

    -- O REGISTRO ORIGINAL VIRA O ULTIMO DIA, com a sua cota mais o RESTO.
    -- E isso que faz a soma fechar exatamente no valor original.
    UPDATE "LancamentoDiario" SET
      "receitaTarifaria" = ((base_rec + resto_rec)::numeric / 100)::double precision,
      tpv                = ((base_tpv + resto_tpv)::numeric / 100)::double precision,
      "qtdTransacoes"    = base_tx + resto_tx,
      "qtdMed"           = base_med + resto_med,
      notas              = coalesce(r.notas || ' | ', '')
        || 'Era o consolidado do mes; virou o ultimo dia na migration v29, '
        || 'absorvendo o arredondamento da distribuicao.',
      "updatedAt"        = CURRENT_TIMESTAMP
    WHERE id = r.id;

    -- A RASTREABILIDADE, com os valores ORIGINAIS.
    INSERT INTO "NormalizacaoHistorica" (
      id, "lancamentoId", "dataOriginal", "diasNoMes",
      "receitaOriginal", "tpvOriginal", "transacoesOriginal", "medOriginal",
      "saldoOriginal", "clientesAtivosOriginal", "diasCriados"
    ) VALUES (
      'v29norm_' || to_char(r.data, 'YYYYMMDD'),
      r.id, r.data, dias,
      r."receitaTarifaria", r.tpv, r."qtdTransacoes", r."qtdMed",
      r."saldoEmConta", r."clientesAtivos", criados
    )
    ON CONFLICT ("dataOriginal") DO NOTHING;

    total_meses := total_meses + 1;

    RAISE NOTICE
      'v29: % normalizado — % dias, % linhas criadas (TPV %, receita %, tx %, MED %)',
      to_char(r.data, 'YYYY-MM'), dias, criados,
      r.tpv, r."receitaTarifaria", r."qtdTransacoes", r."qtdMed";
  END LOOP;

  RAISE NOTICE 'v29: % mes(es) normalizado(s) nesta execucao.', total_meses;
END
$normaliza$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. CONFERENCIA — a migration ABORTA se houver qualquer divergencia
--
-- Para CADA mes normalizado: a soma dos dias do mes tem de ser identica ao
-- valor original gravado em `NormalizacaoHistorica`.
--
-- Dinheiro e conferido em CENTAVOS (`round(..., 2)`), que e a precisao do
-- dado. Contagens sao conferidas como inteiro, exatamente. Ver o cabecalho
-- para por que igualdade bit a bit de `double precision` nao e o criterio.
--
-- `RAISE EXCEPTION` desfaz a transacao INTEIRA — a tabela e toda a
-- distribuicao —, que e precisamente o comportamento pedido: nao prosseguir se
-- houver divergencia.
-- ────────────────────────────────────────────────────────────────────────────
DO $confere$
DECLARE
  c          RECORD;
  divergente INTEGER := 0;
BEGIN
  FOR c IN
    SELECT
      to_char(nh."dataOriginal", 'YYYY-MM')                     AS mes,
      nh."diasNoMes"                                            AS dias,
      nh."receitaOriginal", nh."tpvOriginal",
      nh."transacoesOriginal", nh."medOriginal",
      (SELECT count(*) FROM "LancamentoDiario" l
         WHERE l.data >= date_trunc('month', nh."dataOriginal")::date
           AND l.data <  (date_trunc('month', nh."dataOriginal") + INTERVAL '1 month')::date
      )                                                         AS linhas,
      (SELECT round(sum(l."receitaTarifaria")::numeric, 2) FROM "LancamentoDiario" l
         WHERE l.data >= date_trunc('month', nh."dataOriginal")::date
           AND l.data <  (date_trunc('month', nh."dataOriginal") + INTERVAL '1 month')::date
      )                                                         AS soma_rec,
      (SELECT round(sum(l.tpv)::numeric, 2) FROM "LancamentoDiario" l
         WHERE l.data >= date_trunc('month', nh."dataOriginal")::date
           AND l.data <  (date_trunc('month', nh."dataOriginal") + INTERVAL '1 month')::date
      )                                                         AS soma_tpv,
      (SELECT sum(l."qtdTransacoes") FROM "LancamentoDiario" l
         WHERE l.data >= date_trunc('month', nh."dataOriginal")::date
           AND l.data <  (date_trunc('month', nh."dataOriginal") + INTERVAL '1 month')::date
      )                                                         AS soma_tx,
      (SELECT sum(l."qtdMed") FROM "LancamentoDiario" l
         WHERE l.data >= date_trunc('month', nh."dataOriginal")::date
           AND l.data <  (date_trunc('month', nh."dataOriginal") + INTERVAL '1 month')::date
      )                                                         AS soma_med
    FROM "NormalizacaoHistorica" nh
    ORDER BY nh."dataOriginal"
  LOOP
    RAISE NOTICE
      'v29 conferencia | % | dias % | linhas % | TPV %=% | receita %=% | tx %=% | MED %=%',
      c.mes, c.dias, c.linhas,
      round(c."tpvOriginal"::numeric, 2), c.soma_tpv,
      round(c."receitaOriginal"::numeric, 2), c.soma_rec,
      c."transacoesOriginal", c.soma_tx,
      c."medOriginal", c.soma_med;

    IF c.linhas <> c.dias THEN
      divergente := divergente + 1;
      RAISE WARNING 'v29 DIVERGENCIA | % | esperava % linhas, encontrou %',
        c.mes, c.dias, c.linhas;
    END IF;

    IF c.soma_tpv IS DISTINCT FROM round(c."tpvOriginal"::numeric, 2) THEN
      divergente := divergente + 1;
      RAISE WARNING 'v29 DIVERGENCIA | % | TPV: original %, soma %',
        c.mes, round(c."tpvOriginal"::numeric, 2), c.soma_tpv;
    END IF;

    IF c.soma_rec IS DISTINCT FROM round(c."receitaOriginal"::numeric, 2) THEN
      divergente := divergente + 1;
      RAISE WARNING 'v29 DIVERGENCIA | % | receita: original %, soma %',
        c.mes, round(c."receitaOriginal"::numeric, 2), c.soma_rec;
    END IF;

    IF c.soma_tx IS DISTINCT FROM c."transacoesOriginal" THEN
      divergente := divergente + 1;
      RAISE WARNING 'v29 DIVERGENCIA | % | transacoes: original %, soma %',
        c.mes, c."transacoesOriginal", c.soma_tx;
    END IF;

    IF c.soma_med IS DISTINCT FROM c."medOriginal" THEN
      divergente := divergente + 1;
      RAISE WARNING 'v29 DIVERGENCIA | % | MED: original %, soma %',
        c.mes, c."medOriginal", c.soma_med;
    END IF;
  END LOOP;

  IF divergente > 0 THEN
    RAISE EXCEPTION
      'v29 ABORTADA: % divergencia(s) entre a soma distribuida e o valor original. '
      'Nada foi alterado.', divergente;
  END IF;

  RAISE NOTICE 'v29: conferencia OK — nenhuma divergencia.';
END
$confere$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY NA TABELA NOVA
--
-- Mesma razao e mesma forma da v28: o Supabase expoe o schema publico via
-- PostgREST, e uma tabela nova sem RLS nasce legivel por qualquer pessoa que
-- abra o app e chame a API de dados com a chave anonima.
--
-- `ENABLE ROW LEVEL SECURITY` sem politica nenhuma: sem politica, a tabela
-- nega tudo a quem esta sujeito a RLS. O Prisma entra pelo papel `postgres`,
-- que e dono das tabelas e tem `rolbypassrls`, entao nada do aplicativo e
-- afetado.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "NormalizacaoHistorica" ENABLE ROW LEVEL SECURITY;
