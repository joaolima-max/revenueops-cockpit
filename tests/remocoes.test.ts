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
import fs from 'node:fs'
import { test } from 'node:test'
import {
  MODULES, activeFeatures, navigationFor, checkAccess, isFeatureEnabled,
  firstAvailableRoute,
} from '../lib/modules'
import {
  ALL_PERMISSIONS, DEFAULT_PERMISSIONS, hasPermission, PERMISSOES_RESTRITAS,
} from '../lib/permissions'

const PERFIS = ['ADMIN', 'GESTOR', 'OPERACIONAL', 'COMERCIAL'] as const

/**
 * LEITURA DE ARQUIVO-FONTE.
 *
 * Alguns fatos desta rodada não vivem em `MODULES`: as rotas antigas que
 * passaram a redirecionar, e os rótulos das abas de navegação profunda. Eles
 * são verificados no FONTE, como já se faz em `tests/layout.test.ts`.
 */
function existe(caminho: string): boolean {
  return fs.existsSync(caminho)
}
function ler(caminho: string): string {
  return fs.readFileSync(caminho, 'utf8')
}

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
    'home', 'conselho', 'receita.forecast', 'receita.metas',
    'comercial.clientes',
    'operacoes.compliance', 'comercial.pipeline', 'comercial.funis',
    'comercial.leads', 'comercial.followup', 'comercial.crm',
    'financeiro.visao', 'financeiro.cpcr', 'financeiro.condicoes',
    'financeiro.previsao', 'financeiro.cadastros',
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

test('RECEITA tem Metas e Lançamento Diário — e só', () => {
  // RECEITA é o OBJETIVO e o INSUMO. O Lançamento BaaS saiu para o
  // Financeiro: ele gera lançamento financeiro, título a receber e título a
  // pagar, e é ao lado desses três que ele se confere.
  const receita = MODULES.find((m) => m.key === 'receita')!
  assert.deepEqual(
    receita.features.filter((f) => f.enabled).map((f) => f.label),
    ['Metas', 'Lançamento Diário'],
  )
})

test('FINANCEIRO tem os CINCO menus da especificação, nessa ordem', () => {
  /**
   * A ORDEM É A DA LEITURA DO AMBIENTE:
   *
   *   Visão geral            o que aconteceu
   *   Previsão               o que se espera que aconteça
   *   CP / CR                os títulos e o registro que os origina
   *   Condições BaaS         o contrato do parceiro e a apuração dele
   *   Cadastros Financeiros  o que classifica tudo acima
   *
   * ── O QUE MUDOU NESTA RODADA ───────────────────────────────────────────
   *
   * Oito menus viraram CINCO, e nenhuma tela foi perdida:
   *
   *   Lançamentos, Contas a Pagar e Contas a Receber  →  abas de CP / CR
   *   Lançamentos BaaS                                →  aba de Condições BaaS
   *
   * Os três primeiros leem o MESMO `LancamentoFinanceiro`; o quarto é a
   * apuração que usa as tarifas cadastradas no menu que o absorveu.
   *
   * PREVISÃO subiu para a segunda posição: realizado e previsto são as duas
   * leituras executivas do ambiente, e a pergunta "fecha o mês?" se responde
   * com as duas juntas.
   */
  const financeiro = MODULES.find((m) => m.key === 'financeiro')!
  assert.deepEqual(
    financeiro.features.filter((f) => f.enabled).map((f) => f.label),
    [
      'Visão geral', 'Previsão', 'CP / CR', 'Condições BaaS',
      'Cadastros Financeiros',
    ],
  )
})

test('CP / CR registra as TRÊS APIs que absorveu', () => {
  /**
   * O MESMO BURACO DE SEGURANÇA que o teste de Cadastros Financeiros já
   * guarda, agora para CP / CR: caminho de API não registrado é caminho
   * LIBERADO para qualquer usuário autenticado (ver `checkAccess`).
   *
   * Ao fundir três menus em um, a tentação é apagar as três entradas e criar
   * uma nova com uma API só — e isso abriria os títulos a pagar, os títulos a
   * receber e os lançamentos financeiros para todo mundo, sem nenhum sinal na
   * tela.
   */
  const cpcr = activeFeatures().find((f) => f.key === 'financeiro.cpcr')!
  assert.ok(cpcr, 'CP / CR não está registrado')
  assert.equal(cpcr.route, '/dashboard/financeiro/cp-cr')
  for (const api of [
    '/api/financeiro/contas-pagar',
    '/api/financeiro/contas-receber',
    '/api/financeiro/lancamentos',
  ]) {
    assert.ok(cpcr.api?.includes(api), `${api} ficou sem registro de acesso`)
  }
})

test('Condições BaaS registra a API de Lançamento BaaS que absorveu', () => {
  const cond = activeFeatures().find((f) => f.key === 'financeiro.condicoes')!
  assert.equal(cond.route, '/dashboard/financeiro/condicoes-baas')
  for (const api of ['/api/financeiro/condicoes-baas', '/api/lancamento-baas']) {
    assert.ok(cond.api?.includes(api), `${api} ficou sem registro de acesso`)
  }
})

test('Clientes registra as TRÊS APIs que absorveu', () => {
  const cli = activeFeatures().find((f) => f.key === 'comercial.clientes')!
  assert.equal(cli.route, '/dashboard/carteira')
  assert.equal(cli.moduleKey, 'comercial')
  for (const api of ['/api/clientes', '/api/volumetria', '/api/certificados']) {
    assert.ok(cli.api?.includes(api), `${api} ficou sem registro de acesso`)
  }
})

test('CATEGORIAS e FORNECEDORES nao sao mais itens do sidebar', () => {
  // O objetivo principal do pedido: nao deixar os dois ocupando dois itens.
  const financeiro = MODULES.find((m) => m.key === 'financeiro')!
  const rotulos = financeiro.features.map((f) => f.label)
  assert.ok(!rotulos.includes('Categorias'), 'Categorias voltou a ser um item')
  assert.ok(!rotulos.includes('Fornecedores'), 'Fornecedores voltou a ser um item')
})

test('as TRES APIs de cadastro continuam REGISTRADAS', () => {
  /**
   * ESTE TESTE EXISTE PARA IMPEDIR UM BURACO DE SEGURANÇA SILENCIOSO.
   *
   * Caminho de API não registrado é caminho LIBERADO para qualquer usuário
   * autenticado (ver `checkAccess`). Ao fundir dois menus em um, a tentação é
   * apagar as duas entradas e criar uma nova com uma API só — e isso abriria
   * `/api/financeiro/categorias` e `/api/financeiro/fornecedores` para todo
   * mundo, sem nenhum sinal na tela.
   */
  const cadastros = activeFeatures().find((f) => f.key === 'financeiro.cadastros')!
  assert.ok(cadastros, 'Cadastros Financeiros nao esta registrado')
  for (const api of [
    '/api/financeiro/categorias',
    '/api/financeiro/fornecedores',
    '/api/financeiro/centros-custo',
  ]) {
    assert.ok(cadastros.api?.includes(api), `${api} ficou sem registro de acesso`)
  }
})

test('PREVISAO esta em FINANCEIRO e exige as chaves proprias', () => {
  const previsao = activeFeatures().find((f) => f.key === 'financeiro.previsao')!
  assert.ok(previsao, 'Previsao nao esta registrada')
  assert.equal(previsao.moduleKey, 'financeiro')
  assert.equal(previsao.route, '/dashboard/financeiro/previsao')
  assert.deepEqual(previsao.permissao, ['view_previsao', 'manage_previsao'])

  // SEM `exact`: a Previsao tem subcaminhos, e e por prefixo que eles herdam
  // esta autorizacao. Com `exact`, as seis sub-rotas ficariam sem registro —
  // e caminho nao registrado e caminho liberado.
  assert.ok(!previsao.exact, 'Previsao com `exact` deixaria as sub-rotas abertas')
  assert.ok(previsao.api?.includes('/api/previsao'), 'a API de Previsao ficou sem registro')
})

test('Lançamento BaaS está em FINANCEIRO, nunca em RECEITA', () => {
  // Deixou de ser menu próprio e virou a aba "Lançamentos" de Condições BaaS,
  // que é do FINANCEIRO. RECEITA continua sem nada de BaaS.
  const cond = activeFeatures().find((f) => f.key === 'financeiro.condicoes')!
  assert.equal(cond.moduleKey, 'financeiro')
  const receita = MODULES.find((m) => m.key === 'receita')!
  assert.ok(!receita.features.some((f) => /baas/i.test(f.label)))
  // E não há mais menu próprio para ele em lugar nenhum.
  for (const perfil of PERFIS) {
    const itens = navigationFor(perfil).flatMap((x) => x.items.map((i) => i.label))
    assert.ok(!itens.includes('Lançamentos BaaS'),
      `Lançamentos BaaS voltou a ser menu em ${perfil}`)
  }
})

test('a rota antiga de Lançamento BaaS continua existindo, como redirecionamento', () => {
  /**
   * `/dashboard/lancamento-baas` esteve em produção: há favoritos e links em
   * conversas apontando para lá. A página permanece e só redireciona.
   *
   * Ela NÃO é registrada em `MODULES`, e isso é correto: caminho não
   * registrado é caminho liberado, e esta página não lê nada — só manda para
   * `/dashboard/financeiro/condicoes-baas/lancamentos`, que é registrada e
   * confere a alçada.
   */
  assert.ok(existe('app/dashboard/lancamento-baas/page.tsx'))
  const red = ler('app/dashboard/lancamento-baas/page.tsx')
  assert.ok(red.includes("redirect('/dashboard/financeiro/condicoes-baas/lancamentos')"))
})

test('Metas e Lançamento Diário NÃO estão em Financeiro', () => {
  const financeiro = MODULES.find((m) => m.key === 'financeiro')!
  const rotulos = financeiro.features.map((f) => f.label)
  assert.ok(!rotulos.includes('Metas'))
  assert.ok(!rotulos.includes('Lançamento Diário'))

  // As CHAVES e ROTAS das funções não mudaram ao voltarem para RECEITA:
  // trocá-las invalidaria permissões gravadas e links salvos.
  const metas = activeFeatures().find((f) => f.key === 'receita.metas')!
  const diario = activeFeatures().find((f) => f.key === 'receita.forecast')!
  assert.equal(metas.route, '/dashboard/metas')
  assert.equal(diario.route, '/dashboard/forecast')
  assert.equal(metas.moduleKey, 'receita')
  assert.equal(diario.moduleKey, 'receita')
})

test('CP / CR tem as TRÊS vistas, cada uma na sua rota', () => {
  /**
   * Contas a Pagar, Contas a Receber e Lançamentos viraram abas de UM menu —
   * mas continuam sendo TRÊS telas, em três rotas. Fundir os menus não é
   * fundir as telas: cada aba busca só o que precisa, e o link de uma delas é
   * um endereço.
   *
   * Contas a Pagar mora na RAIZ: é a vista com prazo.
   */
  for (const [rota, cliente] of [
    ['app/dashboard/financeiro/cp-cr/page.tsx', 'ContasPagarClient'],
    ['app/dashboard/financeiro/cp-cr/receber/page.tsx', 'ContasReceberClient'],
    ['app/dashboard/financeiro/cp-cr/lancamentos/page.tsx', 'LancamentosClient'],
  ] as const) {
    assert.ok(existe(rota), `${rota} não existe`)
    assert.ok(ler(rota).includes(cliente), `${rota} não renderiza ${cliente}`)
  }
})

test('as rotas antigas de CP / CR continuam existindo, como redirecionamento', () => {
  for (const [antiga, destino] of [
    ['app/dashboard/financeiro/contas-pagar/page.tsx', '/dashboard/financeiro/cp-cr'],
    ['app/dashboard/financeiro/contas-receber/page.tsx', '/dashboard/financeiro/cp-cr/receber'],
    ['app/dashboard/financeiro/lancamentos/page.tsx', '/dashboard/financeiro/cp-cr/lancamentos'],
  ] as const) {
    assert.ok(existe(antiga), `${antiga} foi apagada — links salvos devolveriam 404`)
    assert.ok(ler(antiga).includes(`redirect('${destino}')`),
      `${antiga} não redireciona para ${destino}`)
  }
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
  assert.deepEqual(daRota('/dashboard/financeiro/cp-cr'), ['financeiro.cpcr'])
  // AS SUB-ROTAS HERDAM O REGISTRO DO PAI, por prefixo. É assim que as abas
  // de CP / CR e de Condições BaaS ficam protegidas sem registro próprio.
  assert.deepEqual(daRota('/dashboard/financeiro/cp-cr/lancamentos'), ['financeiro.cpcr'])
  assert.deepEqual(daRota('/dashboard/financeiro/condicoes-baas'), ['financeiro.condicoes'])
  assert.deepEqual(
    daRota('/dashboard/financeiro/condicoes-baas/lancamentos'), ['financeiro.condicoes'],
  )
  assert.deepEqual(daRota('/dashboard/carteira/volumetria'), ['comercial.clientes'])
  assert.deepEqual(daRota('/dashboard/carteira/certificados'), ['comercial.clientes'])
})

test('nenhuma FUNÇÃO engole o prefixo de API de outra', () => {
  // O risco real: duas funções diferentes cujos prefixos se contêm. Aí a
  // resolução por rota mais específica decide qual permissão vale, e a
  // resposta deixa de ser óbvia. Sub-rotas da MESMA função são esperadas —
  // `checkAccess` casa por prefixo, e o pai protege o filho.
  const porFuncao = activeFeatures().map((f) => ({ key: f.key, apis: f.api ?? [] }))

  const todas = porFuncao.flatMap((f) => f.apis)
  assert.equal(new Set(todas).size, todas.length, 'há prefixo de API repetido entre funções')

  /**
   * Prefixo aninhado é PERMITIDO — mas só quando quem o reivindica é a função
   * de ROTA MAIS LONGA, que é justamente quem `checkAccess` escolhe.
   *
   * É o caso da Lixeira sob Leads e dos Funis sob o Pipeline: a sub-rota
   * pertence à função mais específica, e por isso a permissão que vale é a
   * dela. O que seria bug é o contrário — a função mais GENÉRICA reivindicar
   * o caminho mais profundo, porque aí a resolução escolheria a específica e
   * ignoraria a permissão que o autor pensou estar aplicando.
   */
  const comRota = activeFeatures().map((f) => ({ key: f.key, route: f.route, apis: f.api ?? [] }))

  for (const a of comRota) {
    for (const b of comRota) {
      if (a.key === b.key) continue
      for (const pa of a.apis) {
        for (const pb of b.apis) {
          if (!pb.startsWith(pa + '/')) continue
          assert.ok(
            b.route.length > a.route.length,
            `${b.key} (${pb}) aninha sob ${a.key} (${pa}), mas não é a função mais específica`,
          )
        }
      }
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

test('ADMIN recebe o catálogo inteiro MENOS as restritas', () => {
  // Ser ADMIN é poder operar o sistema, não ser sócio nem auditor. Um default
  // com as chaves restritas as devolveria pela porta de trás.
  assert.deepEqual(
    DEFAULT_PERMISSIONS.ADMIN,
    ALL_PERMISSIONS.map((p) => p.key).filter((k) => !PERMISSOES_RESTRITAS.includes(k)),
  )
  for (const k of PERMISSOES_RESTRITAS) {
    assert.ok(!DEFAULT_PERMISSIONS.ADMIN.includes(k), `ADMIN recebeu ${k} por default`)
  }
})

test('o menu chama-se "Condições BaaS", nao "Condições Comerciais BaaS"', () => {
  // O rotulo oficial encurtou. Este teste existe porque o nome antigo estava
  // espalhado por seis arquivos e volta facil num copiar-e-colar.
  const rotulos = activeFeatures().map((f) => f.label)
  assert.ok(rotulos.includes('Condições BaaS'))
  assert.ok(!rotulos.some((r) => r.includes('Condições Comerciais')))
})

/* ── Contas a Receber e Categorias ───────────────────────────────────────── */

test('Contas a Receber e Contas a Pagar não são mais menus — são abas de CP / CR', () => {
  const rotulos = navigationFor('ADMIN')
    .find((s) => s.key === 'financeiro')!.items.map((i) => i.label)
  assert.ok(!rotulos.includes('Contas a Receber'))
  assert.ok(!rotulos.includes('Contas a Pagar'))
  assert.ok(rotulos.includes('CP / CR'))

  // E AS DUAS CONTINUAM NA NAVEGAÇÃO PROFUNDA, com o nome que sempre tiveram.
  const nav = ler('components/financeiro/CpCrNav.tsx')
  assert.ok(nav.includes("label: 'Contas a Pagar'"))
  assert.ok(nav.includes("label: 'Contas a Receber'"))
  assert.ok(nav.includes("label: 'Lançamentos'"))
})

test('a aba interna de Condições BaaS se chama "Lançamentos", sem "BaaS"', () => {
  // Dentro de "Condições BaaS" o sufixo é redundante — o módulo já disse que
  // o assunto é BaaS. "Lançamentos BaaS" aqui leria como se houvesse outro
  // tipo de lançamento na mesma tela.
  const nav = ler('components/financeiro/CondicoesBaasNav.tsx')
  assert.ok(nav.includes("label: 'Condições'"))
  assert.ok(nav.includes("label: 'Lançamentos'"))
  assert.ok(!nav.includes("label: 'Lançamentos BaaS'"))
})

test('RECEITA e FINANCEIRO são seções SEPARADAS na sidebar', () => {
  const nav = navigationFor('ADMIN')
  const receita = nav.find((s) => s.key === 'receita')!
  const financeiro = nav.find((s) => s.key === 'financeiro')!

  assert.equal(receita.label, 'RECEITA')
  assert.equal(financeiro.label, 'FINANCEIRO')
  assert.equal(receita.items.length, 2)
  assert.equal(financeiro.items.length, 5)
  // RECEITA vem ANTES: é a meta que dá sentido à leitura do resto.
  assert.ok(nav.indexOf(receita) < nav.indexOf(financeiro))
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

/* ── Navegação final da rodada ───────────────────────────────────────────── */

test('COMERCIAL: Visão geral, Leads, Pipeline, Clientes, Follow Up — nessa ordem', () => {
  /**
   * CLIENTES entrou aqui, depois do Pipeline. A seção CARTEIRA saiu: ela tinha
   * três itens — Clientes, Volumetria e Certificados — que são três leituras
   * do MESMO cliente, e viraram abas de um módulo só.
   *
   * A posição é a da leitura do funil: o cliente é o desfecho do pipeline, e
   * o Follow Up acompanha os dois.
   */
  const comercial = navigationFor('ADMIN').find((s) => s.key === 'comercial')!
  assert.deepEqual(
    comercial.items.map((i) => i.label),
    ['Visão geral', 'Leads', 'Pipeline', 'Clientes', 'Follow Up'],
  )
})

test('Volumetria e Certificados não são mais menus — são abas de Clientes', () => {
  for (const perfil of PERFIS) {
    const itens = navigationFor(perfil, ALL_PERMISSIONS as unknown as string[], true)
      .flatMap((x) => x.items.map((i) => i.label))
    assert.ok(!itens.includes('Volumetria'), `Volumetria voltou a ser menu em ${perfil}`)
    assert.ok(!itens.includes('Certificados'), `Certificados voltou a ser menu em ${perfil}`)
  }

  // E as duas continuam na navegação profunda, com o nome que sempre tiveram.
  const nav = ler('components/carteira/CarteiraNav.tsx')
  assert.ok(nav.includes("label: 'Clientes'"))
  assert.ok(nav.includes("label: 'Volumetria'"))
  assert.ok(nav.includes("label: 'Certificados'"))
})

test('as rotas antigas de Volumetria e Certificados redirecionam', () => {
  for (const [antiga, destino] of [
    ['app/dashboard/volumetria/page.tsx', '/dashboard/carteira/volumetria'],
    ['app/dashboard/certificados/page.tsx', '/dashboard/carteira/certificados'],
  ] as const) {
    assert.ok(existe(antiga), `${antiga} foi apagada — links salvos devolveriam 404`)
    assert.ok(ler(antiga).includes(`redirect('${destino}')`),
      `${antiga} não redireciona para ${destino}`)
  }
})

test('a aba de Certificados some para quem não tem a chave', () => {
  /**
   * A ALÇADA DE CADA ABA NÃO MUDOU ao consolidar os menus: Certificados
   * continua exigindo `view_certificates` na página e na API.
   *
   * O que a navegação profunda acrescenta é que o LINK não é desenhado para
   * quem não tem a chave — em vez de ser desenhado e levar a um redirect.
   * Esconder o link não autoriza nada: a página continua conferindo.
   */
  const nav = ler('components/carteira/CarteiraNav.tsx')
  assert.ok(nav.includes('podeVerCertificados'))
  assert.ok(nav.includes('visivel: podeVerCertificados'))

  const pagina = ler('app/dashboard/carteira/certificados/page.tsx')
  assert.ok(pagina.includes("'view_certificates'"),
    'a página de Certificados parou de conferir a chave')
  assert.ok(pagina.includes("redirect('/dashboard')"))
})

test('OPERAÇÕES: Tarefas, Incidentes, Compliance — nessa ordem', () => {
  const operacoes = navigationFor('ADMIN').find((s) => s.key === 'operacoes')!
  assert.deepEqual(
    operacoes.items.map((i) => i.label),
    ['Tarefas', 'Incidentes', 'Compliance'],
  )
})

test('"Follow Up" — não "Follow-up", nem "Frequência de Follow-up"', () => {
  const rotulos = activeFeatures().map((f) => f.label)
  assert.ok(rotulos.includes('Follow Up'))
  assert.ok(!rotulos.some((r) => /frequ[êe]ncia/i.test(r)))
})

test('nenhum menu reintroduz os ambientes removidos', () => {
  // Relatórios, Documentos, Alertas, Parâmetros, Formulários, Automações e
  // Métricas Operacionais. Sete nomes que voltam fácil num copiar-e-colar.
  const proibidos = [
    /relat[óo]rio/i, /documento/i, /alerta/i, /par[âa]metro/i,
    /formul[áa]rio/i, /automa[çc][ãa]o/i, /m[ée]tricas/i,
  ]
  for (const perfil of PERFIS) {
    const itens = navigationFor(perfil).flatMap((s) => s.items.map((i) => i.label))
    for (const padrao of proibidos) {
      assert.ok(
        !itens.some((r) => padrao.test(r)),
        `${padrao} apareceu na sidebar de ${perfil}: ${itens.join(', ')}`,
      )
    }
  }
})

test('as seções da sidebar saem na ordem da especificação', () => {
  const secoes = navigationFor('ADMIN').map((s) => s.key)
  assert.deepEqual(
    secoes,
    ['executivo', 'receita', 'comercial', 'operacoes', 'financeiro', 'admin'],
  )
})

test('quem NÃO é sócio vê EXECUTIVO sem Conselho', () => {
  // `socio: false` é a resposta de quem CONSULTOU o banco. `undefined` seria
  // "não sei" — e quem não sabe (o proxy) não decide. A sidebar sempre sabe:
  // o layout é server component e lê `isPartner` do banco.
  const executivo = navigationFor('ADMIN', null, false).find((s) => s.key === 'executivo')!
  assert.deepEqual(executivo.items.map((i) => i.label), ['Home'])
})

/* ── A SIDEBAR DESTA RODADA, item por item ───────────────────────────────── */

test('EXECUTIVO: Home e Conselho', () => {
  // `view_conselho` na lista: o Conselho passou a exigir socio E a chave, e
  // sem ela o item (corretamente) nao aparece.
  const s = navigationFor('ADMIN', ['view_conselho'], true).find((x) => x.key === 'executivo')!
  assert.deepEqual(s.items.map((i) => i.label), ['Home', 'Conselho'])
})

test('o Cockpit virou HOME — só o nome e a chave mudaram', () => {
  /**
   * "Apenas nome e posição, sem alterar a função": a ROTA, a API e `exact`
   * continuam exatamente os mesmos. Trocá-los invalidaria links salvos e
   * deixaria `/api/dashboard` sem registro.
   *
   * A chave acompanhou o rótulo porque o registro é a fonte de verdade do
   * produto, e uma entrada `key: 'cockpit'` rotulada "Home" seria a
   * divergência que `lib/modules.ts` existe para evitar.
   */
  const home = activeFeatures().find((f) => f.key === 'home')!
  assert.ok(home, 'a Home não está registrada')
  assert.equal(home.label, 'Home')
  assert.equal(home.route, '/dashboard')
  assert.equal(home.exact, true)
  assert.ok(home.api?.includes('/api/dashboard'))
  assert.equal(home.moduleKey, 'executivo')

  // E a chave antiga não ficou para trás, duplicando a função.
  assert.ok(!activeFeatures().some((f) => f.key === 'cockpit'))
})

test('a ordem das seções é a da especificação, par a par', () => {
  const k = navigationFor('ADMIN', null, true).map((s) => s.key)
  const antes = (a: string, b: string) =>
    assert.ok(k.indexOf(a) < k.indexOf(b), `${a} deveria vir antes de ${b}`)

  antes('executivo', 'receita')
  // CARTEIRA SAIU: Clientes virou um item de COMERCIAL.
  antes('receita', 'comercial')
  antes('comercial', 'operacoes')
  antes('operacoes', 'financeiro')
  antes('financeiro', 'admin')
})

test('Contas a PAGAR vem antes de Contas a RECEBER — agora dentro de CP / CR', () => {
  // A ordem continua sendo a mesma, só mudou de lugar: do sidebar para a
  // navegação profunda. Pagar primeiro porque é a vista que tem prazo.
  const nav = ler('components/financeiro/CpCrNav.tsx')
  assert.ok(nav.indexOf("label: 'Contas a Pagar'") < nav.indexOf("label: 'Contas a Receber'"))
  // E Contas a Pagar é a RAIZ do módulo: `href: ''`.
  assert.ok(/\{ href: '', label: 'Contas a Pagar' \}/.test(nav))
})

test('Cadastros Financeiros FECHA o Financeiro', () => {
  // Os cadastros são infraestrutura: classificam tudo o que está acima, e por
  // isso vêm por último. Era Lançamentos BaaS que fechava; ele virou aba de
  // Condições BaaS.
  const rotulos = navigationFor('ADMIN')
    .find((s) => s.key === 'financeiro')!.items.map((i) => i.label)
  assert.equal(rotulos[rotulos.length - 1], 'Cadastros Financeiros')
})

test('PREVISÃO vem imediatamente abaixo da Visão geral', () => {
  // Realizado e previsto lado a lado, no topo: são as duas leituras
  // executivas do ambiente, e "fecha o mês?" se responde com as duas juntas.
  const rotulos = navigationFor('ADMIN', ['view_previsao'])
    .find((s) => s.key === 'financeiro')!.items.map((i) => i.label)
  assert.equal(rotulos[0], 'Visão geral')
  assert.equal(rotulos[1], 'Previsão')
})

test('nenhum menu novo foi inventado — as SEIS seções e nada mais', () => {
  const chaves = navigationFor('ADMIN', ['view_auditoria'], true).map((s) => s.key)
  assert.deepEqual(chaves, [
    'executivo', 'receita', 'comercial', 'operacoes', 'financeiro', 'admin',
  ])
})

test('A SIDEBAR INTEIRA, item por item — a especificação desta rodada', () => {
  /**
   * O ESPELHO EXATO do pedido. Qualquer item que entre, saia ou troque de
   * seção quebra aqui — que é o ponto: a sidebar é a primeira coisa que o
   * usuário vê, e ela mudou por decisão de produto, não por acidente.
   */
  const nav = navigationFor('ADMIN', ['view_conselho', 'view_previsao', 'view_auditoria'], true)
  assert.deepEqual(
    nav.map((s) => [s.label, s.items.map((i) => i.label)]),
    [
      ['EXECUTIVO', ['Home', 'Conselho']],
      ['RECEITA', ['Metas', 'Lançamento Diário']],
      ['COMERCIAL', ['Visão geral', 'Leads', 'Pipeline', 'Clientes', 'Follow Up']],
      ['OPERAÇÕES', ['Tarefas', 'Incidentes', 'Compliance']],
      ['FINANCEIRO', [
        'Visão geral', 'Previsão', 'CP / CR', 'Condições BaaS', 'Cadastros Financeiros',
      ]],
      ['ADMIN', ['Usuários', 'Auditoria']],
    ],
  )
})
