/**
 * GOVERNANÇA — Conselho e Auditoria.
 *
 * A regra que estes testes protegem: o acesso ao Conselho e à Auditoria NÃO
 * acompanha o cargo. Ser ADMIN é poder operar o sistema, não ser sócio nem
 * auditor. A chave tem de estar gravada no usuário, uma a uma.
 *
 * Isso é fácil de perder: `hasPermission` tinha um atalho de ADMIN que
 * devolvia `true` para qualquer chave, e `DEFAULT_PERMISSIONS.ADMIN` era o
 * catálogo inteiro. Qualquer um dos dois, sozinho, reabre o acesso.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasPermission, permissaoRestrita, PERMISSOES_RESTRITAS,
  ALL_PERMISSIONS, DEFAULT_PERMISSIONS,
  perfilDe, roleDoPerfil, DEPARTAMENTOS, HIERARQUIAS,
  DEPARTAMENTO_LABEL, HIERARQUIA_LABEL, PERFIL_LABEL,
  DEPARTAMENTO_DA_ORIGEM,
} from '../lib/permissions'
import { navigationFor, checkAccess, activeFeatures } from '../lib/modules'

const PERFIS_TECNICOS = ['ADMIN', 'OPERACIONAL', 'COMERCIAL', 'GESTOR']

/* ========================================================================= *
 * AS CHAVES RESTRITAS
 * ========================================================================= */

test('Conselho e Auditoria sao chaves restritas', () => {
  assert.ok(permissaoRestrita('view_conselho'))
  assert.ok(permissaoRestrita('view_auditoria'))
  assert.ok(permissaoRestrita('manage_auditoria'))
  assert.ok(!permissaoRestrita('view_dashboard'))
})

test('SER ADMIN NAO LIBERA chave restrita', () => {
  for (const chave of PERMISSOES_RESTRITAS) {
    assert.equal(
      hasPermission(null, chave, 'ADMIN'), false,
      `o atalho de ADMIN voltou e liberou ${chave}`,
    )
  }
})

test('nenhum perfil tecnico libera chave restrita por default', () => {
  for (const role of PERFIS_TECNICOS) {
    for (const chave of PERMISSOES_RESTRITAS) {
      assert.equal(hasPermission(null, chave, role), false, `${role} liberou ${chave}`)
      assert.equal(hasPermission([], chave, role), false, `${role} liberou ${chave} com lista vazia`)
    }
  }
})

test('a chave restrita vale quando esta GRAVADA no usuario', () => {
  assert.equal(hasPermission(['view_conselho'], 'view_conselho', 'COMERCIAL'), true)
  // E vale pela chave, nao pelo cargo: um colaborador autorizado entra.
  assert.equal(hasPermission(['view_auditoria'], 'view_auditoria', 'OPERACIONAL'), true)
})

test('uma chave restrita nao abre a outra', () => {
  assert.equal(hasPermission(['view_conselho'], 'view_auditoria', 'ADMIN'), false)
  assert.equal(hasPermission(['view_auditoria'], 'view_conselho', 'ADMIN'), false)
})

test('as restritas estao FORA de todos os defaults', () => {
  // Um default as devolveria pela porta de trás no primeiro usuário sem lista.
  for (const [role, chaves] of Object.entries(DEFAULT_PERMISSIONS)) {
    for (const chave of PERMISSOES_RESTRITAS) {
      assert.ok(!chaves.includes(chave), `${role} recebe ${chave} por default`)
    }
  }
})

test('as restritas estao no CATALOGO — e preciso poder conceder', () => {
  const catalogo = ALL_PERMISSIONS.map((p) => p.key)
  for (const chave of PERMISSOES_RESTRITAS) {
    assert.ok(catalogo.includes(chave), `${chave} nao aparece na tela de Usuarios`)
  }
})

/* ========================================================================= *
 * NAVEGAÇÃO E ROTA
 * ========================================================================= */

test('sem a chave, Conselho e Auditoria NAO aparecem no menu — nem para ADMIN', () => {
  for (const role of PERFIS_TECNICOS) {
    const itens = navigationFor(role, null).flatMap((s) => s.items.map((i) => i.label))
    assert.ok(!itens.includes('Conselho'), `Conselho apareceu para ${role}`)
    assert.ok(!itens.includes('Auditoria'), `Auditoria apareceu para ${role}`)
  }
})

test('com a chave, o menu aparece', () => {
  const itens = navigationFor('ADMIN', ['view_conselho', 'view_auditoria'])
    .flatMap((s) => s.items.map((i) => i.label))
  assert.ok(itens.includes('Conselho'))
  assert.ok(itens.includes('Auditoria'))
})

test('a chave de um nao traz o menu do outro', () => {
  const itens = navigationFor('ADMIN', ['view_conselho'])
    .flatMap((s) => s.items.map((i) => i.label))
  assert.ok(itens.includes('Conselho'))
  assert.ok(!itens.includes('Auditoria'))
})

test('URL DIRETA bloqueada sem a chave, inclusive para ADMIN', () => {
  for (const rota of ['/dashboard/conselho', '/dashboard/auditoria']) {
    assert.equal(checkAccess(rota, 'ADMIN', null), 'forbidden', `${rota} abriu sem a chave`)
    assert.equal(checkAccess(rota, 'ADMIN', []), 'forbidden')
  }
})

test('API bloqueada sem a chave', () => {
  assert.equal(checkAccess('/api/auditoria', 'ADMIN', null), 'forbidden')
  assert.equal(checkAccess('/api/conselho', 'ADMIN', null), 'forbidden')
})

test('com a chave, a rota e a API abrem', () => {
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', ['view_conselho']), 'allow')
  assert.equal(checkAccess('/api/auditoria', 'ADMIN', ['view_auditoria']), 'allow')
})

test('a Auditoria continua exigindo ADMIN, ALEM da chave', () => {
  // O modulo ADMIN tem `roles: ['ADMIN']`. A chave nao substitui o perfil:
  // os dois filtros valem.
  assert.equal(checkAccess('/dashboard/auditoria', 'COMERCIAL', ['view_auditoria']), 'forbidden')
})

test('as duas funcoes declaram a chave que as governa', () => {
  const conselho = activeFeatures().find((f) => f.key === 'conselho')!
  const auditoria = activeFeatures().find((f) => f.key === 'admin.auditoria')!
  assert.equal(conselho.permissao, 'view_conselho')
  assert.equal(auditoria.permissao, 'view_auditoria')
})

/* ========================================================================= *
 * PERFIL · DEPARTAMENTO · HIERARQUIA
 * ========================================================================= */

test('perfil e DERIVADO da role — dois na tela, quatro no banco', () => {
  assert.equal(perfilDe('ADMIN'), 'ADMIN')
  for (const r of ['OPERACIONAL', 'COMERCIAL', 'GESTOR']) {
    assert.equal(perfilDe(r), 'COLABORADOR', `${r} deveria ser Colaborador`)
  }
})

test('rebaixar a Colaborador PRESERVA a role tecnica atual', () => {
  // Existem tres roles nao-admin, e regravar ao acaso trocaria as alcadas de
  // funil da pessoa. Cada salvamento da tela faria isso.
  assert.equal(roleDoPerfil('COLABORADOR', 'COMERCIAL', 'GESTOR'), 'GESTOR')
  assert.equal(roleDoPerfil('COLABORADOR', null, 'OPERACIONAL'), 'OPERACIONAL')
})

test('promover a Admin e inequivoco', () => {
  assert.equal(roleDoPerfil('ADMIN', null, 'COMERCIAL'), 'ADMIN')
  assert.equal(roleDoPerfil('ADMIN', 'FINANCEIRO', 'GESTOR'), 'ADMIN')
})

test('rebaixar um ADMIN usa o departamento — a unica pista disponivel', () => {
  assert.equal(roleDoPerfil('COLABORADOR', 'COMERCIAL', 'ADMIN'), 'COMERCIAL')
  assert.equal(roleDoPerfil('COLABORADOR', 'OPERACOES', 'ADMIN'), 'OPERACIONAL')
  assert.equal(roleDoPerfil('COLABORADOR', null, 'ADMIN'), 'OPERACIONAL')
})

test('os cinco departamentos e as duas hierarquias da especificacao', () => {
  assert.deepEqual(
    [...DEPARTAMENTOS],
    ['FINANCEIRO', 'COMERCIAL', 'COMPLIANCE', 'OPERACOES', 'CONSELHO'],
  )
  assert.deepEqual([...HIERARQUIAS], ['DIRETOR', 'OPERADOR'])
})

test('todo departamento e hierarquia tem rotulo — nunca o enum cru na tela', () => {
  for (const d of DEPARTAMENTOS) assert.ok(DEPARTAMENTO_LABEL[d])
  for (const h of HIERARQUIAS) assert.ok(HIERARQUIA_LABEL[h])
  assert.equal(PERFIL_LABEL.ADMIN, 'Admin')
  assert.equal(PERFIL_LABEL.COLABORADOR, 'Colaborador')
})

test('os avisos financeiros vao para o FINANCEIRO', () => {
  assert.equal(DEPARTAMENTO_DA_ORIGEM.CONTA_PAGAR, 'FINANCEIRO')
  assert.equal(DEPARTAMENTO_DA_ORIGEM.CONTA_RECEBER, 'FINANCEIRO')
  assert.equal(DEPARTAMENTO_DA_ORIGEM.LANCAMENTO_DIARIO, 'FINANCEIRO')
  assert.equal(DEPARTAMENTO_DA_ORIGEM.COMPLIANCE, 'COMPLIANCE')
})

test('a HIERARQUIA nao concede acesso a nada', () => {
  // Ser Diretor nao e ser socio. O acesso restrito e sempre pela chave.
  for (const chave of PERMISSOES_RESTRITAS) {
    assert.equal(hasPermission(null, chave, 'ADMIN'), false)
  }
})
