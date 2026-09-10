/** Casamento de gatilho, condicoes e configuracao das acoes. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  automacoesQueDisparam, condicaoSatisfeita, validarConfiguracao, interpolar,
  type ContextoGatilho, type AutomacaoCandidata,
} from '../lib/automacoes'

const ctx = (over: Partial<ContextoGatilho> = {}): ContextoGatilho => ({
  gatilho: 'ETAPA_CONCLUIDA',
  funilId: 'f-vendas', etapaId: 'e-fechamento',
  dealId: 'd1', valor: 50_000, probabilidade: 80,
  segmento: 'GATEWAY_PAGAMENTOS', titulo: 'Cliente X',
  ...over,
})

const auto = (over: Partial<AutomacaoCandidata> = {}): AutomacaoCandidata => ({
  id: 'a1', ativo: true, gatilho: 'ETAPA_CONCLUIDA',
  funilId: null, etapaId: null, condicao: null,
  ...over,
})

test('escopo nulo casa com qualquer funil e qualquer etapa', () => {
  assert.equal(automacoesQueDisparam([auto()], ctx()).length, 1)
})

test('escopo especifico so casa com o proprio funil e etapa', () => {
  assert.equal(automacoesQueDisparam([auto({ funilId: 'f-vendas', etapaId: 'e-fechamento' })], ctx()).length, 1)
  assert.equal(automacoesQueDisparam([auto({ funilId: 'f-outro' })], ctx()).length, 0)
  assert.equal(automacoesQueDisparam([auto({ etapaId: 'e-outra' })], ctx()).length, 0)
})

test('automacao inativa ou de outro gatilho nao dispara', () => {
  assert.equal(automacoesQueDisparam([auto({ ativo: false })], ctx()).length, 0)
  assert.equal(automacoesQueDisparam([auto({ gatilho: 'CARD_CRIADO' })], ctx()).length, 0)
})

test('sem condicao, a automacao vale para todo o escopo', () => {
  assert.ok(condicaoSatisfeita(null, ctx()))
  assert.ok(condicaoSatisfeita({}, ctx()))
  assert.ok(condicaoSatisfeita({ todas: [] }, ctx()))
})

test('condicoes numericas e de texto', () => {
  assert.ok(condicaoSatisfeita({ todas: [{ campo: 'valor', operador: 'gte', valor: 50_000 }] }, ctx()))
  assert.ok(!condicaoSatisfeita({ todas: [{ campo: 'valor', operador: 'gt', valor: 50_000 }] }, ctx()))
  assert.ok(condicaoSatisfeita({ todas: [{ campo: 'segmento', operador: 'eq', valor: 'GATEWAY_PAGAMENTOS' }] }, ctx()))
  assert.ok(condicaoSatisfeita({ todas: [{ campo: 'titulo', operador: 'contem', valor: 'cliente' }] }, ctx()))
  assert.ok(!condicaoSatisfeita({ todas: [{ campo: 'titulo', operador: 'contem', valor: 'zzz' }] }, ctx()))
})

test('`todas` e E logico: uma regra falsa reprova o conjunto', () => {
  const c = {
    todas: [
      { campo: 'valor' as const, operador: 'gte' as const, valor: 10_000 },
      { campo: 'probabilidade' as const, operador: 'gte' as const, valor: 90 },
    ],
  }
  assert.ok(!condicaoSatisfeita(c, ctx()))
  assert.ok(condicaoSatisfeita(c, ctx({ probabilidade: 95 })))
})

test('campo ausente no contexto nao satisfaz a condicao', () => {
  assert.ok(!condicaoSatisfeita(
    { todas: [{ campo: 'operacao', operador: 'eq', valor: 'CASH_IN' }] },
    ctx({ operacao: null }),
  ))
})

test('condicao malformada nao dispara — falha fechada', () => {
  assert.ok(!condicaoSatisfeita({ todas: [{ campo: 'inexistente', operador: 'eq', valor: 1 }] }, ctx()))
  assert.ok(!condicaoSatisfeita({ todas: [{ campo: 'valor', operador: 'aproximadamente', valor: 1 }] }, ctx()))
})

test('transferir exige funil e etapa de destino', () => {
  const base = {
    acao: 'TRANSFERIR_FUNIL' as const, funilDestinoId: null, etapaDestinoId: null,
    destinatarioRole: null, destinatarioUserId: null, titulo: null, mensagem: null,
  }
  assert.match(validarConfiguracao(base)!, /funil de destino/)
  assert.match(validarConfiguracao({ ...base, funilDestinoId: 'f2' })!, /etapa inicial/)
  assert.equal(validarConfiguracao({ ...base, funilDestinoId: 'f2', etapaDestinoId: 'e1' }), null)
})

test('notificar exige destinatario e titulo', () => {
  const base = {
    acao: 'NOTIFICAR' as const, funilDestinoId: null, etapaDestinoId: null,
    destinatarioRole: null, destinatarioUserId: null, titulo: null, mensagem: null,
  }
  assert.match(validarConfiguracao(base)!, /quem recebe/)
  assert.match(validarConfiguracao({ ...base, destinatarioRole: 'OPERACIONAL' })!, /título/)
  assert.equal(validarConfiguracao({ ...base, destinatarioRole: 'OPERACIONAL', titulo: 'Oi' }), null)
})

test('tarefa e pendencia exigem responsavel e titulo', () => {
  for (const acao of ['CRIAR_TAREFA', 'ABRIR_PENDENCIA'] as const) {
    const base = {
      acao, funilDestinoId: null, etapaDestinoId: null,
      destinatarioRole: null, destinatarioUserId: null, titulo: null, mensagem: null,
    }
    assert.ok(validarConfiguracao(base))
    assert.equal(validarConfiguracao({ ...base, destinatarioUserId: 'u1', titulo: 'X' }), null)
  }
})

test('interpolar troca as variaveis e marca o que falta', () => {
  assert.equal(
    interpolar('{{card}} chegou em {{etapa}}', { card: 'Cliente X', etapa: 'Kickoff' }),
    'Cliente X chegou em Kickoff',
  )
  assert.equal(interpolar('{{cliente}}', { cliente: null }), '—')
  assert.equal(interpolar('sem variavel', {}), 'sem variavel')
})
