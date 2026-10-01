/**
 * CLIENTES — ordenação e filtro da Carteira.
 *
 * A regra que estes testes protegem: ATIVOS primeiro e em ordem alfabética,
 * INATIVOS depois e em ordem alfabética. É a ordem em que a carteira se lê —
 * quem está ativo é o trabalho de hoje.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ordenarCarteira, pesoDoStatus, filtrarCarteira,
  STATUS_CLIENTE, STATUS_CLIENTE_LABEL,
} from '../lib/clientes'

/* ========================================================================= *
 * STATUS
 * ========================================================================= */

test('a tela oferece ATIVO e INATIVO, e so esses dois', () => {
  assert.deepEqual([...STATUS_CLIENTE], ['ATIVO', 'INATIVO'])
})

test('os status LEGADOS continuam legiveis', () => {
  // Ha clientes gravados com eles; apaga-los do enum exigiria reescrever
  // esses registros. A tela oferece dois; a leitura entende cinco.
  for (const legado of ['PROSPECCAO', 'ENCERRADO', 'STANDBY']) {
    assert.ok(STATUS_CLIENTE_LABEL[legado], `${legado} sem rotulo`)
    assert.ok(/legado/i.test(STATUS_CLIENTE_LABEL[legado]))
  }
})

test('o peso coloca ATIVO primeiro, INATIVO depois, legados por ultimo', () => {
  // O peso existe porque ORDER BY status ordenaria pela posicao no enum —
  // certo por acidente hoje, errado no dia em que um valor entrasse no meio.
  assert.ok(pesoDoStatus('ATIVO') < pesoDoStatus('INATIVO'))
  assert.ok(pesoDoStatus('INATIVO') < pesoDoStatus('PROSPECCAO'))
  assert.equal(pesoDoStatus('ENCERRADO'), pesoDoStatus('STANDBY'))
})

/* ========================================================================= *
 * ORDENAÇÃO
 * ========================================================================= */

test('ATIVOS alfabeticos, depois INATIVOS alfabeticos', () => {
  const r = ordenarCarteira([
    { status: 'INATIVO', nome: 'Alpha' },
    { status: 'ATIVO', nome: 'Zebra' },
    { status: 'ATIVO', nome: 'Beta' },
    { status: 'INATIVO', nome: 'Bravo' },
  ])
  assert.deepEqual(r.map((c) => `${c.status}:${c.nome}`), [
    'ATIVO:Beta', 'ATIVO:Zebra', 'INATIVO:Alpha', 'INATIVO:Bravo',
  ])
})

test('ACENTO nao joga o cliente para o fim da lista', () => {
  // Ordenacao por codigo de caractere poria "Ângulo" depois de "Zebra".
  const r = ordenarCarteira([
    { status: 'ATIVO', nome: 'Zebra' },
    { status: 'ATIVO', nome: 'Ângulo' },
    { status: 'ATIVO', nome: 'Andrade' },
  ])
  assert.deepEqual(r.map((c) => c.nome), ['Andrade', 'Ângulo', 'Zebra'])
})

test('a ordenacao nao muta a lista recebida', () => {
  const original = [
    { status: 'INATIVO', nome: 'B' },
    { status: 'ATIVO', nome: 'A' },
  ]
  const copia = [...original]
  ordenarCarteira(original)
  assert.deepEqual(original, copia)
})

test('status legado fica DEPOIS dos inativos', () => {
  const r = ordenarCarteira([
    { status: 'PROSPECCAO', nome: 'Aaa' },
    { status: 'INATIVO', nome: 'Zzz' },
    { status: 'ATIVO', nome: 'Mmm' },
  ])
  assert.deepEqual(r.map((c) => c.status), ['ATIVO', 'INATIVO', 'PROSPECCAO'])
})

/* ========================================================================= *
 * FILTRO
 * ========================================================================= */

const base = [
  {
    nome: 'ACME Pagamentos', cnpj: '11.111.111/0001-11', numeroConta: '9001',
    status: 'ATIVO', modeloOperacional: 'BAAS',
    segmentoComercialId: 's1', gestorId: 'u1',
  },
  {
    nome: 'Beta Cripto', cnpj: '22.222.222/0001-22', numeroConta: '9002',
    status: 'INATIVO', modeloOperacional: 'API',
    segmentoComercialId: 's2', gestorId: 'u2',
  },
  {
    nome: 'Gama Varejo', cnpj: null, numeroConta: null,
    status: 'ATIVO', modeloOperacional: 'WHITE_LABEL',
    segmentoComercialId: null, gestorId: null,
  },
]

test('sem filtro, passa tudo', () => {
  assert.equal(filtrarCarteira(base, {}).length, 3)
})

test('a busca cobre nome, CNPJ e NUMERO DA CONTA', () => {
  // A conta e a unica das tres que o Lancamento BaaS usa.
  assert.equal(filtrarCarteira(base, { busca: 'ACME' }).length, 1)
  assert.equal(filtrarCarteira(base, { busca: '22.222' }).length, 1)
  assert.equal(filtrarCarteira(base, { busca: '9001' })[0].nome, 'ACME Pagamentos')
})

test('a busca ignora acento e caixa', () => {
  const comAcento = [{
    nome: 'Ângulo Serviços', cnpj: null, numeroConta: null,
    status: 'ATIVO', modeloOperacional: 'API',
    segmentoComercialId: null, gestorId: null,
  }]
  assert.equal(filtrarCarteira(comAcento, { busca: 'angulo' }).length, 1)
  assert.equal(filtrarCarteira(comAcento, { busca: 'SERVICOS' }).length, 1)
})

test('cliente sem CNPJ nem conta nao estoura na busca', () => {
  assert.equal(filtrarCarteira(base, { busca: 'gama' }).length, 1)
})

test('filtro por status, modelo, segmento e gestor', () => {
  assert.equal(filtrarCarteira(base, { status: 'ATIVO' }).length, 2)
  assert.equal(filtrarCarteira(base, { modelo: 'BAAS' }).length, 1)
  assert.equal(filtrarCarteira(base, { segmentoId: 's2' }).length, 1)
  assert.equal(filtrarCarteira(base, { gestorId: 'u1' })[0].nome, 'ACME Pagamentos')
})

test('os filtros se combinam (E, nao OU)', () => {
  assert.equal(filtrarCarteira(base, { status: 'ATIVO', modelo: 'API' }).length, 0)
  assert.equal(filtrarCarteira(base, { status: 'ATIVO', modelo: 'BAAS' }).length, 1)
})
