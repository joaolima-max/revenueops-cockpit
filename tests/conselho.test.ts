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
 * ── A SEGUNDA CONDIÇÃO ───────────────────────────────────────────────────
 *
 * O Conselho passou a exigir DUAS coisas, ambas obrigatórias:
 *
 *   1. ser SÓCIO           — `User.isPartner`, um fato sobre a pessoa;
 *   2. ter `view_conselho`  — uma alçada que se concede e se revoga na tela
 *                             de Usuários, e que é RESTRITA (nem ADMIN a
 *                             ganha por atalho).
 *
 * É um E, não um OU — e é conferido num lugar só, `podeVerConselho`. A lição
 * do bug acima continua valendo: o perigo nunca foi haver duas condições, foi
 * checá-las em lugares diferentes, onde podiam discordar.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAccess, navigationFor, activeFeatures, exigeSocio } from '../lib/modules'
import {
  ehSocio, hasPermission, permissaoRestrita, ALL_PERMISSIONS,
} from '../lib/permissions'

/** O que o proxy sabe: só o token. Nunca `socio`. */
const PROXY = (role: string, permissoes: string[] | null) =>
  ({ role, permissoes }) as const

/* ========================================================================= *
 * JOÃO LIMA — sócio, com token antigo
 * ========================================================================= */

test('JOÃO LIMA: socio no banco, token SEM isPartner — o Conselho abre', () => {
  // O cenario exato do bug. O proxy nao decide, e a pagina (que le do banco)
  // e quem autoriza. A chave `view_conselho` vem na lista, como no banco.
  const p = PROXY('ADMIN', ['view_conselho', 'view_auditoria'])
  assert.equal(
    checkAccess('/dashboard/conselho', p.role, p.permissoes), 'allow',
    'o proxy voltou a barrar o socio por causa do token antigo',
  )
  assert.equal(checkAccess('/api/conselho', p.role, p.permissoes), 'allow')
})

test('JOÃO LIMA: o menu aparece quando o banco diz que ele e socio', () => {
  const itens = navigationFor('ADMIN', ['view_conselho', 'view_auditoria'], true)
    .flatMap((s) => s.items.map((i) => i.label))
  assert.ok(itens.includes('Conselho'))
})

test('JOÃO LIMA: a rota abre com socio confirmado E a chave', () => {
  const chaves = ['view_conselho', 'view_auditoria', 'manage_auditoria']
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', chaves, true), 'allow')
  assert.equal(checkAccess('/api/conselho', 'ADMIN', chaves, true), 'allow')
})

test('MANUEL: socio autorizado nesta rodada — entra', () => {
  // O estado real gravado no banco: ADMIN, sócio, com a chave na lista.
  const chaves = ['view_conselho', 'view_usuarios', 'manage_usuarios', 'view_auditoria']
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', chaves, true), 'allow')
  const itens = navigationFor('ADMIN', chaves, true).flatMap((s) => s.items.map((i) => i.label))
  assert.ok(itens.includes('Conselho'), 'o Conselho sumiu do menu do Manuel')
})

/* ========================================================================= *
 * AS DUAS CONDIÇÕES — uma só não basta
 * ========================================================================= */

test('SOCIO SEM A CHAVE nao entra', () => {
  // Ser dono da empresa nao e o mesmo que estar autorizado a abrir o painel.
  assert.equal(
    checkAccess('/dashboard/conselho', 'ADMIN', ['view_auditoria'], true), 'forbidden',
    'socio sem view_conselho entrou',
  )
  const itens = navigationFor('ADMIN', ['view_auditoria'], true)
    .flatMap((s) => s.items.map((i) => i.label))
  assert.ok(!itens.includes('Conselho'), 'o menu apareceu para socio sem a chave')
})

test('A CHAVE SEM SER SOCIO nao entra', () => {
  assert.equal(
    checkAccess('/dashboard/conselho', 'ADMIN', ['view_conselho'], false), 'forbidden',
    'quem tem a chave mas nao e socio entrou',
  )
  const itens = navigationFor('ADMIN', ['view_conselho'], false)
    .flatMap((s) => s.items.map((i) => i.label))
  assert.ok(!itens.includes('Conselho'), 'o menu apareceu para nao socio com a chave')
})

test('view_conselho e RESTRITA: ser ADMIN nao a concede', () => {
  // Sem lista nenhuma, um ADMIN tem todas as chaves comuns por atalho. As
  // restritas ficam de fora — inclusive esta.
  assert.equal(hasPermission(null, 'view_conselho', 'ADMIN'), false)
  assert.equal(hasPermission([], 'view_conselho', 'ADMIN'), false)
  assert.ok(permissaoRestrita('view_conselho'))
  // E com a chave gravada, abre.
  assert.equal(hasPermission(['view_conselho'], 'view_conselho', 'ADMIN'), true)
})

test('view_conselho aparece no CATALOGO da tela de Usuarios', () => {
  // Se nao estiver no catalogo, a caixa nao existe na UI e ninguem consegue
  // marcar a permissao — era exatamente o sintoma relatado.
  const p = ALL_PERMISSIONS.find((x) => x.key === 'view_conselho')
  assert.ok(p, 'view_conselho nao esta em ALL_PERMISSIONS')
  assert.equal(p!.label, 'Visualizar Conselho')
  assert.equal(p!.group, 'Governança')
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

test('NAO SOCIO: nem com o catalogo INTEIRO de permissoes', () => {
  // Nenhuma combinacao de chaves substitui a condicao de socio — nem a
  // propria `view_conselho`, nem todas as outras juntas.
  const todas = ALL_PERMISSIONS.map((p) => p.key)
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

test('undefined NAO decide — e por isso que o proxy nao barra o socio', () => {
  // Se `undefined` voltasse a barrar, o bug do token antigo voltaria inteiro.
  // Com a chave presente e `socio` desconhecido, passa — e a pagina decide.
  assert.equal(
    checkAccess('/dashboard/conselho', 'ADMIN', ['view_conselho'], undefined), 'allow',
  )
})

test('o Conselho declara OS DOIS eixos: socio E a chave', () => {
  const conselho = activeFeatures().find((f) => f.key === 'conselho')!
  assert.equal(conselho.socio, true, 'o Conselho perdeu a exigencia de socio')
  assert.equal(conselho.permissao, 'view_conselho', 'o Conselho perdeu a chave explicita')
})

test('undefined em socio nao decide, mas a CHAVE continua valendo no proxy', () => {
  // O proxy nao sabe quem e socio (nao consulta o banco), entao nao barra por
  // isso. Mas ele TEM as permissoes do token: quem nao tem a chave e barrado
  // ja no edge, sem chegar na pagina.
  assert.equal(
    checkAccess('/dashboard/conselho', 'ADMIN', ['view_conselho'], undefined), 'allow',
  )
  assert.equal(
    checkAccess('/dashboard/conselho', 'ADMIN', ['view_auditoria'], undefined), 'forbidden',
    'o proxy deixou passar quem nao tem a chave',
  )
})

test('ADMIN, Diretor e departamento Conselho NAO implicam socio', () => {
  // Tres formas de inferir, tres falsos positivos.
  assert.equal(ehSocio({ isPartner: false }), false)
  // O proprio contrato nao tem como expressar a inferencia.
  const naoSocio: { isPartner?: boolean } = {}
  assert.equal(ehSocio(naoSocio), false)
})
