/**
 * REMOÇÕES DA RODADA — o que saiu do produto tem que continuar fora.
 *
 * Estes testes existem para um tipo específico de regressão: o ambiente volta
 * por um caminho lateral. Um item reaparecendo na sidebar, uma rota que volta
 * a responder, uma chave de permissão órfã sobrevivendo num perfil. Nenhum
 * deles apareceria como erro de tipo ou de build.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MODULES, activeFeatures, navigationFor, checkAccess, isFeatureEnabled,
} from '../lib/modules'
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, hasPermission } from '../lib/permissions'

const PERFIS = ['ADMIN', 'GESTOR', 'OPERACIONAL', 'COMERCIAL'] as const

/** Rotas de página dos seis ambientes retirados. */
const ROTAS_REMOVIDAS = [
  '/dashboard/relatorios',
  '/dashboard/documentos',
  '/dashboard/alertas',
  '/dashboard/parametros',
  '/dashboard/formularios',
  '/dashboard/automacoes',
]

/** APIs que existiam exclusivamente para eles. */
const APIS_REMOVIDAS = [
  '/api/relatorios',
  '/api/documentos',
  '/api/formularios',
  '/api/automacoes',
  '/api/parametros',
  '/api/float-config',
]

const CHAVES_REMOVIDAS = [
  'view_relatorios',
  'view_documents', 'download_documents', 'manage_documents',
  'view_forms', 'manage_forms',
  'view_alertas', 'manage_parametros', 'manage_automations',
]

/* ── Navegação ───────────────────────────────────────────────────────────── */

test('nenhum ambiente removido aparece na sidebar de nenhum perfil', () => {
  const rotulos = ['Relatórios', 'Documentos', 'Alertas', 'Parâmetros', 'Formulários', 'Automações']
  for (const perfil of PERFIS) {
    const itens = navigationFor(perfil).flatMap((s) => s.items.map((i) => i.label))
    for (const rotulo of rotulos) {
      assert.ok(!itens.includes(rotulo), `${rotulo} apareceu na sidebar de ${perfil}`)
    }
  }
})

test('nenhuma função ativa aponta para uma rota removida', () => {
  const rotas = activeFeatures().map((f) => f.route)
  for (const removida of ROTAS_REMOVIDAS) {
    assert.ok(!rotas.includes(removida), `${removida} ainda está registrada`)
  }
})

test('nenhuma função ativa reivindica uma API removida', () => {
  const apis = activeFeatures().flatMap((f) => f.api ?? [])
  for (const removida of APIS_REMOVIDAS) {
    assert.ok(!apis.includes(removida), `${removida} ainda está registrada`)
  }
})

test('as chaves de função dos ambientes removidos não existem mais', () => {
  for (const chave of [
    'receita.relatorios', 'carteira.documentos', 'carteira.alertas',
    'admin.parametros', 'comercial.formularios', 'admin.automacoes',
  ]) {
    assert.ok(!isFeatureEnabled(chave), `${chave} continua ligada`)
  }
})

/* ── Preservados ─────────────────────────────────────────────────────────── */

test('Notificações permanece — é ambiente diferente de Alertas', () => {
  // Não está em MODULES por ser ALWAYS_ON (cada um vê as suas), então o que
  // se verifica é que a rota continua liberada.
  assert.equal(checkAccess('/dashboard/notificacoes', 'COMERCIAL'), 'allow')
  assert.equal(checkAccess('/api/notificacoes', 'COMERCIAL'), 'allow')
})

test('os ambientes que ficam continuam registrados', () => {
  for (const chave of [
    'cockpit', 'conselho', 'receita.forecast', 'receita.metas',
    'carteira.clientes', 'carteira.volumetria', 'carteira.certificados',
    'operacoes.compliance', 'comercial.pipeline', 'comercial.funis',
    'comercial.leads', 'comercial.followup', 'comercial.crm',
    'financeiro.visao', 'financeiro.lancamentos', 'financeiro.contas',
    'financeiro.pagar', 'financeiro.condicoes',
  ]) {
    assert.ok(isFeatureEnabled(chave), `${chave} deveria continuar ligada`)
  }
})

/* ── Funil ≠ Pipeline ────────────────────────────────────────────────────── */

test('Funil e Pipeline são funções distintas, em rotas irmãs', () => {
  const todas = activeFeatures()
  const pipeline = todas.find((f) => f.key === 'comercial.pipeline')!
  const funis = todas.find((f) => f.key === 'comercial.funis')!

  assert.equal(pipeline.route, '/dashboard/pipeline')
  assert.equal(funis.route, '/dashboard/funis')

  // O bug: a rota de Funis era subcaminho da de Pipeline, então casava com as
  // duas por prefixo. Agora nenhuma é prefixo da outra.
  assert.ok(!funis.route.startsWith(pipeline.route + '/'))
  assert.ok(!pipeline.route.startsWith(funis.route + '/'))
})

test('abrir Funis não resolve como Pipeline, e vice-versa', () => {
  const daRota = (rota: string) =>
    activeFeatures().filter((f) =>
      f.exact ? rota === f.route : rota === f.route || rota.startsWith(f.route + '/'),
    ).map((f) => f.key)

  assert.deepEqual(daRota('/dashboard/funis'), ['comercial.funis'])
  assert.deepEqual(daRota('/dashboard/pipeline'), ['comercial.pipeline'])
})

test('Funis é só de ADMIN; Pipeline não é', () => {
  assert.equal(checkAccess('/dashboard/funis', 'ADMIN'), 'allow')
  assert.equal(checkAccess('/dashboard/funis', 'COMERCIAL'), 'forbidden')
  assert.equal(checkAccess('/dashboard/pipeline', 'COMERCIAL'), 'allow')
})

/* ── Financeiro ──────────────────────────────────────────────────────────── */

test('o Financeiro tem exatamente os sete menus da especificação, nessa ordem', () => {
  const financeiro = MODULES.find((m) => m.key === 'financeiro')!
  assert.deepEqual(
    financeiro.features.filter((f) => f.enabled).map((f) => f.label),
    [
      'Visão Geral', 'Lançamentos', 'Contas a Receber', 'Contas a Pagar',
      'Categorias', 'Fornecedores', 'Condições Comerciais BaaS',
    ],
  )
})

test('Contas a Pagar e Contas a Receber são menus e rotas distintos', () => {
  // Leem bases diferentes (despesa × ContaReceber) e não podem casar por
  // prefixo um com o outro, como Pipeline e Funis já casavam.
  const pagar = activeFeatures().find((f) => f.key === 'financeiro.pagar')!
  const receber = activeFeatures().find((f) => f.key === 'financeiro.contas')!
  assert.equal(pagar.route, '/dashboard/financeiro/contas-pagar')
  assert.equal(receber.route, '/dashboard/financeiro/contas-receber')
  assert.ok(!pagar.route.startsWith(receber.route + '/'))
  assert.ok(!receber.route.startsWith(pagar.route + '/'))
})

test('a Visão Geral não engole os menus abaixo dela', () => {
  // Mora na raiz do ambiente: sem `exact`, casaria por prefixo com todos.
  const visao = activeFeatures().find((f) => f.key === 'financeiro.visao')!
  assert.equal(visao.exact, true)

  const daRota = (rota: string) =>
    activeFeatures().filter((f) =>
      f.exact ? rota === f.route : rota === f.route || rota.startsWith(f.route + '/'),
    ).map((f) => f.key)

  assert.deepEqual(daRota('/dashboard/financeiro'), ['financeiro.visao'])
  assert.deepEqual(daRota('/dashboard/financeiro/lancamentos'), ['financeiro.lancamentos'])
  assert.deepEqual(daRota('/dashboard/financeiro/condicoes-baas'), ['financeiro.condicoes'])
})

test('cada menu financeiro tem um prefixo de API só seu', () => {
  const apis = activeFeatures()
    .filter((f) => f.moduleKey === 'financeiro')
    .flatMap((f) => f.api ?? [])
  assert.equal(new Set(apis).size, apis.length, 'há prefixo de API repetido no Financeiro')
  // Nenhum pode ser prefixo de outro, senão volta o problema do casamento.
  for (const a of apis) {
    for (const b of apis) {
      if (a !== b) assert.ok(!b.startsWith(a + '/'), `${a} engole ${b}`)
    }
  }
})

/* ── Permissões ──────────────────────────────────────────────────────────── */

test('as chaves exclusivas dos ambientes removidos saíram do catálogo', () => {
  const chaves = ALL_PERMISSIONS.map((p) => p.key)
  for (const removida of CHAVES_REMOVIDAS) {
    assert.ok(!chaves.includes(removida), `${removida} ainda está no catálogo`)
  }
})

test('nenhum perfil padrão referencia chave que não existe mais', () => {
  const validas = new Set(ALL_PERMISSIONS.map((p) => p.key))
  for (const [perfil, chaves] of Object.entries(DEFAULT_PERMISSIONS)) {
    for (const chave of chaves) {
      assert.ok(validas.has(chave), `${perfil} referencia chave órfã: ${chave}`)
    }
  }
})

test('as permissões dos módulos preservados continuam no catálogo', () => {
  const chaves = ALL_PERMISSIONS.map((p) => p.key)
  for (const mantida of [
    'view_crm', 'view_pipeline', 'manage_pipeline', 'admin_funis',
    'view_carteira', 'manage_carteira',
    'view_compliance', 'manage_compliance',
    'view_certificates', 'manage_certificates',
    'view_financeiro', 'manage_financeiro',
    'view_metas', 'manage_metas',
  ]) {
    assert.ok(chaves.includes(mantida), `${mantida} sumiu do catálogo`)
  }
})

test('quem perdeu a permissão de documentos não a recupera por padrão', () => {
  for (const perfil of PERFIS) {
    if (perfil === 'ADMIN') continue // ADMIN passa por tudo, por definição.
    assert.equal(hasPermission(null, 'view_documents', perfil), false)
    assert.equal(hasPermission(null, 'manage_automations', perfil), false)
  }
})

test('ADMIN recebe o catálogo inteiro, sem sobra nem falta', () => {
  assert.deepEqual(DEFAULT_PERMISSIONS.ADMIN, ALL_PERMISSIONS.map((p) => p.key))
})
