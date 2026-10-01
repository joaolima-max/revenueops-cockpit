/**
 * LEADS — obrigatoriedades e exclusão.
 *
 * O botão de excluir não funcionava, e a causa não era a UI: `Activity.leadId`
 * e `Deal.leadId` estavam NO ACTION no banco, então apagar um lead já
 * trabalhado estourava violação de FK, a rota devolvia 500 e, para quem
 * clicava, nada acontecia.
 *
 * A v20 pôs `Activity` em CASCADE (é log sobre o lead). Os CARDS continuam
 * bloqueando de propósito: apagá-los junto destruiria histórico de pipeline.
 * O que mudou é que a recusa passou a ser explícita.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validarLead, bloqueioDeExclusao, CAMPOS_OBRIGATORIOS_LEAD,
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
 * EXCLUSÃO
 * ========================================================================= */

test('lead sem card EXCLUI — e o caso do lead duplicado ou errado', () => {
  assert.equal(bloqueioDeExclusao(0), null)
})

test('lead COM card e bloqueado, e a recusa diz quantos', () => {
  // Apagar o card junto levaria movimentacoes, comentarios e desfecho — e
  // ninguem pediu para destruir historico de pipeline.
  const b = bloqueioDeExclusao(3)
  assert.ok(b)
  assert.equal(b!.cards, 3)
  assert.ok(b!.mensagem.includes('3'))
  assert.ok(/pipeline/i.test(b!.mensagem), 'a mensagem precisa dizer o motivo')
})

test('a recusa explica o que fazer, nao so que falhou', () => {
  const b = bloqueioDeExclusao(1)!
  assert.ok(
    /remova|transfira/i.test(b.mensagem),
    'sem caminho de saida, o usuario fica preso na mesma recusa',
  )
})

test('a mensagem concorda em numero — um card, nao "1 cards"', () => {
  const um = bloqueioDeExclusao(1)!.mensagem
  assert.ok(um.includes('1 card '), um)
  assert.ok(!um.includes('cards'), um)

  const varios = bloqueioDeExclusao(2)!.mensagem
  assert.ok(varios.includes('2 cards'), varios)
})
