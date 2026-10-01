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
  firstAvailableRoute,
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

/* ── Navegação: Funis dentro do Pipeline ─────────────────────────────────── */

test('Funis NÃO é um item de menu — virou área interna do Pipeline', () => {
  for (const perfil of PERFIS) {
    const itens = navigationFor(perfil).flatMap((s) => s.items.map((i) => i.label))
    assert.ok(!itens.includes('Funis'), `Funis apareceu na sidebar de ${perfil}`)
  }
})

test('Funis continua REGISTRADO — é o registro que mantém a restrição', () => {
  // Apagar a entrada em vez de ocultá-la liberaria /api/pipeline/funis para
  // qualquer autenticado: caminho não registrado é caminho permitido.
  const funis = activeFeatures().find((f) => f.key === 'comercial.funis')!
  assert.ok(funis, 'a função some do registro e leva a restrição junto')
  assert.equal(funis.oculto, true)
  assert.equal(funis.route, '/dashboard/pipeline/funis')
  assert.deepEqual(funis.roles, ['ADMIN'])
})

test('a administração de funis continua só de ADMIN, mesmo sob o Pipeline', () => {
  // A rota casa com DUAS funções (Pipeline por prefixo, Funis exata). Se a
  // permissão aberta do Pipeline vencesse, qualquer comercial administraria
  // funil.
  assert.equal(checkAccess('/dashboard/pipeline/funis', 'ADMIN'), 'allow')
  assert.equal(checkAccess('/dashboard/pipeline/funis', 'COMERCIAL'), 'forbidden')
  assert.equal(checkAccess('/api/pipeline/funis', 'COMERCIAL'), 'forbidden')
  assert.equal(checkAccess('/api/pipeline/etapas', 'GESTOR'), 'forbidden')
})

test('o quadro do Pipeline continua aberto a quem não é ADMIN', () => {
  assert.equal(checkAccess('/dashboard/pipeline', 'COMERCIAL'), 'allow')
  assert.equal(checkAccess('/api/pipeline/board', 'COMERCIAL'), 'allow')
})

test('o fallback nunca manda o usuário para uma área interna', () => {
  for (const perfil of PERFIS) {
    const destino = firstAvailableRoute(perfil)
    assert.notEqual(destino, '/dashboard/pipeline/funis', `${perfil} cairia numa tela sem menu`)
  }
})

/* ── Navegação: Comercial e Operações ────────────────────────────────────── */

test('"Visão geral" abre o Comercial, antes do Pipeline', () => {
  const comercial = navigationFor('ADMIN').find((s) => s.key === 'comercial')!
  const rotulos = comercial.items.map((i) => i.label)
  assert.equal(rotulos[0], 'Visão geral')
  assert.ok(rotulos.indexOf('Visão geral') < rotulos.indexOf('Pipeline'))
})

test('"CRM" não aparece em navegação nenhuma', () => {
  for (const perfil of PERFIS) {
    const itens = navigationFor(perfil).flatMap((s) => s.items.map((i) => i.label))
    assert.ok(!itens.includes('CRM'), `CRM apareceu na sidebar de ${perfil}`)
  }
})

test('"Métricas Op." não é mais um menu — foi para dentro de Incidentes', () => {
  for (const perfil of PERFIS) {
    const itens = navigationFor(perfil).flatMap((s) => s.items.map((i) => i.label))
    assert.ok(!itens.some((r) => r.startsWith('Métricas')), `Métricas apareceu em ${perfil}`)
  }
  assert.ok(!isFeatureEnabled('operacoes.metricas'))
  assert.ok(isFeatureEnabled('operacoes.incidentes'), 'Incidentes continua')
})

test('a rota antiga de métricas operacionais não é mais oferecida', () => {
  const rotas = activeFeatures().map((f) => f.route)
  assert.ok(!rotas.includes('/dashboard/metricas-op'))
})

/* ── Financeiro ──────────────────────────────────────────────────────────── */

test('o Financeiro tem exatamente os sete menus da especificação, nessa ordem', () => {
  const financeiro = MODULES.find((m) => m.key === 'financeiro')!
  assert.deepEqual(
    financeiro.features.filter((f) => f.enabled).map((f) => f.label),
    [
      'Visão Geral', 'Lançamentos', 'Contas a Receber', 'Contas a Pagar',
      'Categorias', 'Fornecedores', 'Condições BaaS',
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

test('o menu chama-se "Condições BaaS", nao "Condições Comerciais BaaS"', () => {
  // O rotulo oficial encurtou. Este teste existe porque o nome antigo estava
  // espalhado por seis arquivos e volta facil num copiar-e-colar.
  const rotulos = activeFeatures().map((f) => f.label)
  assert.ok(rotulos.includes('Condições BaaS'))
  assert.ok(!rotulos.some((r) => r.includes('Condições Comerciais')))
})

/* ── Contas a Receber e Categorias ───────────────────────────────────────── */

test('Contas a Receber e Contas a Pagar continuam menus distintos', () => {
  const rotulos = navigationFor('ADMIN')
    .find((s) => s.key === 'financeiro')!.items.map((i) => i.label)
  assert.ok(rotulos.includes('Contas a Receber'))
  assert.ok(rotulos.includes('Contas a Pagar'))
})

test('o Financeiro mantém exatamente sete menus depois da reorganização', () => {
  const rotulos = navigationFor('ADMIN')
    .find((s) => s.key === 'financeiro')!.items.map((i) => i.label)
  assert.equal(rotulos.length, 7)
})

/* ── Permissões: nenhuma chave aponta para o vazio ───────────────────────── */

test('todo perfil padrão só concede chaves que existem no catálogo', () => {
  // A regressão real: ao remover uma tela, a chave some de ALL_PERMISSIONS mas
  // continua nos perfis padrão. O usuário nasce com uma permissão que o
  // administrador não consegue ver nem revogar na tela de Usuários.
  const catalogo = new Set(ALL_PERMISSIONS.map((p) => p.key))
  for (const [perfil, chaves] of Object.entries(DEFAULT_PERMISSIONS)) {
    for (const k of chaves) {
      assert.ok(catalogo.has(k), `${perfil} concede "${k}", que não está no catálogo`)
    }
  }
})

test('a permissão da tela de Métricas Operacionais saiu junto com a tela', () => {
  assert.ok(!ALL_PERMISSIONS.some((p) => p.key === 'view_metricas_op'))
  for (const chaves of Object.values(DEFAULT_PERMISSIONS)) {
    assert.ok(!chaves.includes('view_metricas_op'))
  }
})

test('a chave view_crm sobreviveu à renomeação da tela', () => {
  // Só o rótulo mudou. Trocar a chave invalidaria a permissão já gravada em
  // cada usuário, e todo mundo perderia o acesso de uma vez.
  const crm = ALL_PERMISSIONS.find((p) => p.key === 'view_crm')
  assert.ok(crm, 'a chave gravada nos usuários não pode sumir')
  assert.ok(!crm!.label.includes('CRM'), `rótulo ainda diz CRM: "${crm!.label}"`)
})
