/**
 * RECEITA PREVISTA AUTOMÁTICA — a composição e a sua auditabilidade.
 *
 * ── A FÓRMULA ────────────────────────────────────────────────────────────
 *
 *   RECEITA PREVISTA = MRR PROJETADO
 *                    + META DE RECEITA TARIFÁRIA
 *                    + META DE RECEITA DE LANÇAMENTOS WL/BAAS
 *                    + META DE RECEITA DE SERVIÇOS
 *                    + META DE RECEITA DE SETUP
 *                    + RECEITAS PREVISTAS LANÇADAS
 *
 * Os cinco primeiros são o pedido, literalmente. O sexto é o cadastro manual
 * que já existia: ele entra COMO COMPONENTE em vez de ser somado à parte, para
 * que a tela não tenha dois totais de "receita prevista". Com nenhuma linha
 * lançada — que é o estado de Production — o total é exatamente a fórmula de
 * cinco termos.
 *
 * ── A DUPLA CONTAGEM QUE ISTO NÃO FAZ ────────────────────────────────────
 *
 * Sustentação e mensalidade de API entram pelo MRR PROJETADO, que vem do
 * cadastro de condições comerciais e da carteira. Não há meta para elas — e
 * não pode haver, porque metá-las contaria o mesmo contrato duas vezes. Este
 * arquivo prende isso.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMPONENTES_RECEITA_PREVISTA, COMPONENTE_RECEITA_LABEL, META_DO_COMPONENTE,
  totalDaComposicao, type ComponenteReceitaPrevista,
} from '../lib/previsao-calculo'
import { META_TIPOS, META_TIPO_LABEL, PADRAO_POR_TIPO } from '../lib/metas'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const RECEITA = ler('lib/previsao-receita.ts')
const CALCULO = ler('lib/previsao-calculo.ts')
const PREVISAO = ler('lib/previsao.ts')

const semComentarios = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

/* ========================================================================= *
 * OS SEIS COMPONENTES
 * ========================================================================= */

test('a composicao tem os SEIS componentes, nesta ordem', () => {
  assert.deepEqual([...COMPONENTES_RECEITA_PREVISTA], [
    'MRR_PROJETADO',
    'META_TARIFARIA',
    'META_LANCAMENTOS_WL_BAAS',
    'META_SERVICOS',
    'META_SETUP',
    'RECEITAS_LANCADAS',
  ])
})

test('todo componente tem rotulo e sabe de qual meta vem', () => {
  for (const c of COMPONENTES_RECEITA_PREVISTA) {
    assert.ok(COMPONENTE_RECEITA_LABEL[c], `${c} sem rotulo`)
    assert.ok(c in META_DO_COMPONENTE, `${c} sem origem declarada`)
  }
  // Os dois que NAO sao meta.
  assert.equal(META_DO_COMPONENTE.MRR_PROJETADO, null)
  assert.equal(META_DO_COMPONENTE.RECEITAS_LANCADAS, null)
  // E os quatro que sao.
  assert.equal(META_DO_COMPONENTE.META_TARIFARIA, 'RECEITA_TARIFARIA')
  assert.equal(META_DO_COMPONENTE.META_LANCAMENTOS_WL_BAAS, 'RECEITA_LANCAMENTOS_WL_BAAS')
  assert.equal(META_DO_COMPONENTE.META_SERVICOS, 'RECEITA_SERVICOS')
  assert.equal(META_DO_COMPONENTE.META_SETUP, 'RECEITA_SETUP')
})

test('os quatro tipos de meta da composicao EXISTEM no cadastro de Metas', () => {
  /**
   * Sem isto, a Previsão somaria uma meta que ninguém consegue cadastrar: o
   * componente apareceria sempre como "sem fonte no período" e ninguém saberia
   * por quê.
   */
  for (const c of COMPONENTES_RECEITA_PREVISTA) {
    const tipo = META_DO_COMPONENTE[c]
    if (!tipo) continue
    assert.ok(
      (META_TIPOS as readonly string[]).includes(tipo),
      `${tipo} alimenta a Previsao mas nao e oferecido na criacao de metas`,
    )
    assert.ok(META_TIPO_LABEL[tipo], `${tipo} sem rotulo em Metas`)
  }
})

test('as tres metas novas sao em VALOR e MAIOR_MELHOR', () => {
  // Uma meta de receita em percentual nao tem o que somar na Previsao, e
  // faturar mais e melhor. O padrao oferecido no formulario reflete isso.
  for (const tipo of ['RECEITA_LANCAMENTOS_WL_BAAS', 'RECEITA_SERVICOS', 'RECEITA_SETUP'] as const) {
    assert.deepEqual(PADRAO_POR_TIPO[tipo], { unidade: 'VALOR', direcao: 'MAIOR_MELHOR' })
  }
})

test('os rotulos das tres metas novas sao os do pedido', () => {
  assert.equal(META_TIPO_LABEL.RECEITA_LANCAMENTOS_WL_BAAS, 'Receita de Lançamentos WL/BaaS')
  assert.equal(META_TIPO_LABEL.RECEITA_SERVICOS, 'Receita de Serviços')
  assert.equal(META_TIPO_LABEL.RECEITA_SETUP, 'Receita de Setup')
})

/* ========================================================================= *
 * O TOTAL
 * ========================================================================= */

/** Um componente de teste, com o mínimo para somar. */
const comp = (chave: string, valor: number): ComponenteReceitaPrevista => ({
  chave: chave as ComponenteReceitaPrevista['chave'],
  label: chave,
  valor,
  origem: '',
  rota: null,
  linhas: [],
  ausente: valor === 0,
})

test('o total e a soma dos componentes, em centavos', () => {
  const total = totalDaComposicao([
    comp('MRR_PROJETADO', 138000),
    comp('META_TARIFARIA', 500000),
    comp('META_LANCAMENTOS_WL_BAAS', 80000),
    comp('META_SERVICOS', 25000),
    comp('META_SETUP', 40000),
    comp('RECEITAS_LANCADAS', 0),
  ])
  assert.equal(total, 783000)
})

test('o total nao acumula erro de float', () => {
  // Seis parcelas com centavos: a soma crua de doubles daria 0,30000000000000004.
  const total = totalDaComposicao([
    comp('MRR_PROJETADO', 0.1),
    comp('META_TARIFARIA', 0.2),
    comp('META_LANCAMENTOS_WL_BAAS', 0),
    comp('META_SERVICOS', 0),
    comp('META_SETUP', 0),
    comp('RECEITAS_LANCADAS', 0),
  ])
  assert.equal(total, 0.3)
})

test('sem linha lancada, o total e EXATAMENTE a formula de cinco termos', () => {
  // O estado de Production: `ReceitaPrevista` esta vazia.
  const cinco = [
    comp('MRR_PROJETADO', 138000),
    comp('META_TARIFARIA', 500000),
    comp('META_LANCAMENTOS_WL_BAAS', 80000),
    comp('META_SERVICOS', 25000),
    comp('META_SETUP', 40000),
  ]
  const comSexto = [...cinco, comp('RECEITAS_LANCADAS', 0)]
  assert.equal(totalDaComposicao(comSexto), totalDaComposicao(cinco))
})

/* ========================================================================= *
 * A NÃO-DUPLICAÇÃO
 * ========================================================================= */

test('NAO existe meta de sustentacao nem de mensalidade de API', () => {
  /**
   * Elas entram pelo MRR PROJETADO, que vem do cadastro. Oferecer uma meta
   * para elas criaria a dupla contagem mais provável desta conta: o mesmo
   * contrato somado uma vez pelo cadastro e outra pela meta.
   */
  for (const tipo of META_TIPOS) {
    assert.ok(!/SUSTENTACAO|SUSTENTAÇÃO/i.test(tipo), `${tipo} duplicaria o MRR`)
    assert.ok(!/MENSALIDADE|API_MENSAL/i.test(tipo), `${tipo} duplicaria o MRR`)
  }
  // E `MRR` como tipo de meta e LEGADO — nao e oferecido.
  assert.ok(!(META_TIPOS as readonly string[]).includes('MRR'))
})

test('o MRR PROJETADO sai de `calcularMrr` — nao de um segundo calculo', () => {
  /**
   * Um segundo cálculo de MRR é como a Previsão e o Cockpit passam a discordar
   * sobre o mesmo número. A composição chama a MESMA função.
   */
  assert.ok(RECEITA.includes("import { calcularMrr } from '@/lib/financeiro'"))
  const sem = semComentarios(RECEITA)
  assert.ok(sem.includes('calcularMrr(p)'))
  // E nao reimplementa a soma das parcelas de sustentacao.
  assert.ok(!sem.includes('sustentacaoVigente'), 'a vigencia foi reimplementada aqui')
  assert.ok(!sem.includes('prisma.condicaoComercial'), 'o MRR foi recalculado por fora')
})

test('as quatro parcelas do MRR projetado sao as do pedido', () => {
  /**
   * MRR PROJETADO = Sustentação BaaS + Sustentação White Label + mensalidades
   * de API da carteira INTEIRA (parceiros + clientes).
   */
  for (const linha of [
    'Sustentação BaaS',
    'Sustentação White Label',
    'Mensalidade de API — parceiros',
    'Mensalidade de API — carteira',
  ]) {
    assert.ok(RECEITA.includes(linha), `a parcela "${linha}" saiu do MRR projetado`)
  }
  // `mensalidadeContaAtiva` fica FORA, como ja ficava em `calcularMrr.total`.
  assert.ok(!RECEITA.includes('mensalidadeContaAtiva'))
})

test('META EM PERCENTUAL e IGNORADA e DECLARADA — nunca somada como valor', () => {
  // Somar "3" (por cento) a um total em milhões seria um erro silencioso. O
  // componente fica de fora e a tela diz que ficou.
  assert.ok(RECEITA.includes("m.unidade !== 'VALOR'"))
  assert.ok(RECEITA.includes('ignoradasPorUnidade'))
  const ui = ler('components/previsao/ComposicaoReceita.tsx')
  assert.ok(ui.includes('ignoradasPorUnidade'))
  assert.ok(ui.includes('percentual'))
})

test('previsao CANCELADA nao entra na composicao', () => {
  // Previsão cancelada não é expectativa — a mesma regra de
  // `receitaPrevistaVsRealizada`.
  assert.ok(RECEITA.includes("status: { not: 'CANCELADO' }"))
})

/* ========================================================================= *
 * A AUDITABILIDADE
 * ========================================================================= */

test('todo componente carrega ORIGEM e ROTA — a navegacao profunda', () => {
  /**
   * "De onde saiu este número?" é a pergunta que o bloco de composição existe
   * para responder. Sem a frase de origem e o link, a receita prevista é um
   * número que ninguém consegue conferir — e um número de planejamento que não
   * se confere não é usado para decidir nada.
   */
  assert.ok(CALCULO.includes('origem: string'))
  assert.ok(CALCULO.includes('rota: string | null'))
  assert.ok(CALCULO.includes('linhas: LinhaOrigemReceita[]'))

  // E as rotas apontam para onde o numero e MANTIDO, nao para a Previsao.
  assert.ok(RECEITA.includes("MRR_PROJETADO: '/dashboard/financeiro/condicoes-baas'"))
  assert.ok(RECEITA.includes("META_TARIFARIA: '/dashboard/metas'"))
  assert.ok(RECEITA.includes("RECEITAS_LANCADAS: '/dashboard/financeiro/previsao/receitas'"))
})

test('AUSENTE nao e ZERO — a tela separa "sem meta" de "meta zero"', () => {
  /**
   * "Não há meta de setup para novembro" e "a meta de setup de novembro é
   * zero" são afirmações diferentes, e só a segunda é uma decisão. Mostrar as
   * duas como R$ 0,00 esconderia o que falta cadastrar.
   */
  assert.ok(CALCULO.includes('ausente: boolean'))
  assert.ok(RECEITA.includes('ausente: valor === undefined'))
  const ui = ler('components/previsao/ComposicaoReceita.tsx')
  assert.ok(ui.includes('c.ausente ? <NoData /> : moedaCheia(c.valor)'))
  assert.ok(ui.includes('Sem fonte no período'))
})

test('a composicao aparece na Visao Geral E nas Receitas Previstas', () => {
  for (const pagina of [
    'app/dashboard/financeiro/previsao/page.tsx',
    'app/dashboard/financeiro/previsao/receitas/page.tsx',
  ]) {
    const fonte = ler(pagina)
    assert.ok(fonte.includes('ComposicaoReceita'), `${pagina} nao mostra a composicao`)
    assert.ok(fonte.includes('composicaoDoMes'), `${pagina} nao resolve a composicao do mes`)
  }
})

/* ========================================================================= *
 * A INTEGRAÇÃO COM O CAIXA
 * ========================================================================= */

test('o previsto da Previsao PASSA a ser a composicao automatica', () => {
  const bloco = PREVISAO.slice(
    PREVISAO.indexOf('export async function receitaPrevistaVsRealizada'),
  )
  assert.ok(bloco.includes('receitaPrevistaCompostaDeVarios(periodos)'))
  assert.ok(bloco.includes('composicao?.total ?? 0'))
})

test('COM FILTRO DE DIMENSAO, a composicao automatica NAO se aplica', () => {
  /**
   * MRR e meta não têm centro de custo, categoria nem fornecedor: sustentação
   * é da carteira inteira e meta é da empresa. Mostrar o MRR total dentro de
   * um recorte de um centro de custo seria falso.
   *
   * Nesse caso o previsto volta a ser a soma das linhas lançadas que casam com
   * o filtro — o comportamento que a função sempre teve.
   */
  assert.ok(PREVISAO.includes('function filtraDimensao(f: FiltroPrevisao): boolean'))
  const f = PREVISAO.slice(
    PREVISAO.indexOf('function filtraDimensao'),
    PREVISAO.indexOf('function filtraDimensao') + 400,
  )
  for (const campo of ['centroCustoId', 'categoriaId', 'fornecedorId', 'condicaoId']) {
    assert.ok(f.includes(campo), `${campo} deixou de ser considerado um recorte`)
  }
  // Periodo e janela NAO contam: escolhem QUANDO, nao O QUE.
  assert.ok(!f.includes('f.periodo'))
  assert.ok(!f.includes('f.meses'))
})

test('a receita prevista continua entrando no caixa pelo REMANESCENTE', () => {
  /**
   * A porta de dupla contagem que a rodada passada fechou continua fechada: é
   * `previsto − realizado` (nunca negativo) que entra na projeção, não o
   * previsto cheio. Trocar a FONTE do previsto não podia reabrir essa porta.
   */
  const caixa = PREVISAO.slice(
    PREVISAO.indexOf('export async function fluxoDeCaixa'),
    PREVISAO.indexOf('export interface ForecastPrevisao'),
  )
  assert.ok(caixa.includes('m.entradasPrevistas += r.remanescente'))
  assert.ok(!caixa.includes('m.entradasPrevistas += r.previsto'))
})

test('a Previsao continua sem somar ContaReceber nem saldoEmConta', () => {
  // As outras duas portas de dupla contagem. Trocar a fonte do previsto nao
  // podia reabrir nenhuma delas.
  const sem = semComentarios(PREVISAO) + semComentarios(RECEITA)
  assert.ok(!sem.includes('prisma.contaReceber'))
  assert.ok(!sem.includes('saldoEmConta'))
})

/* ========================================================================= *
 * O MÓDULO PURO CONTINUA PURO
 * ========================================================================= */

test('`previsao-calculo` NAO importa Prisma — o bundle do cliente depende disso', () => {
  /**
   * Os componentes de cliente importam os rótulos DESTE módulo. Se ele puxar
   * `lib/prisma`, o `pg` entra no bundle do navegador e o build quebra com
   * "Module not found: Can't resolve 'fs'" — que `tsc` não pega.
   */
  assert.ok(!CALCULO.includes("from '@/lib/prisma'"))
  assert.ok(!CALCULO.includes('prisma.'))

  // E o componente de UI importa do modulo PURO.
  const ui = ler('components/previsao/ComposicaoReceita.tsx')
  assert.ok(ui.includes("from '@/lib/previsao-calculo'"))
  assert.ok(!ui.includes("from '@/lib/previsao-receita'"))
})
