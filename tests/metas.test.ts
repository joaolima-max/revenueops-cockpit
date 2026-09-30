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
