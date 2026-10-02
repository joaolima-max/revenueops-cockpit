/**
 * APURAÇÃO DO RESULTADO — a tarifa BaaS conta uma vez, o repasse não conta.
 *
 * ── AS DUAS REGRAS ───────────────────────────────────────────────────────
 *
 * 1. RECEITA = receitas lançadas, tarifas BaaS incluídas, contadas UMA VEZ.
 *
 *    O Lançamento BaaS gera três registros, e só um é receita: o
 *    `LancamentoFinanceiro` de tipo RECEITA. O título a receber é o MESMO
 *    dinheiro visto como cobrança, em outra tabela. Como a apuração soma
 *    `LancamentoFinanceiro` e nunca olha `ContaReceber`, há uma origem única —
 *    a dupla contagem é impossível por construção, não evitada por uma
 *    verificação que alguém poderia remover.
 *
 * 2. DESPESA não inclui o repasse ao parceiro.
 *
 *    O residual devido ao BaaS/White Label existe como despesa porque é assim
 *    que Contas a Pagar o controla — e lá tem de continuar aparecendo. Mas o
 *    saldo da conta do parceiro nunca foi receita nossa, e devolvê-lo não é
 *    custo: somá-lo subtrairia do resultado um dinheiro que nunca entrou.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { calcular, receitaBassPago } from '../lib/lancamento-baas'

const ler = (p: string) => readFileSync(p, 'utf8')
const FIN = ler('lib/financeiro.ts')
const PAGINA = ler('app/dashboard/financeiro/page.tsx')

/**
 * O corpo de UMA função exportada.
 *
 * Fatiar "do nome até o fim do arquivo" fazia o teste ler funções vizinhas e
 * acusar como defeito um filtro que estava no lugar certo — foi o que
 * aconteceu com `contasAPagar`, que recebeu a culpa pelo filtro de
 * `evolucaoFinanceira`, oitenta linhas abaixo.
 */
function corpoDaFuncao(txt: string, nome: string): string {
  const ini = txt.indexOf(`export async function ${nome}`) >= 0
    ? txt.indexOf(`export async function ${nome}`)
    : txt.indexOf(`export function ${nome}`)
  assert.ok(ini >= 0, `funcao ${nome} nao encontrada`)
  // A próxima declaração de topo encerra o corpo.
  const resto = txt.slice(ini + 1)
  const prox = resto.search(/\nexport (async function|function|interface|const|type)/)
  return prox < 0 ? txt.slice(ini) : txt.slice(ini, ini + 1 + prox)
}

/**
 * O arquivo sem comentários — de linha, de bloco e de JSX.
 *
 * Eles explicam a regra e CITAM o que foi removido ("mostraria R$ 12,00 para
 * 12 leads"), então um teste que varre o arquivo inteiro acusa a própria
 * explicação como se fosse o defeito voltando. Blocos têm de sair inteiros:
 * filtrar linha por linha deixa passar as linhas do meio de um `{/* … *\/}`
 * de três linhas.
 */
const semComentarios = (txt: string) =>
  txt
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/* ========================================================================= *
 * O FILTRO — pelo VÍNCULO, nunca pelo nome da categoria
 * ========================================================================= */

test('o repasse e identificado pela FK, nao pelo nome da categoria', () => {
  // Categoria se renomeia na tela de Categorias — e foi renomeada nesta
  // rodada ("Repasse a Cliente BaaS" → "BaaS"). Um filtro por nome quebraria
  // em silencio e voltaria a subtrair o repasse do Resultado.
  assert.ok(
    FIN.includes('const SEM_REPASSE_BAAS = { baasContaPagar: null }'),
    'o filtro do repasse deixou de usar o vinculo',
  )
  const apuracao = corpoDaFuncao(FIN, 'resultadoDoPeriodo')
  for (const nome of ['Repasse a Cliente BaaS', "nome: 'BaaS'", 'categoria.nome']) {
    assert.ok(!apuracao.includes(nome), `a apuracao passou a depender do nome: ${nome}`)
  }
})

test('o Resultado EXCLUI o repasse da despesa', () => {
  const apuracao = corpoDaFuncao(FIN, 'resultadoDoPeriodo')
  assert.ok(apuracao.includes('...SEM_REPASSE_BAAS'), 'o repasse voltou para a despesa')
})

test('a SERIE de 12 meses usa a MESMA regra do KPI', () => {
  // Sem isto, o grafico contaria uma despesa que o indicador logo acima nao
  // conta — e os dois discordariam na mesma tela.
  const evolucao = corpoDaFuncao(FIN, 'evolucaoFinanceira')
  assert.ok(evolucao.includes('...SEM_REPASSE_BAAS'), 'a serie divergiu do KPI')
})

test('o GASTO POR CATEGORIA fecha com o total de Despesas', () => {
  // E a decomposicao da despesa: incluir o repasse faria as fatias somarem
  // mais que o total mostrado dois tiles ao lado.
  const gasto = corpoDaFuncao(FIN, 'gastoPorCategoria')
  assert.ok(gasto.includes('...SEM_REPASSE_BAAS'), 'a decomposicao nao fecha com o KPI')
})

test('CONTAS A PAGAR continua mostrando o repasse — e la que ele e pago', () => {
  const pagar = corpoDaFuncao(FIN, 'contasAPagar')
  assert.ok(
    !pagar.includes('SEM_REPASSE_BAAS'),
    'o repasse sumiu de Contas a Pagar — o parceiro nao teria como ser pago',
  )
})

/* ========================================================================= *
 * A RECEITA BAAS CONTA UMA VEZ
 * ========================================================================= */

test('a apuracao NUNCA soma ContaReceber — e a origem unica da receita', () => {
  // `ContaReceber` e o mesmo dinheiro visto como cobranca. Soma-lo seria
  // contar a tarifa BaaS duas vezes.
  const apuracao = corpoDaFuncao(FIN, 'resultadoDoPeriodo')
  assert.ok(!apuracao.includes('contaReceber'), 'a apuracao passou a somar titulos a receber')
  assert.ok(apuracao.includes('lancamentoFinanceiro'), 'a apuracao perdeu a sua fonte')
})

test('a receita do lancamento BaaS e UM valor, nao dois', () => {
  const c = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_650 }], 25)
  const receita = receitaBassPago(c)

  // O lançamento financeiro vale a receita inteira; o título cobra as tarifas.
  // Somar os dois seria contar o mesmo período duas vezes.
  assert.equal(receita, 32_548.75)
  assert.notEqual(receita, receita + c.totalTarifas)

  // E o residual não é receita de ninguém.
  assert.notEqual(receita, c.valorCliente)
})

test('RESULTADO = RECEITAS − DESPESAS, e nada mais', () => {
  const apuracao = corpoDaFuncao(FIN, 'resultadoDoPeriodo')
  assert.ok(apuracao.includes('resultado: receita - despesa'), 'a formula do resultado mudou')
})

/* ========================================================================= *
 * A REGRA FICA ESCRITA NA TELA
 * ========================================================================= */

test('o Resultado traz o subtitulo EXATO pedido', () => {
  assert.ok(
    PAGINA.includes('Pagamentos para os BaaS não são contabilizados como despesas.'),
    'o subtitulo do Resultado saiu da tela',
  )
})

test('a tela declara o que entra em cada tile', () => {
  assert.ok(PAGINA.includes('tarifas BaaS incluídas'), 'Receitas nao diz que inclui as tarifas')
  assert.ok(PAGINA.includes('sem repasse a BaaS'), 'Despesas nao diz o que ficou de fora')
})

test('o valor EXCLUIDO e informado, nao apenas omitido', () => {
  // Quem somasse Contas a Pagar a mao encontraria uma diferenca e concluiria
  // que o painel esta errado.
  assert.ok(FIN.includes('repasseBaas'), 'o valor excluido deixou de ser devolvido')
  assert.ok(PAGINA.includes('resultado.repasseBaas'), 'a tela nao declara o valor excluido')
  assert.ok(PAGINA.includes('continua em Contas a Pagar'), 'a tela nao diz onde o valor ficou')
})

/* ========================================================================= *
 * A VISÃO GERAL COMERCIAL — zero valor monetário
 * ========================================================================= */

test('o Donut EXIGE formatador — sem default de moeda', () => {
  // O default `moedaCheia` era o bug: a Visao geral reusou a peca para
  // CONTAGEM e 12 cards sairam como "R$ 12,00". Sem default, a proxima tela e
  // obrigada a dizer a unidade.
  const donut = ler('components/financeiro/FinanceiroCharts.tsx')
  assert.ok(
    donut.includes('formatar: (n: number) => string'),
    'o formatador do Donut voltou a ser opcional',
  )
  assert.ok(
    !donut.includes('formatar = moedaCheia'),
    'o default de moeda voltou ao Donut',
  )
})

test('a Visao geral do Comercial nao usa NENHUM formatador monetario', () => {
  // So o CODIGO: um comentario da tela explica por que o donut precisou de
  // formatador, e cita "R$ 12,00" como o sintoma que foi corrigido.
  const crm = semComentarios(ler('app/dashboard/crm/CrmClient.tsx'))
  for (const proibido of ['moedaCheia', 'figuraMoeda', 'eixoMoeda', 'R$']) {
    assert.ok(!crm.includes(proibido), `valor monetario na Visao geral: ${proibido}`)
  }
})

test('a API e a analitica do Comercial nao expoem valor de card', () => {
  // `Deal.value` e legado e nao e cadastrado nem exibido desde a remocao do
  // valor do card.
  for (const f of ['app/api/crm/route.ts', 'lib/crm.ts']) {
    const t = ler(f)
    assert.ok(!/\bvalue\b\s*:/.test(t), `${f} voltou a expor valor de card`)
    assert.ok(!t.includes('moedaCheia'), `${f} formata moeda`)
  }
})

test('o Donut do Comercial formata CONTAGEM', () => {
  const crm = ler('app/dashboard/crm/CrmClient.tsx')
  assert.ok(crm.includes('formatar={quantidadeCompacta}'), 'o donut do Comercial perdeu a unidade')
  assert.ok(crm.includes('rotuloValor="Cards"'), '"Valor" voltou a rotular a contagem')
})
