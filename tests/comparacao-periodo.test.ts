/**
 * COMPARAÇÃO MENSAL EQUIVALENTE — a correção das setas do Cockpit.
 *
 * ── O DEFEITO QUE ESTA SUÍTE TRANCA ─────────────────────────────────────
 *
 * Os lançamentos são DIÁRIOS e o mês corrente está sempre pela metade. A
 * variação comparava o acumulado parcial do mês atual com o mês anterior
 * INTEIRO:
 *
 *   dia 07  →  R$ 10 mi (7 dias)  vs  R$ 40 mi (30 dias)  →  −75%
 *
 * Resultado: toda seta ficava vermelha no começo de cada mês, em todos os
 * indicadores, independentemente do desempenho. Um indicador negativo por
 * construção não informa nada — e treina quem o lê a ignorá-lo.
 *
 * A correção é comparar JANELAS IGUAIS: 01–07 contra 01–07.
 *
 * ── O QUE SE TESTA AQUI, E POR QUE SEM BANCO ────────────────────────────
 *
 * As funções de janela (`lib/periodo.ts`) são PURAS: recebem o período e a
 * data de referência e devolvem o intervalo. É nelas que a regra vive, e é
 * por isso que ela é verificável sem Postgres — "no dia 7 a janela é 01–07"
 * não precisa de dado para ser conferido.
 *
 * A integração com o Prisma (`comparacaoMensal`, em lib/kpi.ts) é verificada
 * estruturalmente: que as telas chamam a função única em vez de recalcular a
 * base comparável cada uma por conta.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  intervaloMes, intervaloParcial, janelaComparavel, periodoEmCurso,
  diaDoMes, diasNoMes,
} from '../lib/periodo'
import { variacao } from '../lib/format-financeiro'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

/** O dia de um Date, em ISO curto — o formato em que a janela se confere. */
const iso = (d: Date) => d.toISOString().slice(0, 10)

/* ========================================================================= *
 * A JANELA
 * ========================================================================= */

test('sem ateDia, a janela e o MES INTEIRO', () => {
  // E o comportamento de todo periodo FECHADO: nao ha o que truncar, e
  // truncar jogaria fora dado real.
  const inteiro = intervaloMes('2026-10')
  const semCorte = intervaloParcial('2026-10', null)
  assert.equal(iso(semCorte.inicio), iso(inteiro.inicio))
  assert.equal(iso(semCorte.fim), iso(inteiro.fim))
})

test('ateDia trunca a janela no dia informado, INCLUSIVO', () => {
  // "Ate o dia 07" tem de INCLUIR o dia 07. O fim do intervalo e exclusivo,
  // entao ele e o dia 08 — e errar isso por um dia descartaria o dia de hoje
  // da apuracao do mes corrente.
  const j = intervaloParcial('2026-10', 7)
  assert.equal(iso(j.inicio), '2026-10-01')
  assert.equal(iso(j.fim), '2026-10-08')
})

test('a janela de 15 dias cobre 01 a 15', () => {
  const j = intervaloParcial('2026-10', 15)
  assert.equal(iso(j.inicio), '2026-10-01')
  assert.equal(iso(j.fim), '2026-10-16')
})

test('ateDia ZERO ou NEGATIVO devolve o mes inteiro, nao uma janela vazia', () => {
  // Uma janela vazia faria todo KPI do mes virar null de uma vez. Zero chega
  // aqui quando algo a montante nao conseguiu determinar a janela, e nesse
  // caso o mes inteiro e a resposta segura.
  for (const valor of [0, -1, -30]) {
    const j = intervaloParcial('2026-10', valor)
    assert.equal(iso(j.fim), iso(intervaloMes('2026-10').fim), `ateDia=${valor}`)
  }
})

test('a janela e CAPADA pelo fim do mes — nunca invade o mes seguinte', () => {
  // ESTE E O CASO QUE QUEBRA EM PRODUCAO NO DIA 31.
  //
  // No dia 31 de um mes, a janela comparavel de fevereiro seria "01 a 31" —
  // que nao existe. Sem o cap, o intervalo de fevereiro terminaria em 03/03 e
  // a comparacao somaria dois dias de marco do lado do mes anterior.
  const fev = intervaloParcial('2026-02', 31)
  assert.equal(iso(fev.inicio), '2026-02-01')
  assert.equal(iso(fev.fim), '2026-03-01', 'a janela de fevereiro invadiu marco')
  assert.equal(iso(fev.fim), iso(intervaloMes('2026-02').fim))

  // E num mes de 30 dias, pedir 31 tambem para no fim do mes.
  const abr = intervaloParcial('2026-04', 31)
  assert.equal(iso(abr.fim), '2026-05-01')
})

test('a janela de 29 em fevereiro NAO BISSEXTO para no fim do mes', () => {
  // 2026 nao e bissexto: fevereiro tem 28 dias.
  assert.equal(diasNoMes('2026-02'), 28)
  const j = intervaloParcial('2026-02', 29)
  assert.equal(iso(j.fim), '2026-03-01')
})

test('fevereiro BISSEXTO tem 29 dias, e a janela respeita isso', () => {
  assert.equal(diasNoMes('2024-02'), 29)
  const j = intervaloParcial('2024-02', 29)
  assert.equal(iso(j.fim), '2024-03-01')
  // E o dia 28 ainda nao fecha o mes bissexto.
  assert.equal(iso(intervaloParcial('2024-02', 28).fim), '2024-02-29')
})

test('diasNoMes acerta os quatro tamanhos de mes', () => {
  assert.equal(diasNoMes('2026-01'), 31)
  assert.equal(diasNoMes('2026-02'), 28)
  assert.equal(diasNoMes('2026-04'), 30)
  assert.equal(diasNoMes('2026-12'), 31)
})

/* ========================================================================= *
 * QUANDO TRUNCAR, E QUANDO NÃO
 * ========================================================================= */

test('so o periodo EM CURSO e parcial', () => {
  const hoje = new Date('2026-10-07T15:00:00Z')
  assert.equal(periodoEmCurso('2026-10', hoje), true)
  assert.equal(periodoEmCurso('2026-09', hoje), false)
  assert.equal(periodoEmCurso('2026-11', hoje), false)
  // Mesmo mes de OUTRO ano nao e o periodo corrente.
  assert.equal(periodoEmCurso('2025-10', hoje), false)
})

test('janelaComparavel devolve o dia do mes no periodo em curso', () => {
  const hoje = new Date('2026-10-07T15:00:00Z')
  assert.equal(janelaComparavel('2026-10', hoje), 7)
})

test('janelaComparavel devolve NULL em periodo fechado', () => {
  // Dois meses fechados se comparam INTEIROS. Truncar setembro no dia 7 para
  // compara-lo com agosto jogaria fora 23 dias de dado real.
  const hoje = new Date('2026-10-07T15:00:00Z')
  assert.equal(janelaComparavel('2026-09', hoje), null)
  assert.equal(janelaComparavel('2026-08', hoje), null)
})

test('no dia 01, a janela e de UM dia — nao do mes inteiro', () => {
  // O caso-limite do começo do mes. Um bug comum aqui seria tratar o dia 1
  // como "nada decorrido" e cair no mes inteiro, trazendo de volta exatamente
  // a comparacao desigual que esta rodada corrige.
  const hoje = new Date('2026-10-01T03:00:00Z')
  assert.equal(janelaComparavel('2026-10', hoje), 1)
  const j = intervaloParcial('2026-10', 1)
  assert.equal(iso(j.inicio), '2026-10-01')
  assert.equal(iso(j.fim), '2026-10-02')
})

test('no ULTIMO dia do mes, a janela cobre o mes inteiro', () => {
  const hoje = new Date('2026-10-31T23:00:00Z')
  assert.equal(janelaComparavel('2026-10', hoje), 31)
  assert.equal(
    iso(intervaloParcial('2026-10', 31).fim),
    iso(intervaloMes('2026-10').fim),
  )
})

test('diaDoMes le o dia em UTC', () => {
  // UTC, e nao fuso local: as colunas de data do sistema sao DATE em UTC, e
  // ler o dia em America/Sao_Paulo adiantaria a janela em um dia durante as
  // tres primeiras horas de cada dia.
  assert.equal(diaDoMes(new Date('2026-10-07T00:30:00Z')), 7)
  assert.equal(diaDoMes(new Date('2026-10-07T23:30:00Z')), 7)
})

/* ========================================================================= *
 * A ARITMÉTICA QUE A ESPECIFICAÇÃO PEDE
 * ========================================================================= */

test('os dois exemplos da especificacao', () => {
  // A funcao de variacao e `variacao` (lib/format-financeiro); aqui se confere
  // que os numeros do pedido saem dela, para que o exemplo fique registrado.
  //
  //   atual 20 mi  ·  comparavel 15 mi  →  +33,33%  ·  positivo
  //   atual 12 mi  ·  comparavel 15 mi  →  −20%     ·  negativo
  const subiu = variacao(20_000_000, 15_000_000)
  assert.ok(subiu)
  assert.equal(subiu.direcao, 'up')
  assert.equal(Math.round(subiu.pct! * 100) / 100, 33.33)

  const caiu = variacao(12_000_000, 15_000_000)
  assert.ok(caiu)
  assert.equal(caiu.direcao, 'down')
  assert.equal(caiu.pct, -20)
})

test('o defeito antigo produziria -75% onde a regra nova produz comparacao justa', () => {
  // O cenario exato do pedido: 10 mi em 7 dias contra 40 mi de mes inteiro.
  const errado = variacao(10_000_000, 40_000_000)
  assert.ok(errado)
  assert.equal(errado.pct, -75)
  assert.equal(errado.direcao, 'down')

  // Com a janela equivalente — 10 mi contra os 9,3 mi dos 7 primeiros dias do
  // mes anterior — o mesmo desempenho aparece como positivo. O numero nao foi
  // maquiado: o denominador passou a ser comparavel.
  const certo = variacao(10_000_000, 9_333_333)
  assert.ok(certo)
  assert.equal(certo.direcao, 'up')
})

/* ========================================================================= *
 * UMA FONTE SÓ — as telas não recalculam a base comparável
 * ========================================================================= */

const COCKPIT = ler('app/dashboard/page.tsx')
const CONSELHO = ler('app/dashboard/conselho/page.tsx')
const KPI = ler('lib/kpi.ts')

test('kpisDoPeriodo aceita a janela e TRUNCA na origem', () => {
  // O truncamento acontece na apuracao, nao na tela: todos os KPIs derivam dos
  // mesmos lancamentos, e recortar o conjunto na origem mantem TPV, receita,
  // transacoes, MED, saldo medio e Float coerentes entre si. Cada tela
  // cortando o seu numero produziria o saldo medio de 7 dias com o TPV de 30.
  assert.ok(
    /export async function kpisDoPeriodo\(\s*periodo: string, ateDia\?: number \| null,/.test(KPI),
    'kpisDoPeriodo perdeu o parametro de janela',
  )
  assert.ok(
    KPI.includes('intervaloParcial(periodo, ateDia)'),
    'kpisDoPeriodo voltou a apurar sempre o mes inteiro',
  )
})

test('COCKPIT e CONSELHO usam a MESMA funcao de comparacao', () => {
  for (const [nome, texto] of [['Cockpit', COCKPIT], ['Conselho', CONSELHO]] as const) {
    assert.ok(
      texto.includes('await comparacaoMensal(periodo, serie)'),
      `${nome} nao usa comparacaoMensal`,
    )
    // E NAO recalcula a base comparavel por conta — era o `find` duplicado nos
    // dois arquivos, e e assim que duas telas passam a discordar.
    assert.ok(
      !texto.includes('.reverse().find((k) => k.temDados)'),
      `${nome} voltou a escolher o mes comparavel por conta propria`,
    )
  }
})

test('a comparacao REAPURA o mes comparavel na janela parcial', () => {
  // O erro sutil que ficaria: usar a serie (meses INTEIROS, que a sparkline
  // precisa) como base. Isso traria o defeito de volta por outro caminho.
  const bloco = KPI.slice(KPI.indexOf('export async function comparacaoMensal'))
  assert.ok(
    bloco.includes('await kpisDoPeriodo(anteriorInteiro.periodo, dias)'),
    'o mes comparavel voltou a entrar inteiro',
  )
})

test('a janela e IGUALADA nos dois lados, nao so reapurada no comparavel', () => {
  /**
   * O SEGUNDO DEFEITO, pelo caminho inverso.
   *
   * No dia 31 de um mes, "os 31 dias decorridos" nao existem em fevereiro:
   * `intervaloParcial` capa no fim do mes e devolveria 28. Comparar 31 dias de
   * marco com 28 de fevereiro e o MESMO defeito que `comparacaoMensal` existe
   * para corrigir, so invertido.
   *
   * A janela efetiva passa a ser o MENOR dos dois tamanhos, e vale para os
   * dois lados.
   */
  const bloco = KPI.slice(KPI.indexOf('export async function comparacaoMensal'))
  assert.ok(
    bloco.includes("Math.min(ateDia, diasNoMes(anteriorInteiro.periodo))"),
    'a janela do mes comparavel deixou de ser igualada',
  )
  // E o `ateDia` devolvido e o EFETIVO, para o rotulo nao mentir sobre a
  // janela usada.
  assert.ok(bloco.includes('ateDia: dias'), 'o rotulo voltaria a citar a janela pedida')
})

test('as TELAS declaram a janela que estao comparando', () => {
  // Sem a declaracao, "+33,3%" e um numero sem referencia — e foi a ausencia
  // dessa referencia que deixou a comparacao desigual passar tanto tempo
  // invisivel. A regra pode voltar a estar errada; o que nao pode e estar
  // errada em silencio.
  assert.ok(COCKPIT.includes('rotuloComparacao'), 'o Cockpit nao declara a janela')
  assert.ok(COCKPIT.includes('Variações comparam'), 'o Cockpit nao escreve a comparacao')
  assert.ok(CONSELHO.includes('rotuloComparacao'), 'o Conselho nao declara a janela')
  assert.ok(
    CONSELHO.includes('contra a mesma janela'),
    'o Conselho nao diz que a janela e a mesma nos dois lados',
  )
})

test('METAS nao e tocada: o pacing ja tem logica temporal correta', () => {
  // O pedido diz para aplicar a regra "somente onde o KPI utilizar comparacao
  // mensal/periodica" e para nao alterar indicadores com outra logica temporal
  // correta.
  //
  // Metas nao compara mes contra mes: ela compara o realizado contra o
  // ESPERADO ATE AGORA, derivado da fracao do mes decorrida (`calcularPacing`).
  // Isso ja resolve o problema do mes parcial, por outro caminho — e e por
  // isso que a tela nao entra nesta rodada.
  const metas = ler('lib/metas.ts')
  assert.ok(metas.includes('export function calcularPacing'), 'o pacing saiu de Metas')
  assert.ok(
    metas.includes('hoje.getUTCDate() / dias'),
    'o pacing deixou de medir a fracao do mes decorrida',
  )

  // E Metas segue sem comparacao mes-a-mes: nenhuma variacao contra o periodo
  // anterior entrou na tela.
  const pagina = ler('app/dashboard/metas/page.tsx')
  assert.ok(!pagina.includes('comparacaoMensal'), 'Metas ganhou comparacao mensal')
  assert.ok(!pagina.includes('variacao('), 'Metas ganhou variacao contra mes anterior')
})
