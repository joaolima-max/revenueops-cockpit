/**
 * LEADS — obrigatoriedades e exclusão.
 *
 * EXCLUIR VIROU MOVER PARA A LIXEIRA.
 *
 * A exclusão física obrigava a escolher entre destruir o histórico de
 * pipeline (cascade) ou recusar a exclusão (restrict) — e a constraint
 * `NO ACTION` do banco fazia a escolha virar um 500 silencioso. A lixeira não
 * tem de escolher: o lead sai de circulação e o passado continua legível.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validarLead, CAMPOS_OBRIGATORIOS_LEAD,
  naLixeira, FILTRO_ATIVOS, descarteTexto,
} from '../lib/leads'

/* ========================================================================= *
 * OBRIGATORIEDADES — duas, e só duas
 * ========================================================================= */

test('empresa e executivo sao obrigatorios', () => {
  assert.deepEqual([...CAMPOS_OBRIGATORIOS_LEAD], ['company', 'name'])
})

test('lead com empresa e executivo passa — nada mais e exigido', () => {
  // Um lead nasce de uma conversa. Exigir CNPJ, segmento ou canal na criacao
  // faz o vendedor inventar valor para conseguir salvar, e dado inventado e
  // pior que dado ausente.
  assert.deepEqual(validarLead({ company: 'ACME', name: 'João' }), [])
})

test('sem empresa, recusa e aponta o campo', () => {
  const erros = validarLead({ name: 'João' })
  assert.equal(erros.length, 1)
  assert.equal(erros[0].campo, 'company')
})

test('sem executivo, recusa e aponta o campo', () => {
  const erros = validarLead({ company: 'ACME' })
  assert.equal(erros.length, 1)
  assert.equal(erros[0].campo, 'name')
})

test('faltando os dois, os dois erros voltam', () => {
  assert.equal(validarLead({}).length, 2)
})

test('espaco em branco nao satisfaz a obrigatoriedade', () => {
  // "   " passa num `required` de HTML mal configurado e chega ao servidor.
  assert.equal(validarLead({ company: '   ', name: 'João' }).length, 1)
  assert.equal(validarLead({ company: 'ACME', name: '\t\n ' }).length, 1)
})

test('valor que nao e string nao satisfaz a obrigatoriedade', () => {
  // O corpo da requisicao e JSON arbitrario: numero, null e objeto chegam.
  for (const v of [null, undefined, 0, 1, {}, [], true]) {
    assert.equal(
      validarLead({ company: v, name: 'João' }).length, 1,
      `${JSON.stringify(v)} foi aceito como nome de empresa`,
    )
  }
})

/* ========================================================================= *
 * LIXEIRA
 * ========================================================================= */

test('o filtro de ativos e o que esconde a lixeira', () => {
  // Uma consulta sem este filtro devolve leads descartados — e e um erro
  // silencioso: a lista simplesmente volta a mostrar o que foi excluido.
  assert.deepEqual({ ...FILTRO_ATIVOS }, { deletedAt: null })
})

test('naLixeira distingue descartado de ativo', () => {
  assert.equal(naLixeira({ deletedAt: null }), false)
  assert.equal(naLixeira({ deletedAt: undefined }), false)
  assert.equal(naLixeira({}), false)
  assert.equal(naLixeira({ deletedAt: new Date('2026-10-01T12:00:00Z') }), true)
  // String ISO tambem conta: e como o lead chega do JSON da API.
  assert.equal(naLixeira({ deletedAt: '2026-10-01T12:00:00Z' }), true)
})

test('o descarte diz QUANDO e POR QUEM', () => {
  // E a razao de a lixeira existir: um Diretor precisa saber quem descartou.
  const t = descarteTexto({
    deletedAt: '2026-10-01T12:00:00Z',
    deletedBy: { name: 'João Lima' },
  })
  assert.ok(t.includes('João Lima'), t)
  assert.ok(t.includes('2026') || t.includes('01/10'), t)
})

test('lead ativo nao tem texto de descarte', () => {
  assert.equal(descarteTexto({ deletedAt: null }), '—')
})

test('descarte sem autor registrado ainda mostra a data', () => {
  // `deletedById` e SET NULL: se o usuario que excluiu for removido, a data
  // sobrevive. Perder a data junto seria perder o fato.
  const t = descarteTexto({ deletedAt: '2026-10-01T12:00:00Z', deletedBy: null })
  assert.notEqual(t, '—')
  assert.ok(!t.includes('undefined'), t)
})
