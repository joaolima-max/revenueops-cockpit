/**
 * FORMATAÇÃO MONETÁRIA — regra global: valor exato, nunca abreviado.
 *
 * O que estes testes protegem é uma decisão de produto, não um detalhe de
 * apresentação: "R$ 4,25 MM" esconde exatamente os dígitos que quem opera a
 * mesa está conferindo. Qualquer reintrodução de escala (K, M, MM, BI, mil,
 * mi, bi, tri) quebra aqui.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  figuraMoeda, figuraQuantidade, figuraPercentual, figuraContagem,
  moedaCheia, quantidadeCompacta, percentual, eixoMoeda, variacao,
} from '../lib/format-financeiro'

/** Sufixos de escala que não podem aparecer em lugar nenhum. */
const ABREVIACOES = /\b(K|M|MM|BI|B|mil|mi|bi|tri)\b/

test('moeda grande sai por extenso, com centavos', () => {
  const f = figuraMoeda(4_250_000)
  assert.equal(f.valor, '4.250.000,00')
  assert.equal(f.unidade, '')
  assert.equal(f.prefixo, 'R$')
  assert.equal(f.completo, 'R$ 4.250.000,00')
})

test('nenhuma escala aparece em valores de qualquer ordem de grandeza', () => {
  for (const n of [999, 1_000, 15_500, 1_000_000, 159_592_207.57, 4_250_000_000, 7_000_000_000_000]) {
    const f = figuraMoeda(n)
    assert.equal(f.unidade, '', `unidade deveria ser vazia para ${n}`)
    assert.ok(!ABREVIACOES.test(f.valor), `valor abreviado para ${n}: ${f.valor}`)
    assert.ok(!ABREVIACOES.test(f.completo), `completo abreviado para ${n}: ${f.completo}`)
  }
})

test('o exemplo da especificação: R$ 4.250.000,00 e não R$ 4,25 MM', () => {
  assert.equal(moedaCheia(4_250_000), 'R$ 4.250.000,00')
  assert.ok(!moedaCheia(4_250_000).includes('MM'))
})

test('centavos são preservados — é o dígito que se confere', () => {
  assert.equal(figuraMoeda(159_592_207.57).completo, 'R$ 159.592.207,57')
  assert.equal(figuraMoeda(0.01).completo, 'R$ 0,01')
})

test('valor negativo mantém o sinal e a precisão', () => {
  assert.equal(figuraMoeda(-1_234.56).completo, 'R$ -1.234,56')
})

test('quantidade é inteiro exato, sem escala', () => {
  const f = figuraQuantidade(1_234_567)
  assert.equal(f.valor, '1.234.567')
  assert.equal(f.unidade, '')
  assert.equal(quantidadeCompacta(1_234_567), '1.234.567')
  assert.ok(!ABREVIACOES.test(quantidadeCompacta(9_000_000)))
})

test('contagem simples não abrevia', () => {
  assert.equal(figuraContagem(12_000).completo, '12.000')
})

test('percentual mantém as casas pedidas', () => {
  assert.equal(figuraPercentual(12.3456, 2).completo, '12,35%')
  assert.equal(percentual(0.5, 3), '0,500%')
})

test('eixo de gráfico corta centavos mas não troca de escala', () => {
  const r = eixoMoeda(4_250_000)
  assert.equal(r, 'R$ 4.250.000')
  assert.ok(!ABREVIACOES.test(r))
})

test('variação continua respondendo direção e rótulo', () => {
  assert.equal(variacao(110, 100)?.direcao, 'up')
  assert.equal(variacao(90, 100)?.direcao, 'down')
  assert.equal(variacao(100, 100)?.rotulo, 'estável')
  // Base zero não tem variação definida: null, nunca "+∞%".
  assert.equal(variacao(10, 0), null)
  assert.equal(variacao(null, 100), null)
})
