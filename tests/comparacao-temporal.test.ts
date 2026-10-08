/**
 * COMPARAÇÃO TEMPORAL — o serviço único de "período atual × comparável".
 *
 * ── A REGRA QUE ESTES TESTES PRENDEM ─────────────────────────────────────
 *
 * As duas janelas cobrem SEMPRE o mesmo número de dias de calendário. É o que
 * impede a comparação que não informa nada — parcial contra completo —, e é a
 * mesma regra nas quatro granularidades.
 *
 * Tudo aqui é PURO: calendário, sem Prisma e sem relógio (a data de
 * referência é parâmetro). Por isso dá para prender o comportamento sem banco.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GRANULARIDADES, GRANULARIDADE_LABEL, parTemporal, rotuloDoPar,
  temBaseComparavel, inicioDaSemana, inicioDoMes, inicioDoTrimestre,
  trimestreDe, diaUtc,
} from '../lib/comparacao-temporal'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const iso = (d: Date) => d.toISOString().slice(0, 10)
/** O último dia INCLUSIVO de uma janela, para a leitura dos testes. */
const fimInclusivo = (j: { fim: Date }) => iso(new Date(j.fim.getTime() - 86_400_000))

/* ========================================================================= *
 * O CONJUNTO FECHADO
 * ========================================================================= */

test('as quatro granularidades, e so elas', () => {
  assert.deepEqual([...GRANULARIDADES], ['DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL'])
  for (const g of GRANULARIDADES) {
    assert.ok(GRANULARIDADE_LABEL[g], `${g} sem rotulo`)
  }
})

/* ========================================================================= *
 * OS INÍCIOS DE CADA PERÍODO
 * ========================================================================= */

test('a semana comeca na SEGUNDA, inclusive quando a referencia e domingo', () => {
  // 07/10/2026 e uma quarta-feira; a semana comeca em 05/10 (segunda).
  assert.equal(iso(inicioDaSemana(new Date('2026-10-07T12:00:00Z'))), '2026-10-05')
  // 11/10/2026 e domingo: pertence a MESMA semana, que comecou em 05/10.
  // `getUTCDay()` devolve 0 para domingo, e sem o caso especial ele recuaria
  // zero dias e abriria uma semana no domingo.
  assert.equal(iso(inicioDaSemana(new Date('2026-10-11T12:00:00Z'))), '2026-10-05')
  // 12/10 e a segunda seguinte: ela mesma.
  assert.equal(iso(inicioDaSemana(new Date('2026-10-12T00:00:00Z'))), '2026-10-12')
})

test('o mes e o trimestre civis', () => {
  assert.equal(iso(inicioDoMes(new Date('2026-10-07T12:00:00Z'))), '2026-10-01')

  assert.equal(trimestreDe(new Date('2026-01-15T00:00:00Z')), 1)
  assert.equal(trimestreDe(new Date('2026-03-31T00:00:00Z')), 1)
  assert.equal(trimestreDe(new Date('2026-04-01T00:00:00Z')), 2)
  assert.equal(trimestreDe(new Date('2026-10-07T00:00:00Z')), 4)
  assert.equal(trimestreDe(new Date('2026-12-31T00:00:00Z')), 4)

  assert.equal(iso(inicioDoTrimestre(new Date('2026-10-07T12:00:00Z'))), '2026-10-01')
  assert.equal(iso(inicioDoTrimestre(new Date('2026-08-20T12:00:00Z'))), '2026-07-01')
})

test('o grao e o DIA em UTC — nunca o fuso local', () => {
  // As colunas de data do produto sao `DATE` e sao lidas em UTC. Um servico
  // que usasse o fuso local trocaria o dia na virada.
  assert.equal(iso(diaUtc(new Date('2026-10-07T00:30:00Z'))), '2026-10-07')
  assert.equal(iso(diaUtc(new Date('2026-10-07T23:30:00Z'))), '2026-10-07')
})

/* ========================================================================= *
 * DIÁRIA — dia contra dia anterior
 * ========================================================================= */

test('DIARIA: um dia contra o dia ANTERIOR', () => {
  const par = parTemporal('DIARIA', new Date('2026-10-07T12:00:00Z'))
  assert.equal(iso(par.atual.inicio), '2026-10-07')
  assert.equal(par.atual.dias, 1)
  assert.equal(iso(par.anterior.inicio), '2026-10-06')
  assert.equal(par.anterior.dias, 1)
  // Um dia nunca esta "em curso" para efeito de comparacao: a janela e o dia.
  assert.equal(par.emCurso, false)
  assert.equal(par.equalizada, false)
})

test('DIARIA: a virada de mes nao quebra o par', () => {
  const par = parTemporal('DIARIA', new Date('2026-10-01T12:00:00Z'))
  assert.equal(iso(par.atual.inicio), '2026-10-01')
  assert.equal(iso(par.anterior.inicio), '2026-09-30')
})

test('DIARIA: o rotulo cita os dois dias', () => {
  const par = parTemporal('DIARIA', new Date('2026-10-07T12:00:00Z'))
  assert.equal(rotuloDoPar(par), '07/10 vs 06/10')
})

/* ========================================================================= *
 * SEMANAL
 * ========================================================================= */

test('SEMANAL: os dias decorridos contra os MESMOS dias da semana anterior', () => {
  // Quarta, 07/10: a semana comecou segunda 05/10, logo 3 dias decorridos.
  const par = parTemporal('SEMANAL', new Date('2026-10-07T12:00:00Z'))
  assert.equal(iso(par.atual.inicio), '2026-10-05')
  assert.equal(par.atual.dias, 3)
  assert.equal(fimInclusivo(par.atual), '2026-10-07')

  assert.equal(iso(par.anterior.inicio), '2026-09-28')
  assert.equal(par.anterior.dias, 3)
  assert.equal(fimInclusivo(par.anterior), '2026-09-30')

  assert.equal(par.emCurso, true)
})

test('SEMANAL: semana FECHADA compara as duas inteiras', () => {
  // Domingo 11/10 fecha a semana: 7 dias de cada lado, sem truncar.
  const par = parTemporal('SEMANAL', new Date('2026-10-11T12:00:00Z'))
  assert.equal(par.atual.dias, 7)
  assert.equal(par.anterior.dias, 7)
  assert.equal(par.emCurso, false)
})

/* ========================================================================= *
 * MENSAL — o caso do pedido: 01–07/10 vs 01–07/09
 * ========================================================================= */

test('MENSAL: 01–07/10 contra 01–07/09', () => {
  const par = parTemporal('MENSAL', new Date('2026-10-07T12:00:00Z'))

  assert.equal(iso(par.atual.inicio), '2026-10-01')
  assert.equal(fimInclusivo(par.atual), '2026-10-07')
  assert.equal(par.atual.dias, 7)

  assert.equal(iso(par.anterior.inicio), '2026-09-01')
  assert.equal(fimInclusivo(par.anterior), '2026-09-07')
  assert.equal(par.anterior.dias, 7)

  assert.equal(par.emCurso, true)
  assert.equal(par.equalizada, false)
  assert.equal(rotuloDoPar(par), '01/10–07/10 vs 01/09–07/09')
})

test('MENSAL: mes FECHADO nao e truncado pelo decorrido', () => {
  // 31/10: outubro decorreu inteiro, entao a janela PEDIDA e o mes todo — nao
  // ha truncamento por tempo decorrido. Truncar setembro no dia 7 para
  // compara-lo com agosto jogaria fora 23 dias de dado real.
  const par = parTemporal('MENSAL', new Date('2026-10-31T12:00:00Z'))
  assert.equal(par.emCurso, false)

  // A IGUALACAO AINDA SE APLICA: setembro tem 30 dias, e 31 contra 30 e o
  // defeito que o servico corrige. Os dois lados ficam em 30.
  assert.equal(par.atual.dias, 30)
  assert.equal(par.anterior.dias, 30)
  assert.equal(par.equalizada, true)
})

test('MENSAL: dois meses fechados do MESMO tamanho comparam inteiros', () => {
  // 31/08: agosto e julho tem 31 dias cada. Nada a igualar, nada a truncar.
  const par = parTemporal('MENSAL', new Date('2026-08-31T12:00:00Z'))
  assert.equal(par.atual.dias, 31)
  assert.equal(par.anterior.dias, 31)
  assert.equal(par.emCurso, false)
  assert.equal(par.equalizada, false)
  assert.equal(iso(par.atual.inicio), '2026-08-01')
  assert.equal(iso(par.anterior.inicio), '2026-07-01')
})

test('MENSAL: quando o mes anterior e MENOR, OS DOIS encurtam', () => {
  /**
   * O DEFEITO INVERSO, e o mais sutil dos dois.
   *
   * Em 31/03, "os 31 dias decorridos de marco" nao existem em fevereiro.
   * Encurtar so o lado de fevereiro devolveria 31 dias contra 28 — o mesmo
   * defeito que o servico existe para corrigir.
   *
   * A janela e o MENOR dos dois tamanhos, nos dois lados, e `equalizada` diz
   * isso em voz alta.
   */
  const par = parTemporal('MENSAL', new Date('2026-03-31T12:00:00Z'))
  assert.equal(par.atual.dias, 28, 'marco deveria encurtar para caber em fevereiro')
  assert.equal(par.anterior.dias, 28)
  assert.equal(iso(par.atual.inicio), '2026-03-01')
  assert.equal(fimInclusivo(par.atual), '2026-03-28')
  assert.equal(iso(par.anterior.inicio), '2026-02-01')
  assert.equal(fimInclusivo(par.anterior), '2026-02-28')
  assert.equal(par.equalizada, true)
  assert.ok(rotuloDoPar(par).includes('janela igualada em 28 dias'))
})

test('MENSAL: ano bissexto nao e caso especial', () => {
  // Fevereiro de 2024 tem 29 dias, e 31/03/2024 encurta para 29 — nao 28.
  const par = parTemporal('MENSAL', new Date('2024-03-31T12:00:00Z'))
  assert.equal(par.atual.dias, 29)
  assert.equal(par.anterior.dias, 29)
})

test('MENSAL: a virada de ANO nao quebra o par', () => {
  const par = parTemporal('MENSAL', new Date('2027-01-05T12:00:00Z'))
  assert.equal(iso(par.atual.inicio), '2027-01-01')
  assert.equal(iso(par.anterior.inicio), '2026-12-01')
  assert.equal(par.atual.dias, 5)
  assert.equal(par.anterior.dias, 5)
})

/* ========================================================================= *
 * TRIMESTRAL — nunca parcial contra completo
 * ========================================================================= */

test('TRIMESTRAL: periodo EQUIVALENTE, nunca parcial contra completo', () => {
  /**
   * 07/10/2026 e o 7º dia do 4º trimestre. O 3º trimestre tem 92 dias
   * (jul 31 + ago 31 + set 30), e comparar 7 dias contra 92 daria −92% todo
   * comeco de trimestre, por construcao.
   *
   * O par e 01–07/10 contra 01–07/07.
   */
  const par = parTemporal('TRIMESTRAL', new Date('2026-10-07T12:00:00Z'))

  assert.equal(iso(par.atual.inicio), '2026-10-01')
  assert.equal(par.atual.dias, 7)
  assert.equal(fimInclusivo(par.atual), '2026-10-07')

  assert.equal(iso(par.anterior.inicio), '2026-07-01')
  assert.equal(par.anterior.dias, 7)
  assert.equal(fimInclusivo(par.anterior), '2026-07-07')

  assert.equal(par.emCurso, true)
  assert.notEqual(par.atual.dias, 92)
})

test('TRIMESTRAL: trimestre FECHADO compara os dois inteiros', () => {
  // 31/12/2026 fecha o 4º trimestre: 92 dias (out 31 + nov 30 + dez 31)
  // contra os 92 do 3º (jul 31 + ago 31 + set 30).
  const par = parTemporal('TRIMESTRAL', new Date('2026-12-31T12:00:00Z'))
  assert.equal(par.atual.dias, 92)
  assert.equal(par.anterior.dias, 92)
  assert.equal(par.emCurso, false)
  assert.equal(par.equalizada, false)
})

test('TRIMESTRAL: Q1 compara com o Q4 do ano anterior', () => {
  const par = parTemporal('TRIMESTRAL', new Date('2027-02-10T12:00:00Z'))
  assert.equal(iso(par.atual.inicio), '2027-01-01')
  assert.equal(iso(par.anterior.inicio), '2026-10-01')
})

test('TRIMESTRAL: um Q1 fechado encurta para caber no Q4 anterior? Nao — Q4 e maior', () => {
  // Q1/2026 tem 90 dias (31+28+31); Q4/2025 tem 92. A janela pedida (90) cabe,
  // entao nao ha equalizacao.
  const par = parTemporal('TRIMESTRAL', new Date('2026-03-31T12:00:00Z'))
  assert.equal(par.atual.dias, 90)
  assert.equal(par.anterior.dias, 90)
  assert.equal(par.equalizada, false)
})

/* ========================================================================= *
 * A INVARIANTE
 * ========================================================================= */

test('EM TODA GRANULARIDADE E EM TODA DATA, as duas janelas tem o MESMO tamanho', () => {
  /**
   * ESTA É A REGRA, e este é o teste que a prende de verdade: 366 datas × 4
   * granularidades. Qualquer caminho futuro que esqueça de igualar um lado
   * falha aqui, inclusive os que ninguém pensou em testar nominalmente.
   */
  const inicio = Date.UTC(2026, 0, 1)
  for (let i = 0; i < 366; i++) {
    const dia = new Date(inicio + i * 86_400_000)
    for (const g of GRANULARIDADES) {
      const par = parTemporal(g, dia)
      assert.equal(
        par.atual.dias, par.anterior.dias,
        `${g} em ${iso(dia)}: ${par.atual.dias} vs ${par.anterior.dias}`,
      )
      assert.ok(par.atual.dias > 0, `${g} em ${iso(dia)}: janela vazia`)
      // E a janela anterior termina ANTES de a atual comecar — sem sobreposicao.
      assert.ok(
        par.anterior.fim.getTime() <= par.atual.inicio.getTime(),
        `${g} em ${iso(dia)}: as janelas se sobrepoem`,
      )
    }
  }
})

/* ========================================================================= *
 * BASE COMPARÁVEL
 * ========================================================================= */

test('sem base anterior INTEIRA, nao ha comparacao', () => {
  /**
   * Uma base que comeca no meio da janela anterior produz uma variacao contra
   * um periodo pela metade — o mesmo defeito, por outro caminho. Entao o
   * servico recusa.
   */
  const par = parTemporal('MENSAL', new Date('2026-10-07T12:00:00Z'))
  // A janela anterior comeca em 01/09.
  assert.equal(temBaseComparavel(par, new Date('2026-06-01T00:00:00Z')), true)
  assert.equal(temBaseComparavel(par, new Date('2026-09-01T00:00:00Z')), true)
  assert.equal(temBaseComparavel(par, new Date('2026-09-02T00:00:00Z')), false)
  assert.equal(temBaseComparavel(par, null), false)
})

test('TRIMESTRAL sem trimestre anterior na base nao compara', () => {
  // A base diaria comeca em 01/06/2026 (ver `DATA_MINIMA_ATIVIDADE`). O
  // trimestre comparavel do Q4 comeca em 01/07 — cabe. O do Q3 comecaria em
  // 01/04, que e anterior a base: nao cabe.
  const base = new Date('2026-06-01T00:00:00Z')
  assert.equal(temBaseComparavel(parTemporal('TRIMESTRAL', new Date('2026-10-07T12:00:00Z')), base), true)
  assert.equal(temBaseComparavel(parTemporal('TRIMESTRAL', new Date('2026-08-15T12:00:00Z')), base), false)
})

/* ========================================================================= *
 * O SERVIÇO É PURO
 * ========================================================================= */

test('o servico NAO importa Prisma — e testavel sem infraestrutura', () => {
  const fonte = ler('lib/comparacao-temporal.ts')
  assert.ok(!fonte.includes("from '@/lib/prisma'"), 'o servico passou a depender do banco')
  assert.ok(!fonte.includes('prisma.'), 'o servico passou a consultar o banco')
})

test('a data de referencia e SEMPRE parametro — nada le o relogio por dentro', () => {
  /**
   * `new Date()` só aparece como VALOR PADRÃO de parâmetro. Uma leitura do
   * relógio dentro do corpo tornaria a função não determinística, e um teste
   * de comparação temporal que depende de "hoje" falha sozinho num dia
   * qualquer do ano.
   */
  const fonte = ler('lib/comparacao-temporal.ts')
  const ocorrencias = fonte.match(/new Date\(\)/g) ?? []
  const padroes = fonte.match(/= new Date\(\)/g) ?? []
  assert.equal(
    ocorrencias.length, padroes.length,
    'o servico passou a ler o relogio fora de um valor padrao de parametro',
  )
})
