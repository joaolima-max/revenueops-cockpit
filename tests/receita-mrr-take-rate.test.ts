/**
 * RECEITA TRANSACIONAL × MRR, TAKE RATE E O INDICADOR DE SERVIÇOS
 *
 * Três defeitos da mesma família: números do Conselho e das Metas que contavam
 * o mesmo dinheiro duas vezes, ou não contavam nada.
 *
 * ── 1. A SUSTENTAÇÃO ERA SOMADA AO FATURAMENTO ──────────────────────────
 *
 * Sustentação de BaaS e mensalidade de API já estão DENTRO da tarifa
 * transacional: é assim que a Bass Pago cobra, e é na apuração das tarifas que
 * esses valores são contabilizados. A composição do Conselho somava a
 * sustentação ao transacional ÍNTEGRO — R$ 1 milhão de tarifa com R$ 100 mil
 * de sustentação virava R$ 1,1 milhão de faturamento.
 *
 * As mensalidades tinham o defeito pela metade: ficavam fora do total (certo),
 * mas eram exibidas ao lado do transacional íntegro — o mesmo milhão em duas
 * figuras da mesma tela, e a barra de composição nunca fechando em 100%.
 *
 * Agora o MRR é SEPARADO de dentro do transacional. R$ 900 mil de transacional
 * e R$ 100 mil de sustentação, somando os R$ 1 milhão lançados.
 *
 * ── 2. O TAKE RATE IGNORAVA OS PARCEIROS ────────────────────────────────
 *
 * Era `receitaTarifaria ÷ tpv`, direto do Lançamento Diário. Incluía o MRR
 * embutido na tarifa — inflando a eficiência tarifária com recorrência que não
 * depende de volume — e ignorava a apuração dos parceiros inteira: num mês com
 * lançamento BaaS, a maior linha de receita do período não entrava no
 * indicador que existe justamente para medir receita sobre volume.
 *
 * Agora é (tarifa sem o MRR + lançamentos de BaaS) ÷ TPV, e setup fica fora.
 *
 * ── 3. O INDICADOR DE TARIFAS DE SERVIÇO NÃO SE ATUALIZAVA ──────────────
 *
 * `RealizadoReceitaPrevisao.servicos` era `null` FIXO. A meta de Receita de
 * Serviços aparecia eternamente como SEM_REALIZADO: lançar a receita no
 * Financeiro não movia o indicador. O argumento era que nada no sistema dizia
 * qual receita é "de serviços" — mas a resposta já existia e já estava sendo
 * calculada, dentro da composição do Conselho: serviços é o RESTO da partição
 * dos lançamentos de receita.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  linhaDaReceitaLancada, type ReceitaLancadaLinhas, type Natureza,
} from '../lib/financeiro'
import {
  realizadoDeMetaDeReceita, realizadoPorTipo, repartirTransacional,
  calcularTakeRate, TIPOS_QUE_SOMAM, TIPOS_RECEITA_CONSELHO,
  META_TIPOS_RECEITA_PREVISAO, type KpisPeriodo, type BaseTakeRate,
} from '../lib/kpi'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** Percentual com tolerância de ponto flutuante. 1,36% não é exato em binário. */
const pct = (v: number | null, esperado: number, msg?: string) => {
  assert.ok(v !== null, msg ?? 'take rate ausente')
  assert.ok(Math.abs(v! - esperado) < 1e-9, `${v} !== ${esperado}${msg ? ` (${msg})` : ''}`)
}

/* ========================================================================= *
 * 1. A PARTIÇÃO DOS LANÇAMENTOS — uma cópia, e a ordem importa
 * ========================================================================= */

test('a natureza classifica ANTES do vinculo: setup de um BaaS e setup', () => {
  // Sem essa ordem, a mesma linha contaria em Setup e em BaaS.
  assert.equal(linhaDaReceitaLancada('SETUP', true), 'setup')
  assert.equal(linhaDaReceitaLancada('SUSTENTACAO', true), 'sustentacao')
  assert.equal(linhaDaReceitaLancada('FLOAT', true), 'float')
})

test('sem natureza, o vinculo com o parceiro BaaS decide', () => {
  assert.equal(linhaDaReceitaLancada(null, true), 'baas')
  assert.equal(linhaDaReceitaLancada(undefined, true), 'baas')
})

test('o que sobra e SERVICOS — e e dai que vem o realizado da meta', () => {
  assert.equal(linhaDaReceitaLancada(null, false), 'servicos')
  assert.equal(linhaDaReceitaLancada(undefined, false), 'servicos')
})

test('as tres naturezas e o vinculo cobrem as cinco linhas, sem sobreposicao', () => {
  const vistas = new Set<keyof ReceitaLancadaLinhas>()
  for (const n of ['SETUP', 'SUSTENTACAO', 'FLOAT', null] as Array<Natureza | null>) {
    for (const baas of [true, false]) vistas.add(linhaDaReceitaLancada(n, baas))
  }
  assert.deepEqual(
    [...vistas].sort(),
    ['baas', 'float', 'servicos', 'setup', 'sustentacao'],
  )
})

test('a ORDEM da particao mora em UMA funcao — a composicao do Conselho le dela', () => {
  /**
   * O laço classificador vivia dentro de `composicaoReceitaConselho`, e o
   * realizado de serviços — que é o resto da MESMA partição — não tinha onde
   * ler. Duas cópias da ordem é como as duas telas passam a discordar sobre o
   * que é um setup cobrado de um parceiro.
   */
  const kpi = ler('lib/kpi.ts')
  assert.ok(
    kpi.includes('receitaLancadaPorLinha(periodo)'),
    'a composicao do Conselho voltou a classificar por conta propria',
  )
  assert.ok(
    !/if \(n === 'SETUP'\) \{ setup \+= l\.valor/.test(kpi),
    'o laco classificador voltou para dentro de composicaoReceitaConselho',
  )
})

/* ========================================================================= *
 * 2. A SEPARAÇÃO ENTRE TRANSACIONAL E MRR
 * ========================================================================= */

test('a sustentacao NAO e somada por cima do transacional integro', () => {
  // O defeito, em numeros: 1.000.000 + 100.000 = 1.100.000 de faturamento.
  const r = repartirTransacional(1_000_000, 100_000, 0)
  const total = r.transacional + r.sustentacao + r.mensalidades
  assert.notEqual(total, 1_100_000, 'a sustentacao voltou a inflar o faturamento')
  assert.equal(total, 1_000_000)
})

test('as SEIS linhas somam, e a barra de composicao fecha em 100%', () => {
  // Elas somam porque sao FATIAS da mesma receita, nao acrescimos a ela.
  assert.equal(TIPOS_QUE_SOMAM.length, 6)
  for (const t of TIPOS_RECEITA_CONSELHO) {
    assert.ok(TIPOS_QUE_SOMAM.includes(t), `${t} nao entra na barra`)
  }
})

test('a composicao expoe a REPARTICAO, para a tela declarar a divisao', () => {
  // Sem isto, "R$ 900 mil" na linha Transacional e um numero que o leitor nao
  // tem como conferir contra o que foi lancado.
  const kpi = ler('lib/kpi.ts')
  assert.ok(kpi.includes('reparticao: ReparticaoTransacional'))
  assert.ok(kpi.includes('reparticao,'), 'a composicao parou de devolver a reparticao')
  const conselho = ler('app/dashboard/conselho/page.tsx')
  assert.ok(
    conselho.includes('composicao.reparticao.transacional'),
    'o Conselho parou de declarar de onde vem o transacional exibido',
  )
})

test('o FATURAMENTO tambem parou de somar a sustentacao duas vezes', () => {
  /**
   * O defeito morava em DOIS lugares. A composicao do Conselho era um;
   * `linhasReceita` — que alimenta o tile "Faturamento" do Conselho e o campo
   * `receita` de /api/dashboard — era o outro, e somava
   * `tarifario + float + sustentacao + setup` com o tarifario INTEGRO.
   *
   * A correcao vem da MESMA funcao pura, e o total volta a ser o tarifario
   * BRUTO mais float e setup.
   */
  const kpi = ler('lib/kpi.ts')
  assert.ok(
    !/const total = tarifario \+ flt \+ sustentacao \+ setup/.test(kpi),
    'o faturamento voltou a somar a sustentacao por cima do tarifario integro',
  )
  assert.ok(
    kpi.includes('const total = rep.transacional + rep.sustentacao + rep.mensalidades + flt + setup'),
    'linhasReceita parou de usar a reparticao',
  )
  // E as mensalidades ganharam linha propria: tira-las do tarifario sem
  // lhes dar linha faria o faturamento encolher sem explicacao.
  assert.ok(/mensalidades: number/.test(kpi))
})

test('o faturamento fecha com o tarifario BRUTO mais float e setup', () => {
  // A conta que `linhasReceita` passou a fazer, com os numeros de out/2026 do
  // ambiente Principal: tarifa 516.364,13, MRR 132.267,86, setup 134.847,59.
  const rep = repartirTransacional(516_364.13, 114_000, 18_267.86)
  const setup = 134_847.59
  const float = 0
  const total = rep.transacional + rep.sustentacao + rep.mensalidades + float + setup
  assert.ok(Math.abs(total - (516_364.13 + float + setup)) < 1e-6)
  // O defeito somava o MRR por cima: 114.000 a mais de faturamento.
  const comDefeito = 516_364.13 + float + 114_000 + setup
  assert.ok(Math.abs(comDefeito - total - 114_000) < 1e-6)
})

/* ========================================================================= *
 * 3. O TAKE RATE
 * ========================================================================= */

test('o take rate saiu de KpisPeriodo — a fonte passou a ser uma so', () => {
  /**
   * Ele dependia de uma fonte (o Lançamento Diário) e passou a depender de
   * três. Mantê-lo em `KpisPeriodo` obrigaria cada leitor da interface a ter
   * as outras duas — e é assim que quatro telas passam a mostrar quatro take
   * rates diferentes.
   */
  const kpi = ler('lib/kpi.ts')
  assert.ok(
    !/^\s*takeRate: tpv > 0 \? \(receitaTarifaria \/ tpv\) \* 100 : null,/m.test(kpi),
    'kpisDoPeriodo voltou a calcular o take rate do Lancamento Diario',
  )
  assert.ok(kpi.includes('export async function baseTakeRate('))

  // E as tres telas leem dela.
  for (const [arquivo, trecho] of [
    ['app/dashboard/page.tsx', 'baseTakeRate(periodo, comparacao.ateDia)'],
    ['app/dashboard/conselho/page.tsx', 'baseTakeRate(periodo, comparacao.ateDia)'],
    ['app/api/dashboard/route.ts', 'baseTakeRate(p)'],
  ] as const) {
    assert.ok(ler(arquivo).includes(trecho), `${arquivo} nao le de baseTakeRate`)
  }
})

test('nenhuma tela usa mais `kpis.takeRate`', () => {
  for (const arquivo of [
    'app/dashboard/page.tsx',
    'app/dashboard/conselho/page.tsx',
    'app/api/dashboard/route.ts',
  ]) {
    assert.ok(
      !/\bkpis\.takeRate\b/.test(ler(arquivo)),
      `${arquivo} voltou a ler o take rate do Lancamento Diario`,
    )
  }
})

test('o realizado da meta TAKE_RATE vem da base, e e AUSENTE sem ela', () => {
  const kpis = { receitaTarifaria: 1_000_000, tpv: 100_000_000 } as KpisPeriodo
  // Sem base apurada: ausente, nunca zero — zero seria "take rate de 0%".
  assert.equal(realizadoPorTipo(kpis, 'PERCENTUAL').TAKE_RATE, null)
  // Com base: o numero da base, e nao `receitaTarifaria ÷ tpv` (que daria 1%).
  const base = { takeRate: 1.36 } as BaseTakeRate
  assert.equal(realizadoPorTipo(kpis, 'PERCENTUAL', base).TAKE_RATE, 1.36)
})

test('a base do take rate so e consultada se houver meta do tipo', () => {
  // Mesma regra de pipeline e das metas de receita: nao se paga por nada.
  const kpi = ler('lib/kpi.ts')
  assert.ok(kpi.includes("metas.some((m) => m.tipo === 'TAKE_RATE')"))
  assert.ok(kpi.includes('temTakeRate ? baseTakeRate(periodo) : null'))
})

test('o numerador do take rate e aberto na tela, nao so o percentual', () => {
  // "1,36%" sem o numerador e um numero que ninguem confere.
  const kpi = ler('lib/kpi.ts')
  for (const campo of ['tarifas:', 'lancamentosBaas:', 'receitaElegivel:', 'excluido:']) {
    assert.ok(kpi.includes(campo), `BaseTakeRate parou de abrir ${campo}`)
  }
})

test('a serie DIARIA mantem o seu take rate — e outra granularidade', () => {
  // Nao existe apuracao de parceiro nem mensalidade com resolucao diaria.
  // O grafico operacional continua sendo tarifa ÷ TPV DO DIA, e isso esta dito.
  const kpi = ler('lib/kpi.ts')
  assert.ok(kpi.includes("takeRate: d.tpv > 0 ? (d.receitaTarifaria / d.tpv) * 100 : null"))
})

/* ========================================================================= *
 * 4. O INDICADOR DE TARIFAS DE SERVIÇO NAS METAS
 * ========================================================================= */

test('o realizado de RECEITA_SERVICOS deixou de ser `null` fixo', () => {
  const r = { lancamentosWlBaas: 500_000, servicos: 42_000, setup: 13_000 }
  assert.equal(realizadoDeMetaDeReceita(r, 'RECEITA_SERVICOS'), 42_000)
  assert.equal(realizadoDeMetaDeReceita(r, 'RECEITA_SETUP'), 13_000)
  assert.equal(realizadoDeMetaDeReceita(r, 'RECEITA_LANCAMENTOS_WL_BAAS'), 500_000)
})

test('ZERO agora significa zero — a particao foi feita e nada sobrou', () => {
  // Antes, a ausencia de fonte obrigava `null` ("o sistema nao sabe"). Agora a
  // afirmacao e legitima, e a meta passa a ser avaliada em vez de ficar
  // eternamente em SEM_REALIZADO.
  const r = { lancamentosWlBaas: 0, servicos: 0, setup: 0 }
  assert.equal(realizadoDeMetaDeReceita(r, 'RECEITA_SERVICOS'), 0)
  assert.notEqual(realizadoDeMetaDeReceita(r, 'RECEITA_SERVICOS'), null)
})

test('serviços le da MESMA particao que a composicao do Conselho', () => {
  const fin = ler('lib/financeiro.ts')
  assert.ok(
    /servicos: linhas\.servicos/.test(fin),
    'o realizado de servicos deixou de vir da particao',
  )
  assert.ok(
    !/servicos: null/.test(fin),
    'o realizado de servicos voltou a ser null fixo',
  )
  // E o FLOAT fica fora da meta: ele e natureza propria, e somar o rendimento
  // do saldo em conta a uma meta de servicos contratados seria outro numero.
  assert.ok(!/servicos: linhas\.servicos \+ linhas\.float/.test(fin))
})

test('as tres metas de receita da Previsao continuam as mesmas', () => {
  assert.deepEqual([...META_TIPOS_RECEITA_PREVISAO], [
    'RECEITA_LANCAMENTOS_WL_BAAS', 'RECEITA_SERVICOS', 'RECEITA_SETUP',
  ])
  assert.equal(realizadoDeMetaDeReceita(
    { lancamentosWlBaas: 1, servicos: 2, setup: 3 }, 'TPV',
  ), null)
})

/* ========================================================================= *
 * 5. O QUE NÃO PODE VOLTAR
 * ========================================================================= */

test('o take rate nao soma setup, sustentacao nem mensalidade', () => {
  // Setup e implantacao, nao tarifa sobre volume. Sustentacao e mensalidade
  // sao MRR — e, por serem fatia da tarifa, ficar de fora aqui significa
  // DESCONTA-LAS do numerador, nao apenas nao soma-las.
  const r = repartirTransacional(1_000_000, 100_000, 40_000)
  const elegivel = r.transacional + 500_000
  const comSetup = elegivel + 250_000
  assert.notEqual(
    calcularTakeRate(comSetup, 100_000_000),
    calcularTakeRate(elegivel, 100_000_000),
  )
  pct(calcularTakeRate(elegivel, 100_000_000), 1.36)
})

test('o MRR nunca e ratea­do por dias decorridos', () => {
  // Seria inventar um numero que nenhum contrato do sistema conhece. Como ele
  // entra IGUAL nos dois lados da comparacao, nao distorce a variacao.
  const kpi = ler('lib/kpi.ts')
  assert.ok(
    kpi.includes('O MRR NÃO É TRUNCADO'),
    'a regra de nao ratear o MRR saiu da documentacao da funcao',
  )
  assert.ok(kpi.includes('calcularMrr(periodo),'))
})
