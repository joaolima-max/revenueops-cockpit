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
  calcularPacing, avaliarCompleto, ACUMULA_NO_MES,
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

test('MED percentual nasce como percentual e menor-é-melhor', () => {
  assert.deepEqual(PADRAO_POR_TIPO.MED_PERCENTUAL, {
    unidade: 'PERCENTUAL', direcao: 'MENOR_MELHOR',
  })
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
  assert.equal(ACUMULA_NO_MES.TPV, true)
  assert.equal(ACUMULA_NO_MES.RECEITA_TARIFARIA, true)
  assert.equal(ACUMULA_NO_MES.TRANSACOES, true)
  assert.equal(ACUMULA_NO_MES.MEDS, true)
  assert.equal(ACUMULA_NO_MES.SALDO_EM_CONTA, false, 'saldo medio e estoque')
  assert.equal(ACUMULA_NO_MES.MED_PERCENTUAL, false, 'proporcao nao acumula')
  assert.equal(ACUMULA_NO_MES.TAKE_RATE, false, 'proporcao nao acumula')
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
