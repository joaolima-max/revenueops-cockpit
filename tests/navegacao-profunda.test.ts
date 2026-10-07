/**
 * NAVEGAÇÃO PROFUNDA — os quatro módulos com áreas internas.
 *
 * ── O QUE A CONSOLIDAÇÃO NÃO PODE TER FEITO ──────────────────────────────
 *
 * Oito menus do sidebar viraram abas de quatro módulos. O risco de uma
 * operação assim é sempre o mesmo, e ele é silencioso: a tela desaparece junto
 * com o menu. Então o que se verifica aqui é que cada aba continua existindo,
 * com a sua rota, o seu cliente e a sua alçada.
 *
 *   PREVISÃO         Visão Geral · Orçamento · Receitas · Despesas ·
 *                    Fluxo de Caixa · Centros de Custo · Forecast
 *   CP / CR          Contas a Pagar · Contas a Receber · Lançamentos
 *   CONDIÇÕES BAAS   Condições · Lançamentos
 *   CLIENTES         Clientes · Volumetria · Certificados
 *
 * ── E A APARÊNCIA É DE UM COMPONENTE SÓ ──────────────────────────────────
 *
 * Quatro cópias do mesmo markup é como quatro telas passam a ter quatro
 * aparências e quatro regras diferentes de "qual aba está ativa". A regra mora
 * em `components/ui/SubNav`.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { join } from 'node:path'
import { activeFeatures, checkAccess } from '../lib/modules'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => fs.readFileSync(join(RAIZ, p), 'utf8')
const existe = (p: string) => fs.existsSync(join(RAIZ, p))

const SUBNAV = ler('components/ui/SubNav.tsx')

/* ========================================================================= *
 * O COMPONENTE ÚNICO
 * ========================================================================= */

test('os quatro modulos usam o MESMO SubNav', () => {
  for (const nav of [
    'components/previsao/PrevisaoNav.tsx',
    'components/financeiro/CpCrNav.tsx',
    'components/financeiro/CondicoesBaasNav.tsx',
    'components/carteira/CarteiraNav.tsx',
  ]) {
    const fonte = ler(nav)
    assert.ok(fonte.includes("from '@/components/ui/SubNav'"), `${nav} tem markup proprio`)
    assert.ok(fonte.includes('<SubNav'), `${nav} nao renderiza o SubNav`)
    // E nenhum deles reimplementa a regra de "ativa".
    assert.ok(!fonte.includes('usePathname'), `${nav} reimplementou a regra de aba ativa`)
  }
})

test('a RAIZ casa EXATAMENTE; as demais abas casam por prefixo', () => {
  /**
   * A primeira área mora na raiz do módulo (`href: ''`). Sem o caso exato ela
   * ficaria marcada como atual em TODAS as sub-rotas, porque todas começam com
   * o seu caminho.
   *
   * As demais casam por prefixo de propósito: uma área com detalhe próprio
   * (`/clientes/abc`) deve manter a sua aba acesa.
   */
  assert.ok(SUBNAV.includes("a.href === ''"))
  assert.ok(SUBNAV.includes('pathname === rota'))
  assert.ok(SUBNAV.includes("pathname.startsWith(rota + '/')"))
})

test('uma aba so NAO desenha fileira — e um titulo repetido', () => {
  // Acontece de verdade quando a alcada esconde as demais: alguem sem
  // `view_certificates` numa Carteira sem Volumetria veria "Clientes" sozinho.
  assert.ok(SUBNAV.includes('if (visiveis.length <= 1) return null'))
})

test('`visivel: false` esconde o LINK, nunca autoriza nada', () => {
  assert.ok(SUBNAV.includes("a.visivel !== false"))
  // A pagina continua conferindo a chave — e o comentario do componente diz
  // isso, para que ninguem use `visivel` como se fosse autorizacao.
  assert.ok(SUBNAV.includes('esconder o link não é autorizar nada'))
})

/* ========================================================================= *
 * CP / CR
 * ========================================================================= */

test('CP / CR: as tres abas, cada uma com a sua pagina e o seu cliente', () => {
  const abas = [
    ['app/dashboard/financeiro/cp-cr/page.tsx', 'ContasPagarClient'],
    ['app/dashboard/financeiro/cp-cr/receber/page.tsx', 'ContasReceberClient'],
    ['app/dashboard/financeiro/cp-cr/lancamentos/page.tsx', 'LancamentosClient'],
  ] as const
  for (const [pagina, cliente] of abas) {
    assert.ok(existe(pagina), `${pagina} nao existe`)
    const fonte = ler(pagina)
    assert.ok(fonte.includes(cliente), `${pagina} nao renderiza ${cliente}`)
    assert.ok(fonte.includes('<CpCrNav'), `${pagina} nao mostra a navegacao do modulo`)
    assert.ok(fonte.includes("export const dynamic = 'force-dynamic'"),
      `${pagina} deixou de ser dinamica`)
  }
})

test('CP / CR: a alcada de cada aba e a que ela ja tinha como menu', () => {
  /**
   * Consolidar menus não é o momento de afrouxar nem de apertar uma
   * permissão. Contas a Pagar e Contas a Receber exigiam `view_financeiro`
   * para abrir; Lançamentos não exigia (quem não pode gerenciar entra em
   * leitura). Continua assim.
   */
  const pagar = ler('app/dashboard/financeiro/cp-cr/page.tsx')
  const receber = ler('app/dashboard/financeiro/cp-cr/receber/page.tsx')
  const lanc = ler('app/dashboard/financeiro/cp-cr/lancamentos/page.tsx')

  for (const [nome, fonte] of [['pagar', pagar], ['receber', receber]] as const) {
    assert.ok(fonte.includes("'view_financeiro'"), `${nome} parou de conferir a leitura`)
    assert.ok(fonte.includes("redirect('/dashboard')"), `${nome} parou de barrar`)
  }

  // Lançamentos entra em LEITURA para quem não gerencia — como já entrava.
  assert.ok(!lanc.includes("redirect('/dashboard')"),
    'Lancamentos passou a barrar quem antes entrava em leitura')
  assert.ok(lanc.includes("'manage_financeiro'"))

  // E as tres pedem `manage_financeiro` para escrever.
  for (const fonte of [pagar, receber, lanc]) {
    assert.ok(fonte.includes("'manage_financeiro'"))
  }
})

/* ========================================================================= *
 * CONDIÇÕES BAAS
 * ========================================================================= */

test('Condicoes BaaS: a aba de Lancamentos exige `view_receita`, como antes', () => {
  const pagina = ler('app/dashboard/financeiro/condicoes-baas/lancamentos/page.tsx')
  assert.ok(pagina.includes("'view_receita'"))
  assert.ok(pagina.includes("redirect('/dashboard')"))
  assert.ok(pagina.includes('LancamentoBaasClient'))

  // E o LINK some para quem nao tem a chave, em vez de levar a um redirect.
  const nav = ler('components/financeiro/CondicoesBaasNav.tsx')
  assert.ok(nav.includes('visivel: podeVerLancamentos'))
  const raiz = ler('app/dashboard/financeiro/condicoes-baas/page.tsx')
  assert.ok(raiz.includes("'view_receita'"), 'a raiz nao calcula a visibilidade da aba')
})

/* ========================================================================= *
 * CLIENTES
 * ========================================================================= */

test('Clientes: as tres abas, cada uma com a sua pagina', () => {
  const abas = [
    ['app/dashboard/carteira/page.tsx', 'CarteiraClient'],
    ['app/dashboard/carteira/volumetria/page.tsx', 'VolumetriaClient'],
    ['app/dashboard/carteira/certificados/page.tsx', 'CertificadosClient'],
  ] as const
  for (const [pagina, cliente] of abas) {
    assert.ok(existe(pagina), `${pagina} nao existe`)
    const fonte = ler(pagina)
    assert.ok(fonte.includes(cliente), `${pagina} nao renderiza ${cliente}`)
    assert.ok(fonte.includes('<CarteiraNav'), `${pagina} nao mostra a navegacao do modulo`)
  }
})

test('Clientes: a rota estatica das abas vence a dinamica de detalhe', () => {
  /**
   * `/dashboard/carteira/[id]` existe (o detalhe do cliente). As abas moram em
   * `/volumetria` e `/certificados`, que são segmentos ESTÁTICOS — e no App
   * Router o estático tem prioridade sobre o dinâmico.
   *
   * O que este teste prende é que as três continuam existindo como arquivos
   * distintos: apagar uma das pastas faria a URL cair no detalhe do cliente e
   * procurar um cliente de id "volumetria".
   */
  assert.ok(existe('app/dashboard/carteira/[id]/page.tsx'))
  assert.ok(existe('app/dashboard/carteira/volumetria/page.tsx'))
  assert.ok(existe('app/dashboard/carteira/certificados/page.tsx'))
})

test('Clientes: o detalhe do cliente NAO carrega a fileira de abas', () => {
  // E uma drill-down, nao uma area irma: abas ali sugeririam que "Volumetria"
  // mostraria a volumetria DAQUELE cliente.
  const detalhe = ler('app/dashboard/carteira/[id]/page.tsx')
  assert.ok(!detalhe.includes('CarteiraNav'))
})

/* ========================================================================= *
 * AS ROTAS ANTIGAS
 * ========================================================================= */

test('TODA rota antiga redireciona — nenhuma devolve 404', () => {
  /**
   * Oito rotas estiveram em produção. Há favoritos, links em conversas e
   * históricos de navegador apontando para elas, e notificações já gravadas no
   * banco com o href antigo. Devolver 404 a quem clica num link que funcionava
   * ontem é quebrar a tela sem avisar.
   */
  const pares = [
    ['app/dashboard/financeiro/contas-pagar/page.tsx', '/dashboard/financeiro/cp-cr'],
    ['app/dashboard/financeiro/contas-receber/page.tsx', '/dashboard/financeiro/cp-cr/receber'],
    ['app/dashboard/financeiro/lancamentos/page.tsx', '/dashboard/financeiro/cp-cr/lancamentos'],
    ['app/dashboard/lancamento-baas/page.tsx', '/dashboard/financeiro/condicoes-baas/lancamentos'],
    ['app/dashboard/volumetria/page.tsx', '/dashboard/carteira/volumetria'],
    ['app/dashboard/certificados/page.tsx', '/dashboard/carteira/certificados'],
    ['app/dashboard/financeiro/categorias/page.tsx', '/dashboard/financeiro/cadastros?aba=categorias'],
    ['app/dashboard/financeiro/fornecedores/page.tsx', '/dashboard/financeiro/cadastros?aba=fornecedores'],
  ] as const

  for (const [antiga, destino] of pares) {
    assert.ok(existe(antiga), `${antiga} foi apagada`)
    const fonte = ler(antiga)
    assert.ok(fonte.includes(`redirect('${destino}')`),
      `${antiga} nao redireciona para ${destino}`)
    // A pagina de redirecionamento nao le nada: nao toca banco nem sessao.
    assert.ok(!fonte.includes('prisma'), `${antiga} passou a consultar o banco`)
    assert.ok(!fonte.includes('getSession'), `${antiga} passou a ler a sessao`)
  }
})

test('as rotas antigas NAO precisam de registro — e por isso nao o tem', () => {
  /**
   * Caminho não registrado é caminho liberado (ver `checkAccess`), e isso está
   * CORRETO aqui: a página não lê nada, só manda para a rota nova, que é
   * registrada e confere a alçada. Registrá-la duplicaria a autorização num
   * lugar que não decide nada.
   */
  const rotas = [
    '/dashboard/financeiro/contas-pagar',
    '/dashboard/financeiro/contas-receber',
    '/dashboard/financeiro/lancamentos',
    '/dashboard/lancamento-baas',
    '/dashboard/volumetria',
    '/dashboard/certificados',
  ]
  for (const rota of rotas) {
    assert.ok(
      !activeFeatures().some((f) => f.route === rota),
      `${rota} voltou a ser uma funcao registrada`,
    )
    assert.equal(checkAccess(rota, 'COMERCIAL'), 'allow')
  }
})

test('as rotas NOVAS estao todas cobertas por um registro', () => {
  /**
   * O inverso, e o que importa de verdade: nenhuma das rotas novas pode ficar
   * sem registro. Sem ele, qualquer usuário autenticado abriria a tela.
   */
  const novas = [
    ['/dashboard/financeiro/cp-cr', 'financeiro.cpcr'],
    ['/dashboard/financeiro/cp-cr/receber', 'financeiro.cpcr'],
    ['/dashboard/financeiro/cp-cr/lancamentos', 'financeiro.cpcr'],
    ['/dashboard/financeiro/condicoes-baas', 'financeiro.condicoes'],
    ['/dashboard/financeiro/condicoes-baas/lancamentos', 'financeiro.condicoes'],
    ['/dashboard/carteira', 'comercial.clientes'],
    ['/dashboard/carteira/volumetria', 'comercial.clientes'],
    ['/dashboard/carteira/certificados', 'comercial.clientes'],
  ] as const

  for (const [rota, chave] of novas) {
    const casam = activeFeatures().filter((f) =>
      f.exact ? rota === f.route : rota === f.route || rota.startsWith(f.route + '/'),
    )
    assert.ok(casam.length > 0, `${rota} ficou sem registro`)
    // A mais especifica e a que decide — e tem de ser a esperada.
    const mais = casam.reduce((a, b) => (b.route.length > a.route.length ? b : a))
    assert.equal(mais.key, chave, `${rota} e governada por ${mais.key}, nao ${chave}`)
  }
})

test('NENHUMA API absorvida ficou sem registro', () => {
  /**
   * O buraco de segurança que a consolidação poderia abrir em silêncio: as
   * APIs das telas absorvidas continuam existindo e, sem registro, ficariam
   * liberadas para qualquer usuário autenticado.
   */
  const absorvidas = [
    '/api/financeiro/contas-pagar',
    '/api/financeiro/contas-receber',
    '/api/financeiro/lancamentos',
    '/api/lancamento-baas',
    '/api/volumetria',
    '/api/certificados',
    '/api/financeiro/categorias',
    '/api/financeiro/fornecedores',
  ]
  for (const api of absorvidas) {
    assert.ok(
      activeFeatures().some((f) => f.api?.includes(api)),
      `${api} ficou sem registro de acesso`,
    )
  }
})

/* ========================================================================= *
 * OS LINKS INTERNOS
 * ========================================================================= */

test('nenhum link INTERNO aponta mais para uma rota antiga', () => {
  /**
   * Redirecionamento é para links de FORA (favoritos, conversas, notificações
   * antigas). Um link dentro do produto apontando para a rota antiga paga um
   * salto de 307 a cada clique — e, pior, esconde que a rota mudou.
   */
  const antigas = [
    '/dashboard/financeiro/contas-pagar',
    '/dashboard/financeiro/contas-receber',
    '/dashboard/financeiro/lancamentos',
    '/dashboard/lancamento-baas',
    '/dashboard/volumetria',
    '/dashboard/certificados',
  ]

  const arquivos: string[] = []
  const varrer = (dir: string) => {
    for (const e of fs.readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) varrer(p)
      else if (/\.tsx?$/.test(e.name)) arquivos.push(p)
    }
  }
  varrer('app'); varrer('components'); varrer('lib')

  for (const arq of arquivos) {
    // As próprias páginas de redirecionamento citam a rota antiga por dever.
    if (/\/(contas-pagar|contas-receber|lancamentos|lancamento-baas|volumetria|certificados)\/page\.tsx$/.test(arq)
      && ler(arq).includes('redirect(')) continue

    const fonte = ler(arq)
    for (const rota of antigas) {
      assert.ok(
        !fonte.includes(`href="${rota}"`) && !fonte.includes(`href='${rota}'`)
        && !fonte.includes(`'${rota}'`) && !fonte.includes(`"${rota}"`),
        `${arq} ainda aponta para ${rota}`,
      )
    }
  }
})
