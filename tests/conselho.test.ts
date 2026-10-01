/**
 * CONSELHO ADMINISTRATIVO — o acesso que estava quebrado.
 *
 * ── O BUG ────────────────────────────────────────────────────────────────
 *
 * `isPartner` entra no JWT só no login, e o JWT vive 7 dias. Quando o campo
 * passou a existir, o cookie de quem já estava logado não o tinha. O proxy
 * lia `session.isPartner`, encontrava `undefined`, tratava como "não é sócio"
 * e BARRAVA — enquanto a sidebar, que lê do banco num server component,
 * mostrava o menu. O sócio legítimo via o Conselho e o clique virava redirect.
 *
 * Token velho, para uma marca que nasce AUSENTE, é restritivo — não
 * permissivo. Foi esse o raciocínio errado.
 *
 * ── A CORREÇÃO ───────────────────────────────────────────────────────────
 *
 * `socio` passou a ser TRI-ESTADO no contexto de autorização:
 *
 *   true       → libera
 *   false      → barra      (resposta de quem consultou o banco)
 *   undefined  → NÃO DECIDE (quem não consultou não opina)
 *
 * O proxy não informa `socio`, então não decide. A autoridade é a página e a
 * API, que leem `User.isPartner` do banco a cada requisição. Mais seguro, não
 * menos: revogar passa a valer na hora.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAccess, navigationFor, activeFeatures, exigeSocio } from '../lib/modules'
import { ehSocio } from '../lib/permissions'

/** O que o proxy sabe: só o token. Nunca `socio`. */
const PROXY = (role: string, permissoes: string[] | null) =>
  ({ role, permissoes }) as const

/* ========================================================================= *
 * JOÃO LIMA — sócio, com token antigo
 * ========================================================================= */

test('JOÃO LIMA: socio no banco, token SEM isPartner — o Conselho abre', () => {
  // O cenario exato do bug. O proxy nao decide, e a pagina (que le do banco)
  // e quem autoriza.
  const p = PROXY('ADMIN', ['view_auditoria'])
  assert.equal(
    checkAccess('/dashboard/conselho', p.role, p.permissoes), 'allow',
    'o proxy voltou a barrar o socio por causa do token antigo',
  )
  assert.equal(checkAccess('/api/conselho', p.role, p.permissoes), 'allow')
})

test('JOÃO LIMA: o menu aparece quando o banco diz que ele e socio', () => {
  const itens = navigationFor('ADMIN', ['view_auditoria'], true)
    .flatMap((s) => s.items.map((i) => i.label))
  assert.ok(itens.includes('Conselho'))
})

test('JOÃO LIMA: a rota abre com socio confirmado', () => {
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', null, true), 'allow')
  assert.equal(checkAccess('/api/conselho', 'ADMIN', null, true), 'allow')
})

test('ehSocio reconhece a marca do banco', () => {
  assert.equal(ehSocio({ isPartner: true }), true)
})

/* ========================================================================= *
 * NÃO SÓCIO — barrado
 * ========================================================================= */

test('NAO SOCIO: o menu nao aparece', () => {
  for (const role of ['ADMIN', 'OPERACIONAL', 'COMERCIAL', 'GESTOR']) {
    const itens = navigationFor(role, ['view_auditoria'], false)
      .flatMap((s) => s.items.map((i) => i.label))
    assert.ok(!itens.includes('Conselho'), `Conselho apareceu para ${role} nao socio`)
  }
})

test('NAO SOCIO: rota e API barradas, mesmo sendo ADMIN', () => {
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', null, false), 'forbidden')
  assert.equal(checkAccess('/api/conselho', 'ADMIN', null, false), 'forbidden')
})

test('NAO SOCIO: nem com o catalogo inteiro de permissoes', () => {
  // Conselho nao e chave: nenhuma lista de permissoes o abre.
  const todas = ['view_auditoria', 'manage_auditoria', 'view_dashboard', 'view_financeiro']
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', todas, false), 'forbidden')
})

test('ehSocio recusa ausencia, nulo e objeto vazio', () => {
  assert.equal(ehSocio({ isPartner: false }), false)
  assert.equal(ehSocio(null), false)
  assert.equal(ehSocio(undefined), false)
  assert.equal(ehSocio({}), false)
})

/* ========================================================================= *
 * A CAMADA QUE DECIDE
 * ========================================================================= */

test('a obrigacao de conferir socio fica DECLARADA na rota', () => {
  // `exigeSocio` existe para que a obrigacao seja visivel do lado de quem
  // pode cumpri-la: a pagina e a API, que consultam o banco. Uma funcao
  // marcada `socio: true` sem `socio()` no handler seria rota aberta.
  assert.equal(exigeSocio('/dashboard/conselho'), true)
  assert.equal(exigeSocio('/api/conselho'), true)
  assert.equal(exigeSocio('/dashboard'), false)
  assert.equal(exigeSocio('/dashboard/financeiro'), false)
})

test('undefined NAO decide — e por isso que o proxy nao barra', () => {
  // Se `undefined` voltasse a barrar, o bug voltaria inteiro.
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', null, undefined), 'allow')
})

test('o Conselho declara `socio`, nunca uma chave de permissao', () => {
  const conselho = activeFeatures().find((f) => f.key === 'conselho')!
  assert.equal(conselho.socio, true)
  assert.equal(conselho.permissao, undefined,
    'duas fontes de verdade sobre o mesmo acesso foi o que quebrou antes')
})

test('ADMIN, Diretor e departamento Conselho NAO implicam socio', () => {
  // Tres formas de inferir, tres falsos positivos.
  assert.equal(ehSocio({ isPartner: false }), false)
  // O proprio contrato nao tem como expressar a inferencia.
  const naoSocio: { isPartner?: boolean } = {}
  assert.equal(ehSocio(naoSocio), false)
})
