/**
 * Regras do pipeline multi-funil. Funcoes puras, sem banco: as consultas ficam
 * em lib/pipeline-db.ts e a decisao mora em lib/pipeline.ts.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resolverAcesso, podeAdministrarPipeline, reordenar, validarReordenacao,
  validarTransferencia, validarMovimento, validarInativacaoEtapa, validarLinhaPermissao,
  type LinhaPermissao,
} from '../lib/pipeline'

const admin = { userId: 'u-adm', role: 'ADMIN' }
const comercial = { userId: 'u-com', role: 'COMERCIAL' }
const operacional = { userId: 'u-ope', role: 'OPERACIONAL' }

const regra = (p: Partial<LinhaPermissao>): LinhaPermissao => ({
  role: null, userId: null,
  ver: false, editar: false, mover: false, criar: false,
  transferir: false, administrar: false, apenasProprios: false,
  ...p,
})

/** O seed da migration v11, transcrito. */
const REGRAS_VENDAS = [regra({
  role: 'COMERCIAL', ver: true, editar: true, mover: true, criar: true,
  transferir: true, apenasProprios: true,
})]
const REGRAS_ONBOARDING = [regra({
  role: 'OPERACIONAL', ver: true, editar: true, mover: true, criar: true, transferir: true,
})]

// ------------------------------------------------------------------ Alcada

test('ADMIN tem acesso total a qualquer funil, com ou sem regras', () => {
  assert.deepEqual(resolverAcesso(admin, []), {
    ver: true, editar: true, mover: true, criar: true,
    transferir: true, administrar: true, apenasProprios: false,
  })
  assert.equal(resolverAcesso(admin, REGRAS_ONBOARDING).administrar, true)
})

test('funil SEM regra herda o modulo: view_pipeline ve, manage_pipeline opera', () => {
  // COMERCIAL tem as duas chaves por padrao em lib/permissions.ts.
  const a = resolverAcesso(comercial, [])
  assert.equal(a.ver, true)
  assert.equal(a.mover, true)
  assert.equal(a.administrar, false, 'administrar nunca vem de heranca')
})

test('funil SEM regra fica invisivel para quem nao tem view_pipeline', () => {
  // OPERACIONAL nao tem view_pipeline nos defaults.
  assert.equal(resolverAcesso(operacional, []).ver, false)
})

test('funil COM regras nega quem nenhuma regra alcanca', () => {
  assert.deepEqual(resolverAcesso(operacional, REGRAS_VENDAS), {
    ver: false, editar: false, mover: false, criar: false,
    transferir: false, administrar: false, apenasProprios: false,
  })
})

test('a regra especifica manda, mesmo sem a chave global do modulo', () => {
  // O OPERACIONAL nao tem view_pipeline, mas o Onboarding tem regra para ele.
  // Sem isto, configurar alcada por funil nao serviria para nada.
  const a = resolverAcesso(operacional, REGRAS_ONBOARDING)
  assert.equal(a.ver, true)
  assert.equal(a.transferir, true)
  assert.equal(a.administrar, false)
})

test('COMERCIAL no Vendas so enxerga os proprios cards', () => {
  assert.equal(resolverAcesso(comercial, REGRAS_VENDAS).apenasProprios, true)
})

test('concessao nominal mais ampla levanta o apenasProprios da role', () => {
  const linhas = [...REGRAS_VENDAS, regra({ userId: comercial.userId, ver: true, mover: true })]
  const a = resolverAcesso(comercial, linhas)
  assert.equal(a.apenasProprios, false)
  assert.equal(a.criar, true, 'as regras que casam se somam')
})

test('regra de outro usuario nao vaza', () => {
  const linhas = [regra({ userId: 'outra-pessoa', ver: true, mover: true })]
  assert.equal(resolverAcesso(comercial, linhas).ver, false)
})

test('administrar exige a regra E o portao global admin_funis', () => {
  const linhas = [regra({ role: 'COMERCIAL', ver: true, administrar: true })]
  assert.equal(resolverAcesso(comercial, linhas).administrar, false, 'sem admin_funis, nao administra')

  const comChave = { ...comercial, permissoes: ['view_pipeline', 'admin_funis'] }
  assert.equal(resolverAcesso(comChave, linhas).administrar, true)
})

test('podeAdministrarPipeline: ADMIN sempre, os demais so com admin_funis', () => {
  assert.ok(podeAdministrarPipeline(admin))
  assert.ok(!podeAdministrarPipeline(comercial))
  assert.ok(podeAdministrarPipeline({ ...comercial, permissoes: ['admin_funis'] }))
})

// -------------------------------------------------------------- Ordenacao

test('reordenar renumera de 1 a n na ordem recebida', () => {
  assert.deepEqual(reordenar(['c', 'a', 'b']), [
    { id: 'c', ordem: 1 }, { id: 'a', ordem: 2 }, { id: 'b', ordem: 3 },
  ])
})

test('validarReordenacao exige exatamente o conjunto atual', () => {
  const atuais = ['a', 'b', 'c']
  assert.equal(validarReordenacao(atuais, ['c', 'b', 'a']), null)
  assert.match(validarReordenacao(atuais, ['a', 'b'])!, /todas as etapas/)
  assert.match(validarReordenacao(atuais, ['a', 'a', 'b'])!, /repetidos/)
  assert.match(validarReordenacao(atuais, ['a', 'b', 'z'])!, /não pertence/)
})

// ---------------------------------------------------------- Transferencia

const onboarding = { id: 'fnl_onb', nome: 'Onboarding', ativo: true, exigeCliente: true }
const kickoff = { id: 'etp_kickoff', funilId: 'fnl_onb', ativo: true }

const pedido = (over = {}) => ({
  funilOrigemId: 'fnl_vendas',
  destino: onboarding,
  etapa: kickoff,
  clienteAtualId: null,
  clienteInformadoId: 'cli-1',
  ...over,
})

test('Vendas → Onboarding/Kickoff com cliente e valido', () => {
  assert.equal(validarTransferencia(pedido()), null)
})

test('transferencia recusa funil inativo, etapa de outro funil e etapa inativa', () => {
  assert.match(validarTransferencia(pedido({ destino: { ...onboarding, ativo: false } }))!, /inativo/)
  assert.match(validarTransferencia(pedido({ etapa: { ...kickoff, funilId: 'fnl_outro' } }))!, /não pertence/)
  assert.match(validarTransferencia(pedido({ etapa: { ...kickoff, ativo: false } }))!, /inativa/)
})

test('transferir para o proprio funil e mover, nao transferir', () => {
  assert.match(validarTransferencia(pedido({ funilOrigemId: 'fnl_onb' }))!, /já está neste funil/)
})

test('funil que exige cliente recusa transferencia sem cliente', () => {
  assert.match(
    validarTransferencia(pedido({ clienteInformadoId: null, clienteAtualId: null }))!,
    /exige um cliente/,
  )
})

test('cliente ja vinculado ao card satisfaz a exigencia — Onboarding → Operacoes', () => {
  const operacoes = { id: 'fnl_ope', nome: 'Operações', ativo: true, exigeCliente: true }
  assert.equal(validarTransferencia({
    funilOrigemId: 'fnl_onb',
    destino: operacoes,
    etapa: { id: 'etp_ativacao', funilId: 'fnl_ope', ativo: true },
    clienteAtualId: 'cli-1',
    clienteInformadoId: null,
  }), null)
})

// -------------------------------------------------------------- Movimento

test('mover exige etapa ativa do mesmo funil', () => {
  assert.equal(validarMovimento('f1', { id: 'e2', funilId: 'f1', ativo: true }), null)
  assert.match(validarMovimento('f1', { id: 'e2', funilId: 'f1', ativo: false })!, /inativa/)
  assert.match(validarMovimento('f1', { id: 'e2', funilId: 'f2', ativo: true })!, /outro funil/)
  assert.equal(validarMovimento(null, { id: 'e2', funilId: 'f1', ativo: true }), null,
    'card sem funil, de antes do backfill, ainda pode ser colocado numa etapa')
})

// ------------------------------------------------------- Inativar / regras

test('inativar etapa com cards exige destino para eles', () => {
  assert.equal(validarInativacaoEtapa(0, null), null)
  assert.equal(validarInativacaoEtapa(3, 'etp-destino'), null)
  assert.match(validarInativacaoEtapa(3, null)!, /3 cards/)
  assert.match(validarInativacaoEtapa(1, null)!, /1 card\b/)
})

test('uma regra vale para uma role OU um usuario, nunca ambos nem nenhum', () => {
  assert.equal(validarLinhaPermissao({ role: 'COMERCIAL', userId: null }), null)
  assert.equal(validarLinhaPermissao({ role: null, userId: 'u1' }), null)
  assert.ok(validarLinhaPermissao({ role: 'COMERCIAL', userId: 'u1' }))
  assert.ok(validarLinhaPermissao({ role: null, userId: null }))
})
