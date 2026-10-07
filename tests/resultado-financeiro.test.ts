/**
 * APURAÇÃO DO RESULTADO — a apuração BaaS conta uma vez, pelos dois lados.
 *
 * ── AS DUAS REGRAS (v28) ─────────────────────────────────────────────────
 *
 * 1. RECEITA = receitas lançadas, apuração BaaS INTEGRAL incluída, contada
 *    UMA VEZ.
 *
 *    O Lançamento BaaS gera três registros, e só um é receita: o
 *    `LancamentoFinanceiro` de tipo RECEITA, que vale o saldo integral
 *    apurado. O título a receber é outra coisa — o que se COBRA do parceiro —,
 *    numa tabela diferente. Como a apuração soma `LancamentoFinanceiro` e
 *    nunca olha `ContaReceber`, há uma origem única: a dupla contagem é
 *    impossível por construção, não evitada por uma verificação que alguém
 *    poderia remover.
 *
 * 2. DESPESA INCLUI a comissão devida ao parceiro.
 *
 *    O saldo apurado estava na conta da Bass Pago e entra integral como
 *    receita; a comissão sai do caixa dela e é despesa como qualquer outra.
 *    Receita e despesa mudaram JUNTAS, e o resultado é o mesmo de antes — o
 *    que mudou é que ele deixou de ser uma receita líquida e passou a ser a
 *    diferença entre dois números brutos.
 *
 *    Até a v27 era o contrário: a receita era a margem e a comissão era
 *    excluída da despesa por um filtro (`SEM_REPASSE_BAAS`). O filtro saiu, e
 *    estes testes são o que impede que ele volte sozinho — ter os dois ao
 *    mesmo tempo (receita bruta E comissão excluída) mostraria um lucro
 *    quádruplo do real.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  calcular, receitaBaas, despesaBaas, resultadoBaas,
} from '../lib/lancamento-baas'

const ler = (p: string) => readFileSync(p, 'utf8')

/**
 * As PAGINAS DE SERVIDOR do produto — todo `page.tsx` sem `'use client'`.
 *
 * E a lista que importa para a fronteira RSC: e daqui que uma funcao passada
 * como prop derruba a tela inteira em tempo de requisicao.
 */
function paginasDeServidor(): string[] {
  const achar = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const caminho = join(dir, e.name)
      if (e.isDirectory()) return achar(caminho)
      return e.name === 'page.tsx' && !ler(caminho).startsWith("'use client'") ? [caminho] : []
    })
  return achar('app')
}

/** Os formatadores de string — os que viajariam como funcao se passados. */
const FORMATADORES = [
  'moedaCheia', 'quantidadeCompacta', 'percentual', 'eixoMoeda',
  'figuraMoeda', 'figuraQuantidade', 'figuraPercentual', 'figuraContagem',
]
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

test('a comissao e identificada pela FK, nao pelo nome da categoria', () => {
  // Categoria se renomeia na tela de Categorias — e ja foi renomeada ("Repasse
  // a Cliente BaaS" virou "BaaS"). Um filtro por nome quebraria em silencio.
  assert.ok(
    FIN.includes("const SO_COMISSAO_BAAS = { baasContaPagar: { isNot: null } }"),
    'o marcador da comissao deixou de usar o vinculo',
  )
  const apuracao = corpoDaFuncao(FIN, 'resultadoDoPeriodo')
  for (const nome of ['Repasse a Cliente BaaS', "nome: 'BaaS'", 'categoria.nome']) {
    assert.ok(!apuracao.includes(nome), `a apuracao passou a depender do nome: ${nome}`)
  }
})

test('o FILTRO QUE EXCLUIA a comissao da despesa NAO VOLTOU', () => {
  // ESTE E O TESTE CENTRAL DA v28.
  //
  // `SEM_REPASSE_BAAS = { baasContaPagar: null }` era aplicado ao Resultado, ao
  // gasto por categoria e a serie de 12 meses. Ele fazia sentido enquanto a
  // receita BaaS era a MARGEM (25 mil): excluir a comissao mantinha a conta
  // coerente.
  //
  // Com a receita BRUTA (100 mil), o mesmo filtro passa a ser um defeito
  // grave: 100 mil de receita sem os 75 mil de comissao mostram um lucro
  // quadruplo do real. Os dois lados tem de mudar juntos, sempre.
  // Sobre o CODIGO, nao sobre os comentarios: a documentacao de
  // `lib/financeiro.ts` CITA `SEM_REPASSE_BAAS` para explicar o que saiu e por
  // que, e varrer o arquivo inteiro acusaria a propria explicacao como se
  // fosse o defeito voltando.
  assert.ok(
    !semComentarios(FIN).includes('SEM_REPASSE_BAAS'),
    'o filtro que excluia a comissao da despesa voltou — com a receita bruta, '
    + 'ele quadruplica o resultado',
  )
})

test('o Resultado INCLUI a comissao na despesa', () => {
  const apuracao = corpoDaFuncao(FIN, 'resultadoDoPeriodo')
  // A agregacao por tipo roda sobre a janela CRUA, sem recorte de comissao.
  assert.ok(
    apuracao.includes('where: janela,'),
    'a despesa do periodo voltou a ser filtrada',
  )
  // E a comissao e devolvida para a tela poder ABRIR o total — nao para
  // esconde-la dele.
  assert.ok(apuracao.includes('comissaoBaas:'), 'a comissao deixou de ser devolvida')
})

test('a SERIE de 12 meses usa a MESMA regra do KPI', () => {
  // Sem isto, o grafico mostraria uma despesa que o indicador logo acima nao
  // mostra — e os dois discordariam na mesma tela.
  const evolucao = corpoDaFuncao(FIN, 'evolucaoFinanceira')
  assert.ok(!evolucao.includes('SEM_REPASSE_BAAS'), 'a serie divergiu do KPI')
  assert.ok(
    !evolucao.includes('baasContaPagar'),
    'a serie voltou a recortar a comissao',
  )
})

test('o GASTO POR CATEGORIA fecha com o total de Despesas', () => {
  // E a decomposicao da despesa: EXCLUIR a comissao faria as fatias somarem
  // MENOS que o total mostrado dois tiles ao lado. Um grafico que nao fecha
  // com o seu proprio KPI e pior que um grafico ausente — e a direcao do erro
  // inverteu na v28, porque o total passou a incluir a comissao.
  const gasto = corpoDaFuncao(FIN, 'gastoPorCategoria')
  assert.ok(!gasto.includes('SEM_REPASSE_BAAS'), 'a decomposicao nao fecha com o KPI')
  assert.ok(!gasto.includes('baasContaPagar'), 'a decomposicao voltou a recortar a comissao')
})

test('CONTAS A PAGAR continua mostrando a comissao — e la que ela e paga', () => {
  const pagar = corpoDaFuncao(FIN, 'contasAPagar')
  assert.ok(
    !pagar.includes('SEM_REPASSE_BAAS') && !pagar.includes('baasContaPagar'),
    'a comissao sumiu de Contas a Pagar — o parceiro nao teria como ser pago',
  )
})

test('a apuracao NUNCA soma ContaReceber — e a origem unica da receita', () => {
  // `ContaReceber` e o mesmo dinheiro visto como cobranca. Soma-lo seria
  // contar a tarifa BaaS duas vezes.
  const apuracao = corpoDaFuncao(FIN, 'resultadoDoPeriodo')
  assert.ok(!apuracao.includes('contaReceber'), 'a apuracao passou a somar titulos a receber')
  assert.ok(apuracao.includes('lancamentoFinanceiro'), 'a apuracao perdeu a sua fonte')
})

test('a receita do lancamento BaaS e UM valor, nao dois', () => {
  const c = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_650 }], 25)

  // O lançamento financeiro vale o saldo INTEGRAL apurado; o título a receber
  // cobra as tarifas. Somar os dois seria contar o mesmo período duas vezes.
  assert.equal(receitaBaas(c), 100_000)
  assert.notEqual(receitaBaas(c), receitaBaas(c) + c.totalTarifas)

  // A comissão do parceiro não é receita de ninguém: é despesa.
  assert.equal(despesaBaas(c), c.valorCliente)
  assert.notEqual(receitaBaas(c), despesaBaas(c))

  // E o resultado é a diferença — o mesmo número da regra anterior.
  assert.equal(resultadoBaas(c), 32_548.75)
})

test('RECEITA BRUTA e COMISSAO so fecham o resultado JUNTAS', () => {
  // O exemplo exato da especificacao.
  //
  //   saldo apurado     100.000
  //   tarifas            10.000
  //   overprice          15.000   (16,666…% de 90.000)
  //   comissao BaaS      75.000
  //
  //   Receita   100.000
  //   Despesa    75.000
  //   Resultado  25.000
  const c = calcular(100_000, [{ nome: 'Tarifas', preco: 10_000, volume: 1 }], 100 / 6)

  assert.equal(c.totalTarifas, 10_000)
  assert.equal(c.saldoRemanescente, 90_000)
  assert.equal(c.overpriceValor, 15_000)
  assert.equal(c.valorCliente, 75_000)

  assert.equal(receitaBaas(c), 100_000)
  assert.equal(despesaBaas(c), 75_000)
  assert.equal(resultadoBaas(c), 25_000)

  // O PERIGO: receita bruta com a comissao excluida da despesa. Era o estado
  // intermediario em que a v28 cairia se so metade da mudanca tivesse sido
  // feita, e o resultado sairia quadruplo.
  const resultadoErrado = receitaBaas(c) - 0
  assert.equal(resultadoErrado, 100_000)
  assert.notEqual(resultadoErrado, resultadoBaas(c))
})

test('RESULTADO = RECEITAS − DESPESAS, e nada mais', () => {
  const apuracao = corpoDaFuncao(FIN, 'resultadoDoPeriodo')
  assert.ok(apuracao.includes('resultado: receita - despesa'), 'a formula do resultado mudou')
})

/* ========================================================================= *
 * A REGRA FICA ESCRITA NA TELA
 * ========================================================================= */

test('a tela declara a REGRA NOVA, e nao a antiga', () => {
  // A frase antiga afirmava o contrario do que o sistema passou a fazer.
  // Deixa-la na tela seria pior que nao ter frase nenhuma.
  assert.ok(
    !PAGINA.includes('Pagamentos para os BaaS não são contabilizados como despesas.'),
    'a tela ainda afirma a regra revogada',
  )
  assert.ok(
    PAGINA.includes('comissão devida ao')
    && PAGINA.includes('contabilizada como despesa'),
    'a tela nao declara que a comissao e despesa',
  )
})

test('a tela declara o que entra em cada tile', () => {
  assert.ok(
    PAGINA.includes('apuração BaaS integral incluída'),
    'Receitas nao diz que inclui a apuracao integral',
  )
  assert.ok(
    PAGINA.includes('comissão BaaS incluída'),
    'Despesas nao diz que inclui a comissao',
  )
  assert.ok(!PAGINA.includes('sem repasse a BaaS'), 'o rotulo da regra antiga ficou')
})

test('a comissao INCLUIDA e aberta, nao apenas somada em silencio', () => {
  // Num mes com apuracao de parceiro a comissao e quase toda a despesa. Quem
  // ve so o total nao sabe se e custo operacional ou repasse — e a resposta
  // muda completamente a leitura do mes.
  assert.ok(FIN.includes('comissaoBaas'), 'a comissao deixou de ser devolvida')
  assert.ok(PAGINA.includes('resultado.comissaoBaas'), 'a tela nao abre a comissao')
  assert.ok(!PAGINA.includes('repasseBaas'), 'o campo antigo sobreviveu na tela')
})

/* ========================================================================= *
 * A VISÃO GERAL COMERCIAL — zero valor monetário
 * ========================================================================= */

test('o Donut EXIGE o formato — sem default de moeda', () => {
  // O default `moedaCheia` era o bug: a Visao geral reusou a peca para
  // CONTAGEM e 12 cards sairam como "R$ 12,00". Sem default, a proxima tela e
  // obrigada a dizer a unidade.
  const donut = ler('components/financeiro/FinanceiroCharts.tsx')
  assert.ok(donut.includes('formato: FormatoValor'), 'o formato do Donut voltou a ser opcional')
  assert.ok(!/formato\s*[:=]\s*FormatoValor\s*=/.test(donut), 'o Donut ganhou default de formato')
  assert.ok(!donut.includes('formatar = moedaCheia'), 'o default de moeda voltou ao Donut')
  // O conjunto e fechado: nenhuma tela inventa formatacao propria.
  assert.ok(
    donut.includes("export type FormatoValor = 'moeda' | 'quantidade'"),
    'o conjunto de formatos deixou de ser fechado',
  )
})

test('o Donut atravessa a fronteira RSC — formato por NOME, nunca por funcao', () => {
  // ESTE E O DEFEITO QUE DERRUBAVA A VISAO GERAL FINANCEIRA EM PRODUCAO.
  //
  // A exigencia do formatador nasceu como `formatar: (n) => string`. O Donut e
  // Client Component e a Visao Geral Financeira e Server Component: funcao nao
  // atravessa essa fronteira. O React recusava a serializacao com "Functions
  // cannot be passed directly to Client Components" e a tela inteira caia no
  // error boundary, em TODA requisicao — com o banco e o calculo intactos.
  //
  // Os testes de unidade nao viam nada: eles exercitam `lib/financeiro.ts`,
  // que sempre esteve certo. `tsc` tambem nao, porque passar funcao como prop
  // e TypeScript valido. So a renderizacao reclamava. Por isso a barreira
  // aqui e ESTRUTURAL, e nao sobre o calculo.
  const donut = ler('components/financeiro/FinanceiroCharts.tsx')
  assert.ok(
    !/\bformatar\s*:\s*\(n: number\) => string/.test(donut),
    'o Donut voltou a pedir uma FUNCAO — Server Component nao consegue passar',
  )

  // Nenhuma PAGINA de servidor pode passar funcao a um componente de cliente.
  for (const pagina of paginasDeServidor()) {
    const texto = semComentarios(ler(pagina))
    const props = texto.match(/\b[a-zA-Z]+=\{[^}]*\}/g) ?? []
    for (const prop of props) {
      assert.ok(
        !/=\{\s*\(?[\w\s,]*\)?\s*=>/.test(prop),
        `${pagina} passa funcao inline a componente de cliente: ${prop.slice(0, 60)}`,
      )
      // `prop={identificador}` onde o identificador e um formatador importado:
      // e exatamente a forma que quebrou.
      const nome = prop.match(/=\{\s*([A-Za-z_$][\w$]*)\s*\}/)?.[1]
      assert.ok(
        !(nome && FORMATADORES.includes(nome)),
        `${pagina} passa o formatador ${nome} como funcao — use o nome do formato`,
      )
    }
  }
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
  assert.ok(crm.includes('formato="quantidade"'), 'o donut do Comercial perdeu a unidade')
  assert.ok(crm.includes('rotuloValor="Cards"'), '"Valor" voltou a rotular a contagem')
})

test('a legenda do Donut obedece ao formato, como o miolo e o tooltip', () => {
  // A legenda chamava `figuraMoeda` na mao: num donut de CONTAGEM o miolo
  // dizia "12" e a linha ao lado dizia "R$ 12,00" sobre o mesmo numero. Era o
  // default de moeda sobrevivendo num canto depois de ter sido removido.
  // Só o CODIGO: o comentario da peca cita `figuraMoeda` como o que saiu.
  const donut = semComentarios(ler('components/financeiro/FinanceiroCharts.tsx'))
  assert.ok(!donut.includes('figuraMoeda'), 'a legenda do Donut voltou a escrever moeda na mao')
})
