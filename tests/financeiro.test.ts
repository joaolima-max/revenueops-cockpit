/**
 * FINANCEIRO — regras puras: composição do MRR, ARR e expansão de lançamentos.
 *
 * `calcularMrr` fala com o Prisma, então o que se testa aqui é a ARITMÉTICA da
 * composição, replicada sobre as mesmas quatro parcelas que a função soma. Se
 * a regra de negócio do MRR mudar, este arquivo tem que mudar junto — é o
 * ponto onde a definição fica escrita de forma executável.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrDoMrr, expandirLancamento, type Mrr } from '../lib/financeiro'

/**
 * A mesma soma que `calcularMrr` faz, sobre parcelas já carregadas.
 *
 *   MRR = sustentação BaaS
 *       + sustentação White Label
 *       + API mensal dos parceiros (BaaS + White Label)
 *       + API mensal dos clientes da Carteira
 */
function totalMrr(p: Omit<Mrr, 'total'>): number {
  return p.sustentacaoBaas + p.sustentacaoWhiteLabel + p.apiMensalParceiros + p.apiMensalCarteira
}

/* ── MRR ─────────────────────────────────────────────────────────────────── */

test('MRR soma as quatro parcelas da especificação', () => {
  const parcelas = {
    sustentacaoBaas: 12_000,
    sustentacaoWhiteLabel: 8_000,
    apiMensalParceiros: 5_500,
    apiMensalCarteira: 3_200,
  }
  assert.equal(totalMrr(parcelas), 28_700)
})

test('parcela ausente entra como zero, não como buraco no total', () => {
  assert.equal(
    totalMrr({
      sustentacaoBaas: 10_000, sustentacaoWhiteLabel: 0,
      apiMensalParceiros: 0, apiMensalCarteira: 0,
    }),
    10_000,
  )
})

test('API mensal do parceiro e do cliente da carteira são parcelas distintas', () => {
  // São campos de tabelas diferentes: CondicaoComercial.apiMensal e
  // Cliente.mensalidadeApi. Somar as duas não é dupla contagem — seria dupla
  // contagem se a MESMA mensalidade aparecesse nas duas.
  const parceirosSo = totalMrr({
    sustentacaoBaas: 0, sustentacaoWhiteLabel: 0,
    apiMensalParceiros: 1_000, apiMensalCarteira: 0,
  })
  const carteiraSo = totalMrr({
    sustentacaoBaas: 0, sustentacaoWhiteLabel: 0,
    apiMensalParceiros: 0, apiMensalCarteira: 1_000,
  })
  const ambos = totalMrr({
    sustentacaoBaas: 0, sustentacaoWhiteLabel: 0,
    apiMensalParceiros: 1_000, apiMensalCarteira: 1_000,
  })
  assert.equal(parceirosSo, 1_000)
  assert.equal(carteiraSo, 1_000)
  assert.equal(ambos, 2_000)
})

test('MRR zerado quando não há nada contratado', () => {
  assert.equal(
    totalMrr({
      sustentacaoBaas: 0, sustentacaoWhiteLabel: 0,
      apiMensalParceiros: 0, apiMensalCarteira: 0,
    }),
    0,
  )
})

/* ── ARR ─────────────────────────────────────────────────────────────────── */

test('ARR é o MRR vezes doze, sem projeção de crescimento', () => {
  assert.equal(arrDoMrr(28_700), 344_400)
  assert.equal(arrDoMrr(0), 0)
})

test('ARR usa o MRR calculado, não uma segunda apuração', () => {
  const mrr = totalMrr({
    sustentacaoBaas: 12_000, sustentacaoWhiteLabel: 8_000,
    apiMensalParceiros: 5_500, apiMensalCarteira: 3_200,
  })
  assert.equal(arrDoMrr(mrr), mrr * 12)
})

/* ── Expansão de lançamentos ─────────────────────────────────────────────── */

const D = (iso: string) => new Date(iso + 'T00:00:00Z')
const iso = (d: Date) => d.toISOString().slice(0, 10)

test('lançamento único gera exatamente uma linha', () => {
  const linhas = expandirLancamento('UNICA', D('2026-03-10'), 1_500)
  assert.equal(linhas.length, 1)
  assert.equal(iso(linhas[0].data), '2026-03-10')
  assert.equal(linhas[0].valor, 1_500)
  assert.equal(linhas[0].parcela, null)
})

test('parcelado gera uma linha por parcela, mensal, com o valor da parcela', () => {
  const linhas = expandirLancamento('PARCELADA', D('2026-01-15'), 500, { totalParcelas: 6 })
  assert.equal(linhas.length, 6)
  assert.deepEqual(linhas.map((l) => iso(l.data)), [
    '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15',
  ])
  assert.ok(linhas.every((l) => l.valor === 500))
  assert.deepEqual(linhas.map((l) => l.parcela), [1, 2, 3, 4, 5, 6])
  assert.ok(linhas.every((l) => l.totalParcelas === 6))
})

test('parcelado que começa no dia 31 cai no último dia dos meses curtos', () => {
  // Sem isso, 31/01 + 1 mês viraria 02/03 e a parcela pularia de mês.
  const linhas = expandirLancamento('PARCELADA', D('2026-01-31'), 100, { totalParcelas: 4 })
  assert.deepEqual(linhas.map((l) => iso(l.data)), [
    '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
  ])
})

test('recorrente materializa o horizonte informado, com o mesmo valor', () => {
  const linhas = expandirLancamento('RECORRENTE', D('2026-01-05'), 900, { meses: 12 })
  assert.equal(linhas.length, 12)
  assert.ok(linhas.every((l) => l.valor === 900))
  assert.ok(linhas.every((l) => l.parcela === null))
  assert.equal(iso(linhas[11].data), '2026-12-05')
})

test('recorrente sem horizonte informado usa doze meses', () => {
  assert.equal(expandirLancamento('RECORRENTE', D('2026-01-05'), 900).length, 12)
})

test('parcelamento degenerado não produz zero linhas', () => {
  assert.equal(expandirLancamento('PARCELADA', D('2026-01-05'), 100, { totalParcelas: 0 }).length, 1)
  assert.equal(expandirLancamento('RECORRENTE', D('2026-01-05'), 100, { meses: 0 }).length, 1)
})

test('o total materializado de um parcelado é a soma das parcelas', () => {
  const linhas = expandirLancamento('PARCELADA', D('2026-01-10'), 250, { totalParcelas: 12 })
  assert.equal(linhas.reduce((a, l) => a + l.valor, 0), 3_000)
})
