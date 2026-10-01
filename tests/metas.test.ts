/**
 * METAS — o alvo e a DIREÇÃO.
 *
 * O caso que motiva o módulo inteiro: uma meta de MED em 2%. Com a divisão
 * direta, um realizado de 1,5% daria 75% — e 75% parece ruim. Com a direção
 * MENOR_MELHOR, dá 133%, que é o que a meta de fato significa.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  avaliarMeta, validarValorMeta, PADRAO_POR_TIPO, META_TIPOS,
  META_DIRECOES, META_UNIDADES,
  calcularPacing, avaliarCompleto, acumulaNoMes,
  ehMetaDePipeline, META_TIPO_LABEL,
} from '../lib/metas'

/* ── Maior é melhor ──────────────────────────────────────────────────────── */

test('TPV acima da meta é positivo', () => {
  const a = avaliarMeta(1_000_000, 1_200_000, 'MAIOR_MELHOR')
  assert.equal(a.positivo, true)
  assert.equal(a.situacao, 'ATINGIDA')
  assert.equal(a.cumprimento, 120)
  assert.equal(a.diferenca, 200_000)
})

test('TPV abaixo da meta é negativo', () => {
  const a = avaliarMeta(1_000_000, 800_000, 'MAIOR_MELHOR')
  assert.equal(a.positivo, false)
  assert.equal(a.situacao, 'NAO_ATINGIDA')
  assert.equal(a.cumprimento, 80)
})

test('exatamente na meta conta como atingida', () => {
  assert.equal(avaliarMeta(100, 100, 'MAIOR_MELHOR').positivo, true)
  assert.equal(avaliarMeta(100, 100, 'MENOR_MELHOR').positivo, true)
  assert.equal(avaliarMeta(100, 100, 'MAIOR_MELHOR').cumprimento, 100)
})

/* ── Menor é melhor — o caso da MED ──────────────────────────────────────── */

test('MED 2% com realizado 1,5% é POSITIVO', () => {
  const a = avaliarMeta(2, 1.5, 'MENOR_MELHOR')
  assert.equal(a.positivo, true)
  assert.equal(a.situacao, 'ATINGIDA')
  assert.ok(a.cumprimento !== null && a.cumprimento > 100, 'ficar abaixo do teto é superar a meta')
  assert.equal(a.diferenca, -0.5)
})

test('MED 2% com realizado 3% é NEGATIVO', () => {
  const a = avaliarMeta(2, 3, 'MENOR_MELHOR')
  assert.equal(a.positivo, false)
  assert.equal(a.situacao, 'NAO_ATINGIDA')
  assert.ok(a.cumprimento !== null && a.cumprimento < 100)
  assert.equal(a.diferenca, 1)
})

test('a direção inverte o julgamento do MESMO par de números', () => {
  const maior = avaliarMeta(2, 1.5, 'MAIOR_MELHOR')
  const menor = avaliarMeta(2, 1.5, 'MENOR_MELHOR')
  assert.equal(maior.positivo, false)
  assert.equal(menor.positivo, true)
})

test('zero MED com meta de 2% é o melhor resultado possível, não divisão por zero', () => {
  const a = avaliarMeta(2, 0, 'MENOR_MELHOR')
  assert.equal(a.positivo, true)
  assert.equal(a.cumprimento, 100)
})

/* ── Sem realizado ───────────────────────────────────────────────────────── */

test('sem realizado não há julgamento — nem positivo, nem negativo', () => {
  const a = avaliarMeta(1_000, null, 'MAIOR_MELHOR')
  assert.equal(a.situacao, 'SEM_REALIZADO')
  assert.equal(a.cumprimento, null)
  assert.equal(a.diferenca, null)
  assert.equal(a.positivo, false)
})

test('meta zero em MAIOR_MELHOR não produz cumprimento infinito', () => {
  assert.equal(avaliarMeta(0, 500, 'MAIOR_MELHOR').cumprimento, null)
})

/* ── Validação ───────────────────────────────────────────────────────────── */

test('meta percentual não passa de 100%', () => {
  assert.equal(validarValorMeta(2, 'PERCENTUAL'), null)
  assert.equal(validarValorMeta(100, 'PERCENTUAL'), null)
  assert.ok(validarValorMeta(120, 'PERCENTUAL'))
})

test('meta monetária pode ser qualquer valor não negativo', () => {
  assert.equal(validarValorMeta(4_250_000, 'VALOR'), null)
  assert.ok(validarValorMeta(-1, 'VALOR'))
})

/* ── Padrões por tipo ────────────────────────────────────────────────────── */

test('MED é UM indicador só — a unidade é que muda', () => {
  // Nao existe "MED" e "MED %" como tipos diferentes: havia dois, e isso
  // produzia duas metas concorrentes sobre o mesmo fato.
  assert.ok(META_TIPOS.includes('MEDS'))
  assert.ok(!(META_TIPOS as readonly string[]).includes('MED_PERCENTUAL'))
  assert.deepEqual(PADRAO_POR_TIPO.MEDS, { unidade: 'PERCENTUAL', direcao: 'MENOR_MELHOR' })
})

test('MED aceita as duas unidades, e e a unidade que decide o comportamento', () => {
  // Percentual nao acumula; quantidade acumula.
  assert.equal(acumulaNoMes('MEDS', 'PERCENTUAL'), false)
  assert.equal(acumulaNoMes('MEDS', 'QUANTIDADE'), true)
})

test('MED em QUANTIDADE segue a direcao configurada', () => {
  // Meta 100, realizado 80, menor e melhor -> positivo.
  const a = avaliarCompleto({
    tipo: 'MEDS', periodo: '2026-09', meta: 100, realizado: 80,
    direcao: 'MENOR_MELHOR', unidade: 'QUANTIDADE',
  }, DIA('2026-10-10'))
  assert.equal(a.positivo, true)
  assert.equal(a.gap, 0)

  // A mesma dupla com maior-e-melhor inverte o julgamento.
  const b = avaliarCompleto({
    tipo: 'MEDS', periodo: '2026-09', meta: 100, realizado: 80,
    direcao: 'MAIOR_MELHOR', unidade: 'QUANTIDADE',
  }, DIA('2026-10-10'))
  assert.equal(b.positivo, false)
  assert.equal(b.gap, 20)
})

test('MED em PERCENTUAL: o caso de 2% contra 1,5%', () => {
  const a = avaliarCompleto({
    tipo: 'MEDS', periodo: '2026-09', meta: 2, realizado: 1.5,
    direcao: 'MENOR_MELHOR', unidade: 'PERCENTUAL',
  }, DIA('2026-10-10'))
  assert.equal(a.positivo, true)
  assert.equal(a.unidade, 'PERCENTUAL')
})

test('TPV e receita nascem como maior-é-melhor', () => {
  assert.equal(PADRAO_POR_TIPO.TPV.direcao, 'MAIOR_MELHOR')
  assert.equal(PADRAO_POR_TIPO.RECEITA_TARIFARIA.direcao, 'MAIOR_MELHOR')
})

test('todo tipo oferecido tem padrão de unidade e direção válidos', () => {
  for (const tipo of META_TIPOS) {
    const p = PADRAO_POR_TIPO[tipo]
    assert.ok(p, `${tipo} sem padrão`)
    assert.ok(META_UNIDADES.includes(p.unidade), `${tipo} com unidade inválida`)
    assert.ok(META_DIRECOES.includes(p.direcao), `${tipo} com direção inválida`)
  }
})

/* ========================================================================= *
 * PACING — o mes ainda esta correndo
 *
 * No dia 10, 33% da meta nao e atraso: e o esperado. Comparar realizado
 * parcial com meta cheia so produz alarme falso na primeira quinzena.
 * ========================================================================= */

const DIA = (iso: string) => new Date(iso + 'T12:00:00Z')

test('no dia 10 de um mes de 31, um terco do mes decorreu', () => {
  const p = calcularPacing('2026-10', 310, 100, 'MAIOR_MELHOR', true, DIA('2026-10-10'))
  assert.ok(Math.abs(p.decorrido - 10 / 31) < 1e-9)
  assert.equal(p.encerrado, false)
})

test('indicador que ACUMULA projeta pelo ritmo', () => {
  // 100 em 10 de 31 dias -> projecao 310, exatamente a meta.
  const p = calcularPacing('2026-10', 310, 100, 'MAIOR_MELHOR', true, DIA('2026-10-10'))
  assert.ok(p.projecao !== null && Math.abs(p.projecao - 310) < 1e-6)
  assert.equal(p.ritmo, 'ACIMA', 'projecao igual a meta ja e bater a meta')
})

test('ritmo insuficiente num indicador que acumula', () => {
  const p = calcularPacing('2026-10', 310, 50, 'MAIOR_MELHOR', true, DIA('2026-10-10'))
  assert.ok(p.projecao !== null && p.projecao < 310)
  assert.equal(p.ritmo, 'ABAIXO')
})

test('indicador que NAO acumula projeta o proprio realizado', () => {
  // MED % no dia 10 e 1,5%: a media parcial ja e a melhor estimativa do mes.
  // Projetar pelo tempo daria 4,65% — um numero sem significado.
  const p = calcularPacing('2026-10', 2, 1.5, 'MENOR_MELHOR', false, DIA('2026-10-10'))
  assert.equal(p.projecao, 1.5)
  assert.equal(p.ritmo, 'ACIMA', 'abaixo do teto e bater a meta')
  assert.equal(p.esperadoAteAgora, 2, 'proporcao nao tem meta parcial')
})

test('MED percentual acima do teto fica ABAIXO do ritmo', () => {
  const p = calcularPacing('2026-10', 2, 3, 'MENOR_MELHOR', false, DIA('2026-10-10'))
  assert.equal(p.ritmo, 'ABAIXO')
})

test('a faixa de tolerancia evita chamar de atraso quem esta a um fio', () => {
  // Projecao 2% contra meta 2,05% em MAIOR_MELHOR: nao bateu, mas esta dentro
  // dos 5% de folga.
  const p = calcularPacing('2026-10', 2.05, 2, 'MAIOR_MELHOR', false, DIA('2026-10-10'))
  assert.equal(p.ritmo, 'NO_RITMO')
})

test('mes ja fechado nao tem ritmo a projetar', () => {
  const p = calcularPacing('2026-09', 310, 200, 'MAIOR_MELHOR', true, DIA('2026-10-10'))
  assert.equal(p.encerrado, true)
  assert.equal(p.decorrido, 1)
  assert.equal(p.projecao, 200, 'mes inteiro decorrido: projecao e o proprio realizado')
})

test('mes futuro nao comecou — nada a projetar', () => {
  const p = calcularPacing('2026-12', 310, null, 'MAIOR_MELHOR', true, DIA('2026-10-10'))
  assert.equal(p.decorrido, 0)
  assert.equal(p.ritmo, 'INDETERMINADO')
})

test('sem realizado nao ha ritmo', () => {
  const p = calcularPacing('2026-10', 310, null, 'MAIOR_MELHOR', true, DIA('2026-10-10'))
  assert.equal(p.projecao, null)
  assert.equal(p.ritmo, 'INDETERMINADO')
})

test('indicadores de fluxo acumulam; estoque e proporcao nao', () => {
  assert.equal(acumulaNoMes('TPV', 'VALOR'), true)
  assert.equal(acumulaNoMes('RECEITA_TARIFARIA', 'VALOR'), true)
  assert.equal(acumulaNoMes('TRANSACOES', 'QUANTIDADE'), true)
  assert.equal(acumulaNoMes('SALDO_EM_CONTA', 'VALOR'), false, 'saldo medio e estoque')
  assert.equal(acumulaNoMes('TAKE_RATE', 'PERCENTUAL'), false, 'proporcao nao acumula')
})

/* ========================================================================= *
 * AVALIACAO COMPLETA — a funcao unica
 * ========================================================================= */

test('gap e sempre "quanto falta", nunca a diferenca crua', () => {
  const maior = avaliarCompleto({
    tipo: 'TPV', periodo: '2026-09', meta: 100, realizado: 80,
    direcao: 'MAIOR_MELHOR', unidade: 'VALOR',
  }, DIA('2026-10-10'))
  assert.equal(maior.gap, 20, 'faltam 20 para chegar em 100')

  const menor = avaliarCompleto({
    tipo: 'MED_PERCENTUAL', periodo: '2026-09', meta: 2, realizado: 3,
    direcao: 'MENOR_MELHOR', unidade: 'PERCENTUAL',
  }, DIA('2026-10-10'))
  assert.equal(menor.gap, 1, 'sobra 1 ponto a cortar')
})

test('quem esta no alvo tem gap zero, nos dois sentidos', () => {
  const a = avaliarCompleto({
    tipo: 'TPV', periodo: '2026-09', meta: 100, realizado: 150,
    direcao: 'MAIOR_MELHOR', unidade: 'VALOR',
  }, DIA('2026-10-10'))
  const b = avaliarCompleto({
    tipo: 'MED_PERCENTUAL', periodo: '2026-09', meta: 2, realizado: 1.5,
    direcao: 'MENOR_MELHOR', unidade: 'PERCENTUAL',
  }, DIA('2026-10-10'))
  assert.equal(a.gap, 0)
  assert.equal(b.gap, 0)
  assert.equal(a.positivo, true)
  assert.equal(b.positivo, true)
})

test('sem realizado, gap e nulo — nao zero', () => {
  const a = avaliarCompleto({
    tipo: 'TPV', periodo: '2026-09', meta: 100, realizado: null,
    direcao: 'MAIOR_MELHOR', unidade: 'VALOR',
  }, DIA('2026-10-10'))
  assert.equal(a.gap, null)
  assert.equal(a.situacao, 'SEM_REALIZADO')
})

test('avaliarCompleto reune comparacao, gap e ritmo numa chamada so', () => {
  // O caso da especificacao: MED 2% com realizado 1,5%.
  const a = avaliarCompleto({
    tipo: 'MED_PERCENTUAL', periodo: '2026-10', meta: 2, realizado: 1.5,
    direcao: 'MENOR_MELHOR', unidade: 'PERCENTUAL',
  }, DIA('2026-10-10'))

  assert.equal(a.positivo, true)
  assert.equal(a.situacao, 'ATINGIDA')
  assert.ok(a.cumprimento !== null && a.cumprimento > 100)
  assert.equal(a.gap, 0)
  assert.equal(a.pacing.ritmo, 'ACIMA')
  assert.equal(a.unidade, 'PERCENTUAL')
  assert.equal(a.direcao, 'MENOR_MELHOR')
})

test('tipo desconhecido assume que acumula — o caso mais comum', () => {
  const a = avaliarCompleto({
    tipo: 'INDICADOR_NOVO', periodo: '2026-10', meta: 310, realizado: 100,
    direcao: 'MAIOR_MELHOR', unidade: 'VALOR',
  }, DIA('2026-10-10'))
  assert.ok(a.pacing.projecao !== null && Math.abs(a.pacing.projecao - 310) < 1e-6)
})

/* ── MED: um indicador, duas unidades ────────────────────────────────────── */

test('o indicador separado "MED percentual" saiu da criacao', () => {
  // Continua legivel no banco (metas antigas), mas nao e mais oferecido: dois
  // tipos para o mesmo conceito produziam duas metas concorrentes.
  for (const t of META_TIPOS) {
    assert.notEqual(t, 'MED_PERCENTUAL' as string)
  }
})

test('a unidade determina formatacao, comparacao e projecao do MED', () => {
  const pct = avaliarCompleto({
    tipo: 'MEDS', periodo: '2026-10', meta: 2, realizado: 1.5,
    direcao: 'MENOR_MELHOR', unidade: 'PERCENTUAL',
  }, DIA('2026-10-10'))
  const qtd = avaliarCompleto({
    tipo: 'MEDS', periodo: '2026-10', meta: 310, realizado: 100,
    direcao: 'MENOR_MELHOR', unidade: 'QUANTIDADE',
  }, DIA('2026-10-10'))

  // Percentual nao projeta pelo tempo; quantidade projeta.
  assert.equal(pct.pacing.projecao, 1.5)
  assert.ok(qtd.pacing.projecao !== null && Math.abs(qtd.pacing.projecao - 310) < 1e-6)
})

/* ========================================================================= *
 * METAS DE PIPELINE
 * ========================================================================= */

test('os cinco tipos de meta de pipeline sao oferecidos na criacao', () => {
  for (const t of ['LEADS_GERADOS', 'LEADS_GANHOS', 'LEADS_PERDIDOS',
                   'CONVERSAO_LEADS', 'ATIVIDADE_ASSISTIDA']) {
    assert.ok(META_TIPOS.includes(t as never), `${t} nao aparece na criacao`)
    assert.ok(ehMetaDePipeline(t))
  }
})

test('meta de pipeline NUNCA e monetaria', () => {
  // O valor comercial de um lead nao esta validado e nao vira meta.
  for (const t of META_TIPOS.filter((x) => ehMetaDePipeline(x))) {
    assert.notEqual(
      PADRAO_POR_TIPO[t].unidade, 'VALOR',
      `${t} nasceu como meta em reais`,
    )
  }
})

test('as metas operacionais nao sao confundidas com as de pipeline', () => {
  for (const t of ['TPV', 'RECEITA_TARIFARIA', 'MEDS', 'TAKE_RATE',
                   'SALDO_EM_CONTA', 'TRANSACOES']) {
    assert.ok(!ehMetaDePipeline(t), `${t} virou meta de pipeline`)
  }
})

test('perder MENOS e melhor — a direcao padrao de leads perdidos inverte', () => {
  assert.equal(PADRAO_POR_TIPO.LEADS_PERDIDOS.direcao, 'MENOR_MELHOR')
  assert.equal(PADRAO_POR_TIPO.LEADS_GANHOS.direcao, 'MAIOR_MELHOR')
  assert.equal(PADRAO_POR_TIPO.LEADS_GERADOS.direcao, 'MAIOR_MELHOR')
})

test('conversao nasce percentual; geracao nasce em quantidade', () => {
  assert.equal(PADRAO_POR_TIPO.CONVERSAO_LEADS.unidade, 'PERCENTUAL')
  assert.equal(PADRAO_POR_TIPO.LEADS_GERADOS.unidade, 'QUANTIDADE')
})

test('meta de conversao em 20%: realizado 25% atinge', () => {
  const a = avaliarCompleto({
    tipo: 'CONVERSAO_LEADS', periodo: '2026-10', meta: 20, realizado: 25,
    direcao: 'MAIOR_MELHOR', unidade: 'PERCENTUAL',
  }, DIA('2026-10-20'))
  assert.equal(a.positivo, true)
  assert.equal(a.gap, 0)
  // Percentual nao projeta pelo tempo: e uma taxa, nao um acumulado.
  assert.equal(a.pacing.projecao, 25)
})

test('atividade assistida aceita as DUAS unidades, como o MED', () => {
  const pct = avaliarCompleto({
    tipo: 'ATIVIDADE_ASSISTIDA', periodo: '2026-10', meta: 60, realizado: 45,
    direcao: 'MAIOR_MELHOR', unidade: 'PERCENTUAL',
  }, DIA('2026-10-20'))
  const qtd = avaliarCompleto({
    tipo: 'ATIVIDADE_ASSISTIDA', periodo: '2026-10', meta: 80, realizado: 45,
    direcao: 'MAIOR_MELHOR', unidade: 'QUANTIDADE',
  }, DIA('2026-10-20'))

  assert.equal(pct.unidade, 'PERCENTUAL')
  assert.equal(qtd.unidade, 'QUANTIDADE')
  // Quantidade acumula e projeta; percentual nao.
  assert.equal(pct.pacing.projecao, 45)
  assert.ok(qtd.pacing.projecao !== null && qtd.pacing.projecao > 45)
})

test('todo tipo oferecido tem rotulo, e nenhum rotulo diz "MEDs"', () => {
  for (const t of META_TIPOS) {
    assert.ok(META_TIPO_LABEL[t], `${t} sem rotulo`)
  }
  assert.equal(META_TIPO_LABEL.MEDS, 'MED')
  for (const t of META_TIPOS) {
    assert.ok(
      !/\bMEDs\b/.test(META_TIPO_LABEL[t]),
      `o rotulo de ${t} voltou a dizer "MEDs": ${META_TIPO_LABEL[t]}`,
    )
  }
})

test('o legado MED_PERCENTUAL continua LEGIVEL, marcado como legado', () => {
  // Metas antigas gravadas com ele precisam de nome ao serem lidas.
  assert.ok(META_TIPO_LABEL.MED_PERCENTUAL)
  assert.ok(/legado/i.test(META_TIPO_LABEL.MED_PERCENTUAL))
})
