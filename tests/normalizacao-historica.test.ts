/**
 * NORMALIZAÇÃO DO HISTÓRICO DIÁRIO — a migration v29.
 *
 * ── O QUE SE PRENDE AQUI, E POR QUE ──────────────────────────────────────
 *
 * A distribuição é feita em SQL, numa migration, e por isso não há função
 * TypeScript para chamar. O que estes testes verificam é de duas naturezas:
 *
 *   1. A ARITMÉTICA. Reimplementada aqui e exercitada contra os OITO
 *      consolidados REAIS de Production. A invariante é uma só —
 *
 *        SOMA DISTRIBUÍDA = VALOR ORIGINAL
 *
 *      — e ela é verificada em CENTAVOS, que é a precisão do dado. As colunas
 *      monetárias são `double precision`, e a soma de 30 doubles de ~R$ 49
 *      milhões acumula erro na ordem de 1e-7: igualdade bit a bit de float
 *      não é critério de correção para dinheiro.
 *
 *   2. AS GARANTIAS DO TEXTO DA MIGRATION: idempotência, janela nomeada,
 *      ausência de DELETE, rastreabilidade, e o aborto em caso de divergência.
 *
 * O teste da aritmética não é cerimônia: foi ele que decidiu a forma da
 * migration antes de ela rodar em Production, e é ele que pega qualquer
 * reescrita futura que troque "último dia absorve o resto" por
 * arredondamento por dia.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const V29 = ler('supabase-migration-v29.sql')
const KPI = ler('lib/kpi.ts')
const SCHEMA = ler('prisma/schema.prisma')

/* ========================================================================= *
 * OS OITO CONSOLIDADOS REAIS
 *
 * Lidos de Production antes da migration. São a entrada do teste de
 * aritmética — e são também o registro de qual era o número original, que é
 * exatamente o que `NormalizacaoHistorica` guarda no banco.
 * ========================================================================= */

interface Consolidado {
  mes: string
  data: string
  dias: number
  receita: number
  tpv: number
  transacoes: number
  med: number
  saldo: number
  clientesAtivos: number | null
}

const CONSOLIDADOS: Consolidado[] = [
  { mes: '2026-02', data: '2026-02-28', dias: 28, receita: 0, tpv: 0, transacoes: 1660, med: 0, saldo: 0, clientesAtivos: null },
  { mes: '2026-03', data: '2026-03-31', dias: 31, receita: 0, tpv: 0, transacoes: 174082, med: 0, saldo: 0, clientesAtivos: null },
  { mes: '2026-04', data: '2026-04-30', dias: 30, receita: 0, tpv: 0, transacoes: 454302, med: 0, saldo: 0, clientesAtivos: null },
  { mes: '2026-05', data: '2026-05-31', dias: 31, receita: 0, tpv: 0, transacoes: 1707973, med: 0, saldo: 0, clientesAtivos: null },
  { mes: '2026-06', data: '2026-06-30', dias: 30, receita: 0, tpv: 929129089.49, transacoes: 2439787, med: 0, saldo: 0, clientesAtivos: null },
  { mes: '2026-07', data: '2026-07-31', dias: 31, receita: 516871.35, tpv: 1027044322, transacoes: 2800000, med: 31664, saldo: 0, clientesAtivos: null },
  { mes: '2026-08', data: '2026-08-31', dias: 31, receita: 376029.78, tpv: 1117956348, transacoes: 3000000, med: 38254, saldo: 0, clientesAtivos: null },
  { mes: '2026-09', data: '2026-09-30', dias: 30, receita: 481555.57, tpv: 1484984678.9, transacoes: 4188636, med: 56490, saldo: 0, clientesAtivos: 1663 },
]

/* ========================================================================= *
 * A ARITMÉTICA DA DISTRIBUIÇÃO — a mesma da migration
 * ========================================================================= */

/** Valor monetário em centavos inteiros. É o grão da conta. */
const centavos = (v: number) => Math.round(v * 100)

/**
 * Distribui um total inteiro por `dias`, com o ÚLTIMO absorvendo o resto.
 *
 * É a forma da migration, e a razão dela: `base = total ÷ dias` (divisão
 * inteira) deixa um resto conhecido, e somá-lo ao último dia faz a soma fechar
 * EXATAMENTE. Arredondar cada dia para o mais próximo não fecharia — 30
 * arredondamentos para cima dariam até 15 centavos de sobra.
 */
function distribuir(total: number, dias: number): number[] {
  const base = Math.trunc(total / dias)
  const resto = total - base * dias
  return Array.from({ length: dias }, (_, i) => (i === dias - 1 ? base + resto : base))
}

test('a distribuicao de um inteiro fecha exatamente, em qualquer tamanho de mes', () => {
  for (const dias of [28, 29, 30, 31]) {
    for (const total of [0, 1, 7, 1660, 174082, 4188636, 148498467890]) {
      const cotas = distribuir(total, dias)
      assert.equal(cotas.length, dias)
      assert.equal(cotas.reduce((a, b) => a + b, 0), total,
        `${total} em ${dias} dias nao fechou`)
      // Nenhuma cota negativa, e o resto fica SÓ no último dia.
      for (const c of cotas) assert.ok(c >= 0)
      for (let i = 0; i < dias - 1; i++) assert.equal(cotas[i], cotas[0])
    }
  }
})

test('o ULTIMO dia e o que absorve o resto — nunca o primeiro', () => {
  // 1660 transacoes em 28 dias: 59 por dia, resto 8 no dia 28.
  const cotas = distribuir(1660, 28)
  assert.equal(cotas[0], 59)
  assert.equal(cotas[26], 59)
  assert.equal(cotas[27], 67)
  assert.equal(cotas.reduce((a, b) => a + b, 0), 1660)
})

test('OS OITO CONSOLIDADOS REAIS: soma distribuida = valor original, em centavos', () => {
  /**
   * A TABELA DE CONFERÊNCIA, em forma de teste. Mesmo critério da seção 4 da
   * migration, mesmos números, exercitados sem banco.
   */
  for (const c of CONSOLIDADOS) {
    const rec = distribuir(centavos(c.receita), c.dias)
    const tpv = distribuir(centavos(c.tpv), c.dias)
    const tx = distribuir(c.transacoes, c.dias)
    const med = distribuir(c.med, c.dias)

    assert.equal(rec.length, c.dias, `${c.mes}: numero de dias`)

    assert.equal(
      rec.reduce((a, b) => a + b, 0), centavos(c.receita),
      `${c.mes}: receita nao fechou`,
    )
    assert.equal(
      tpv.reduce((a, b) => a + b, 0), centavos(c.tpv),
      `${c.mes}: TPV nao fechou`,
    )
    assert.equal(
      tx.reduce((a, b) => a + b, 0), c.transacoes,
      `${c.mes}: transacoes nao fecharam`,
    )
    assert.equal(
      med.reduce((a, b) => a + b, 0), c.med,
      `${c.mes}: MED nao fechou`,
    )
  }
})

test('SETEMBRO, o caso de maior arredondamento, dia a dia', () => {
  /**
   * TPV de R$ 1.484.984.678,90 em 30 dias dá R$ 49.499.489,2966… por dia.
   * As 29 primeiras cotas ficam em R$ 49.499.489,29 e o dia 30 fica em
   * R$ 49.499.489,49 — os 20 centavos de resto.
   *
   * É o número que a migration gravou em Production, e está aqui para que uma
   * reescrita que mude a regra de arredondamento seja vista.
   */
  const set = CONSOLIDADOS.find((c) => c.mes === '2026-09')!
  const tpv = distribuir(centavos(set.tpv), set.dias)
  assert.equal(tpv[0] / 100, 49499489.29)
  assert.equal(tpv[28] / 100, 49499489.29)
  assert.equal(tpv[29] / 100, 49499489.49)

  const rec = distribuir(centavos(set.receita), set.dias)
  assert.equal(rec[0] / 100, 16051.85)
  assert.equal(rec[29] / 100, 16051.92)

  const tx = distribuir(set.transacoes, set.dias)
  assert.equal(tx[0], 139621)
  assert.equal(tx[29], 139627)
})

test('a comparacao 01–07/10 vs 01–07/09 passa a ter base dos dois lados', () => {
  /**
   * ESTE É O GANHO. Antes da normalização, "01–07/09" não existia como dado:
   * setembro tinha um registro só, no dia 30. A comparação do Cockpit não
   * tinha com o que comparar.
   *
   * Depois, 01–07/09 são sete cotas iguais — e a conta bate com o que
   * Production devolve (R$ 112.362,95 de receita).
   */
  const set = CONSOLIDADOS.find((c) => c.mes === '2026-09')!
  const rec = distribuir(centavos(set.receita), set.dias)
  const primeirosSete = rec.slice(0, 7).reduce((a, b) => a + b, 0) / 100
  assert.equal(primeirosSete, 112362.95)
})

/* ========================================================================= *
 * FLUXO × ESTOQUE
 * ========================================================================= */

test('a migration divide SO o fluxo — saldo e clientes ativos nao sao divididos', () => {
  /**
   * Dividir um SALDO por 30 produziria "o saldo do dia" como 1/30 do saldo,
   * que não é o saldo de nenhum dia. Replicá-lo nos 30 dias seria inventar 29
   * observações que ninguém fez.
   *
   * Então o estoque FICA no registro original — que é o último dia do mês — e
   * os dias criados recebem 0 / NULL.
   */
  const insert = V29.slice(V29.indexOf('INSERT INTO "LancamentoDiario" ('))
  const valores = insert.slice(0, insert.indexOf('ON CONFLICT'))

  // Os dias criados recebem NULL em clientesAtivos.
  assert.ok(valores.includes('NULL,'), 'os dias criados deixaram de ter clientesAtivos nulo')
  // E o UPDATE do original NAO toca saldo nem clientesAtivos.
  const update = V29.slice(
    V29.indexOf('UPDATE "LancamentoDiario" SET'),
    V29.indexOf('WHERE id = r.id;'),
  )
  assert.ok(!update.includes('"saldoEmConta"'), 'o saldo passou a ser reescrito')
  assert.ok(!update.includes('"clientesAtivos"'), 'clientes ativos passou a ser reescrito')
  // As quatro de FLUXO, sim.
  for (const col of ['"receitaTarifaria"', 'tpv', '"qtdTransacoes"', '"qtdMed"']) {
    assert.ok(update.includes(col), `${col} deixou de ser distribuida`)
  }
})

test('clientesAtivos do mes continua correto — e ESTOQUE, lido do ultimo dia', () => {
  // `clientesAtivosDoMes` escolhe o ultimo dia que INFORMOU o numero, pulando
  // os nulos. Deixar o valor so no dia original (que e o ultimo do mes) e o
  // que preserva setembro em 1.663.
  assert.ok(KPI.includes('export function clientesAtivosDoMes'))
  const bloco = KPI.slice(
    KPI.indexOf('export function clientesAtivosDoMes'),
    KPI.indexOf('export async function kpisDoPeriodo'),
  )
  assert.ok(bloco.includes('if (d.clientesAtivos === null) continue'))
  assert.ok(bloco.includes('>= escolhido.data.getTime()'))
})

/* ========================================================================= *
 * AS GARANTIAS DA MIGRATION
 * ========================================================================= */

test('a migration NAO apaga nem trunca nada', () => {
  const sem = V29.replace(/^--.*$/gm, '')
  for (const proibido of ['DROP TABLE', 'TRUNCATE', 'DELETE FROM']) {
    assert.ok(!sem.toUpperCase().includes(proibido), `a migration passou a usar ${proibido}`)
  }
})

test('a migration e IDEMPOTENTE — mes com registro de normalizacao nao e tocado', () => {
  // A segunda execucao tem de normalizar ZERO meses. A guarda e o NOT EXISTS
  // contra `NormalizacaoHistorica`, e ela e auto-limitante: depois da
  // primeira passada o mes tem N linhas, nao mais uma.
  assert.ok(V29.includes('NOT EXISTS ('), 'a guarda de idempotencia saiu')
  assert.ok(V29.includes('FROM "NormalizacaoHistorica" nh WHERE nh."dataOriginal" = l.data'))
  // E o DDL todo e condicional.
  assert.ok(V29.includes('CREATE TABLE IF NOT EXISTS "NormalizacaoHistorica"'))
  assert.ok(V29.includes('CREATE UNIQUE INDEX IF NOT EXISTS'))
  assert.ok(V29.includes('ON CONFLICT (data) DO NOTHING'))
  assert.ok(V29.includes('ON CONFLICT ("dataOriginal") DO NOTHING'))
})

test('a JANELA e NOMEADA — a migration nao pode pegar um mes legitimo no futuro', () => {
  /**
   * Um critério genérico ("mês com um lançamento só, no último dia") pegaria,
   * em 2027, um mês legítimo em que só o dia 31 foi lançado — e normalizá-lo
   * distribuiria um dia real por 31 dias.
   *
   * Uma migration de dado conserta o dado que ela conhece.
   */
  assert.ok(
    V29.includes("WHERE data >= DATE '2026-02-01' AND data < DATE '2026-10-01'"),
    'a janela da normalizacao deixou de ser nomeada',
  )
})

test('OUTUBRO fica FORA da normalizacao', () => {
  // Outubro tem lancamentos diarios de verdade (01 a 06 quando a migration
  // rodou). A janela termina antes de 01/10, e o criterio de "um lancamento
  // so, no ultimo dia do mes" tambem o excluiria.
  assert.ok(V29.includes("data < DATE '2026-10-01'"))
  assert.ok(V29.includes("m.data_unica = (m.mes + INTERVAL '1 month - 1 day')::date"))
})

test('a migration ABORTA em qualquer divergencia de soma', () => {
  /**
   * "Não prosseguir se houver divergência" é o requisito, e a forma de
   * cumpri-lo em SQL é `RAISE EXCEPTION`: ele desfaz a transação inteira — a
   * tabela e toda a distribuição — em vez de deixar metade aplicada.
   */
  const confere = V29.slice(V29.indexOf('DO $confere$'))
  assert.ok(confere.includes('RAISE EXCEPTION'), 'o aborto por divergencia saiu')
  assert.ok(confere.includes('v29 ABORTADA'))
  // E confere AS QUATRO metricas de fluxo, mais a contagem de linhas.
  for (const alvo of ['soma_tpv', 'soma_rec', 'soma_tx', 'soma_med', 'c.linhas <> c.dias']) {
    assert.ok(confere.includes(alvo), `a conferencia deixou de verificar ${alvo}`)
  }
})

test('dinheiro e conferido em CENTAVOS, nao bit a bit', () => {
  // `double precision` acumula erro na soma: 29 cotas de ~R$ 49 milhoes dao
  // ~1e-7 de desvio. Igualdade bit a bit nao e criterio de correcao para
  // dinheiro; igualdade em centavos e.
  const confere = V29.slice(V29.indexOf('DO $confere$'))
  assert.ok(confere.includes('round(sum(l.tpv)::numeric, 2)'))
  assert.ok(confere.includes('round(c."tpvOriginal"::numeric, 2)'))
  // Contagens sao inteiras e conferidas exatamente — sem round.
  assert.ok(confere.includes('sum(l."qtdTransacoes")'))
  assert.ok(confere.includes('c.soma_tx IS DISTINCT FROM c."transacoesOriginal"'))
})

test('valor NEGATIVO aborta em vez de distribuir errado', () => {
  // A distribuicao usa divisao inteira, que trunca para zero: com valor
  // negativo o resto teria sinal e a soma nao fecharia. Nenhum consolidado
  // real e negativo; se um aparecer, a migration para.
  assert.ok(V29.includes('tem valor negativo'))
})

/* ========================================================================= *
 * RASTREABILIDADE
 * ========================================================================= */

test('a tabela de rastreabilidade guarda TODOS os valores originais', () => {
  /**
   * "Não apagar o original sem rastreabilidade." O lançamento original não foi
   * apagado — ele virou o último dia do mês, porque a data dele já era o
   * último dia —, mas os VALORES dele mudaram. Sem esta tabela não haveria
   * como provar que a soma distribuída bate com o número que a operação
   * reportou.
   */
  const modelo = SCHEMA.slice(
    SCHEMA.indexOf('model NormalizacaoHistorica {'),
    SCHEMA.indexOf('model NormalizacaoHistorica {') + 2000,
  )
  for (const campo of [
    'lancamentoId', 'dataOriginal', 'diasNoMes',
    'receitaOriginal', 'tpvOriginal', 'transacoesOriginal', 'medOriginal',
    'saldoOriginal', 'clientesAtivosOriginal', 'diasCriados', 'aplicadoEm',
  ]) {
    assert.ok(modelo.includes(campo), `${campo} saiu da rastreabilidade`)
  }
  // Uma linha por mes: a data original e UNICA.
  assert.ok(modelo.includes('dataOriginal DateTime @unique @db.Date'))
})

test('as linhas criadas DIZEM de onde vieram', () => {
  // Quem abre o Lancamento Diario e ve 01/09 precisa saber que aquele numero
  // e uma cota de um consolidado, nao um lancamento do dia.
  assert.ok(V29.includes("'Distribuido do consolidado mensal de '"))
  assert.ok(V29.includes('Valor diario = valor mensal'))
  // E o registro original tambem diz o que aconteceu com ele.
  assert.ok(V29.includes('Era o consolidado do mes; virou o ultimo dia'))
})

test('a tabela nova nasce com RLS, como as da v28', () => {
  // O Supabase expoe o schema publico via PostgREST: tabela nova sem RLS
  // nasce legivel por qualquer pessoa com a chave anonima.
  assert.ok(V29.includes('ALTER TABLE "NormalizacaoHistorica" ENABLE ROW LEVEL SECURITY'))
})

/* ========================================================================= *
 * O PISO MUDOU PORQUE A BASE MUDOU
 * ========================================================================= */

test('o piso da serie diaria desceu para JUNHO — e nao para fevereiro', () => {
  /**
   * Fevereiro a maio só têm quantidade de transações: TPV, receita e MED são
   * zero, e zero ali é ausência de apuração, não resultado. Junho é o primeiro
   * mês com TPV real.
   *
   * Os lançamentos de fevereiro a maio CONTINUAM no banco — nada foi apagado.
   * O que o piso diz é que a série diária não começa neles.
   */
  assert.ok(KPI.includes('export const DATA_MINIMA_ATIVIDADE = new Date(Date.UTC(2026, 5, 1))'))

  const semTpv = CONSOLIDADOS.filter((c) => c.tpv === 0).map((c) => c.mes)
  assert.deepEqual(semTpv, ['2026-02', '2026-03', '2026-04', '2026-05'])

  const comTpv = CONSOLIDADOS.filter((c) => c.tpv > 0).map((c) => c.mes)
  assert.equal(comTpv[0], '2026-06')
})
