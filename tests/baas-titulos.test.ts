/**
 * LANÇAMENTO BAAS → LANÇAMENTOS → CONTAS A RECEBER → CONTAS A PAGAR.
 *
 * `gerarTitulos` fala com o Prisma, então o que se testa aqui é a ARITMÉTICA
 * e a REGRA DE DEVEDOR que decidem o conteúdo dos três registros — as duas
 * coisas que, se erradas, produzem título com o valor errado ou sem dono.
 *
 * ── O BUG QUE ESTES TESTES TRAVAM ────────────────────────────────────────
 *
 * O título a receber não nascia. `ContaReceber.clienteId` era NOT NULL e a
 * geração só criava o AR quando o número da conta casava com um `Cliente` —
 * mas a receita das tarifas é devida pelo PARCEIRO, e parceiro não é Cliente:
 * mora em `CondicaoComercial`. Resultado: o primeiro lançamento de teste
 * gerou Lançamento e Contas a Pagar, e nenhum título a receber.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  calcular, receitaBaas, despesaBaas, resultadoBaas, centavos,
} from '../lib/lancamento-baas'

const ler = (p: string) => readFileSync(p, 'utf8')
import { devedorDoTitulo, CATEGORIA_RECEITA_BAAS, CATEGORIA_DESPESA_BAAS } from '../lib/baas-titulos'

/* ========================================================================= *
 * O CENÁRIO DO §7, com os números exatos
 * ========================================================================= */

const CENARIO = calcular(100_000, [
  { nome: 'PIX', preco: 0.10, volume: 100_000 },  // 10.000,00
  { nome: 'KYC', preco: 6.50, volume: 10 },       //      65,00
], 25)

test('§7: a cascata produz os seis numeros da especificacao', () => {
  assert.equal(CENARIO.saldoInicial, 100_000)
  assert.equal(CENARIO.totalTarifas, 10_065)
  assert.equal(CENARIO.saldoRemanescente, 89_935)
  assert.equal(CENARIO.overpricePercent, 25)
  assert.equal(CENARIO.overpriceValor, 22_483.75)
  assert.equal(CENARIO.valorCliente, 67_451.25)
})

test('§12: CONTAS A RECEBER = R$ 100.000,00 — espelha a RECEITA', () => {
  /**
   * v28 — o titulo vale o saldo INTEGRAL apurado, igual a receita.
   *
   * Ate a v27 ele valia so as tarifas (10.065), porque a receita era a margem.
   * Com a receita bruta, a assimetria deixou de ter sentido: um titulo de 10
   * mil ao lado de uma receita de 100 mil obrigaria quem confere a somar os
   * dois lados a mao para descobrir que a diferenca era o overprice.
   *
   * E NAO cria dupla contagem: nem `lib/financeiro.ts` nem `lib/previsao.ts`
   * leem `ContaReceber` para apurar receita, resultado ou caixa.
   */
  assert.equal(receitaBaas(CENARIO), 100_000)
  // E o valor das TARIFAS continua existindo — no detalhe da cascata, nao no
  // titulo.
  assert.equal(CENARIO.totalTarifas, 10_065)
})

test('§12: CONTAS A PAGAR = R$ 67.451,25 — o residual do parceiro', () => {
  assert.equal(CENARIO.valorCliente, 67_451.25)
})

test('§12: NAO INVERTER — o AR e o MAIOR, o AP e o menor', () => {
  // A troca dos dois seria silenciosa: os numeros existem e a soma nao fecha
  // com nada visivel. Este teste e o que a pega.
  //
  // A DIRECAO INVERTEU na v28: enquanto o AR eram as tarifas (10.065) ele era
  // o menor; agora que espelha a receita (100.000), ele e o maior. O teste
  // acompanha o fato, em vez de preservar a comparacao antiga.
  assert.ok(receitaBaas(CENARIO) > despesaBaas(CENARIO))
  assert.notEqual(receitaBaas(CENARIO), despesaBaas(CENARIO))
})

test('§12: NAO SOMAR os dois como uma receita unica', () => {
  // AR + AP = 77.516,25, que nao e receita nenhuma: e a soma de uma cobranca
  // com uma divida. A receita da Bass Pago e o saldo integral apurado.
  const somaErrada = centavos(CENARIO.totalTarifas + CENARIO.valorCliente)
  assert.equal(somaErrada, 77_516.25)
  assert.notEqual(somaErrada, receitaBaas(CENARIO))
  assert.notEqual(somaErrada, resultadoBaas(CENARIO))
})

test('LANCAMENTOS registra a RECEITA: o saldo INTEGRAL apurado', () => {
  // v28: a receita deixou de ser a margem (tarifas + overprice) e passou a ser
  // o saldo inteiro — ele estava na conta da Bass Pago, e e dela que sai o
  // pagamento ao parceiro.
  assert.equal(receitaBaas(CENARIO), CENARIO.saldoInicial)
  assert.equal(receitaBaas(CENARIO), 100_000)

  // A DESPESA e a comissao do parceiro.
  assert.equal(despesaBaas(CENARIO), CENARIO.valorCliente)

  // E o RESULTADO continua sendo tarifas + overprice — o numero nao mudou,
  // mudou a forma de chegar nele.
  assert.equal(resultadoBaas(CENARIO), 32_548.75)
  assert.equal(
    resultadoBaas(CENARIO),
    centavos(CENARIO.totalTarifas + CENARIO.overpriceValor),
  )
})

test('o TITULO A RECEBER ESPELHA a receita, e o codigo garante isso', () => {
  // Nao e so o valor: a geracao usa a MESMA variavel para os dois registros,
  // entao eles nao podem divergir por descuido.
  const t = ler('lib/baas-titulos.ts')
  assert.ok(
    t.includes('const receita = centavos(d.receita)'),
    'a receita deixou de ser uma variavel unica',
  )
  // O lancamento de receita e o titulo leem a MESMA variavel.
  assert.ok(t.includes('valor: receita,'), 'o titulo deixou de espelhar a receita')
  assert.equal(
    (t.match(/valor: receita,/g) ?? []).length, 2,
    'a receita e o titulo deixaram de compartilhar o valor',
  )
  // E `tarifas` nao e mais parametro: campo nao lido volta a ser preenchido errado.
  assert.ok(!t.includes('d.tarifas'), 'o parametro `tarifas` voltou')
})

test('tarifas + overprice + residual = saldo informado', () => {
  // A identidade que fecha a cascata: o saldo do parceiro se reparte em
  // cobranca, retencao e devolucao, sem sobra.
  assert.equal(
    centavos(CENARIO.totalTarifas + CENARIO.overpriceValor + CENARIO.valorCliente),
    100_000,
  )
})

test('o AR NAO inclui mensalidade nem nada fora do lancamento', () => {
  // A fonte do valor e o proprio calculo. Se o AR passasse a somar
  // mensalidade de API ou sustentacao, seria dupla contagem: essas parcelas
  // tem lugar proprio no MRR.
  assert.equal(
    CENARIO.totalTarifas,
    centavos(CENARIO.itens.reduce((a, i) => a + i.total, 0)),
    'o AR deixou de ser a soma pura dos produtos tarifados',
  )
})

/* ========================================================================= *
 * O DEVEDOR DO TÍTULO A RECEBER
 * ========================================================================= */

test('sem cliente de carteira, o devedor e o PARCEIRO', () => {
  // O caso normal: a conta e do parceiro, nao de um cliente cadastrado. Era
  // aqui que o titulo deixava de nascer.
  const d = devedorDoTitulo(null, 'cond-1')
  assert.equal(d.clienteId, null)
  assert.equal(d.condicaoId, 'cond-1')
})

test('com cliente de carteira, o devedor e o CLIENTE', () => {
  const d = devedorDoTitulo('cli-1', 'cond-1')
  assert.equal(d.clienteId, 'cli-1')
  assert.equal(d.condicaoId, null, 'os dois juntos seriam duas cobrancas')
})

test('EXATAMENTE UM devedor, sempre — e a regra que o banco tambem exige', () => {
  // A CHECK `(clienteId IS NULL) <> (condicaoId IS NULL)` recusaria o
  // contrario. A funcao existe para que o codigo nunca tente.
  for (const [cliente, condicao] of [
    [null, 'cond-1'],
    ['cli-1', 'cond-1'],
  ] as const) {
    const d = devedorDoTitulo(cliente, condicao)
    const preenchidos = [d.clienteId, d.condicaoId].filter((x) => x !== null).length
    assert.equal(preenchidos, 1, `${cliente}/${condicao} produziu ${preenchidos} devedores`)
  }
})

/* ========================================================================= *
 * AS CATEGORIAS DOS DOIS LADOS
 * ========================================================================= */

test('receita e despesa compartilham o NOME "BaaS" — e nao se misturam', () => {
  /**
   * As duas passaram a se chamar "BaaS". A preocupacao antiga — "classificar
   * os dois na mesma categoria faria o resultado somar receita com despesa no
   * mesmo balde" — continua valida, e NAO e o nome que a resolve.
   *
   * O que a resolve e `CategoriaFinanceira` ser unica por (nome, tipo): sao
   * DUAS LINHAS, com ids diferentes, uma de RECEITA e uma de DESPESA. Toda
   * agregacao filtra por `tipo` antes de agrupar por categoria — receita por
   * categoria olha RECEITA, gasto por categoria olha DESPESA. O balde e o
   * `tipo`, nunca o nome.
   *
   * O nome unico existe porque a categoria responde "de onde vem?", e a
   * resposta e a mesma para os tres registros do Lancamento BaaS. O PAPEL de
   * cada um ("Tarifa BaaS", "Repasse BaaS") vive na descricao.
   */
  assert.equal(CATEGORIA_RECEITA_BAAS, 'BaaS')
  assert.equal(CATEGORIA_DESPESA_BAAS, 'BaaS')

  // A separacao real: a agregacao filtra por tipo antes de agrupar.
  const fin = ler('lib/financeiro.ts')
  const gasto = fin.slice(
    fin.indexOf('export async function gastoPorCategoria'),
    fin.indexOf('export async function gastoPorCategoria') + 1200,
  )
  assert.ok(
    gasto.includes("tipo: 'DESPESA'"),
    'o gasto por categoria deixou de filtrar por tipo — agora os nomes colidem',
  )
})

test('a categoria NAO e generica', () => {
  // Uma categoria chamada "Outros" ou "Despesas" deixaria o repasse ao
  // parceiro indistinguivel de qualquer outra saida no gasto por categoria.
  for (const generica of ['Outros', 'Despesas', 'Receitas', 'Diversos', 'Geral']) {
    assert.notEqual(CATEGORIA_DESPESA_BAAS, generica)
    assert.notEqual(CATEGORIA_RECEITA_BAAS, generica)
  }
})

/* ========================================================================= *
 * EDIÇÃO — recalcula e não duplica
 * ========================================================================= */

test('editar o volume muda os TRES valores, de forma coerente', () => {
  const antes = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_000 }], 25)
  const depois = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 200_000 }], 25)

  assert.notEqual(antes.totalTarifas, depois.totalTarifas)
  assert.notEqual(resultadoBaas(antes), resultadoBaas(depois))
  assert.notEqual(antes.valorCliente, depois.valorCliente)

  // A RECEITA e a mesma nos dois: o saldo apurado nao muda quando o volume
  // muda — o que muda e como ele se reparte entre margem e comissao.
  assert.equal(receitaBaas(antes), receitaBaas(depois))

  // E a identidade continua fechando: receita = resultado + despesa.
  for (const c of [antes, depois]) {
    assert.equal(centavos(resultadoBaas(c) + despesaBaas(c)), receitaBaas(c))
    assert.equal(receitaBaas(c), 100_000)
  }
})

test('o mesmo lancamento recalculado duas vezes da o MESMO resultado', () => {
  // A idempotencia da geracao depende disto: se o calculo variasse, editar
  // sem mudar nada produziria titulos com valores diferentes.
  const a = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_000 }], 25)
  const b = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_000 }], 25)
  assert.deepEqual(a, b)
  assert.equal(receitaBaas(a), receitaBaas(b))
  assert.equal(resultadoBaas(a), resultadoBaas(b))
})

/* ========================================================================= *
 * EXCLUIR, NÃO FECHAR
 * ========================================================================= */

test('a acao "fechar" saiu da API', () => {
  // Era um status marcado a mao, e nao protegia nada: um lancamento com
  // titulo ja pago continuava editavel enquanto ninguem o fechasse, e um sem
  // nenhuma liquidacao ficava travado no instante em que fosse fechado.
  const rota = ler('app/api/lancamento-baas/[id]/route.ts')
  assert.ok(!rota.includes("acao === 'fechar'"), 'a acao fechar voltou')
  assert.ok(!rota.includes("status: 'FECHADO'"), 'alguem volta a gravar FECHADO')
  assert.ok(!rota.includes('FECHOU_LANCAMENTO_BAAS'), 'o evento de fechamento voltou')
})

test('o botao "Fechar" saiu da tela', () => {
  const tela = ler('app/dashboard/financeiro/condicoes-baas/lancamentos/LancamentoBaasClient.tsx')
  assert.ok(!tela.includes('>Fechar</Button>'), 'o botao Fechar voltou a lista')
  assert.ok(!tela.includes('async function fechar('), 'o handler de fechar voltou')
  assert.ok(!tela.includes('acao=fechar'), 'a chamada de fechar voltou')
})

test('EXCLUIR existe, e em qualquer estado', () => {
  const tela = ler('app/dashboard/financeiro/condicoes-baas/lancamentos/LancamentoBaasClient.tsx')
  assert.ok(tela.includes('>Excluir</Button>'))
  // Fora de qualquer `l.status === 'RASCUNHO'`: o que bloqueia e a liquidacao,
  // conferida no servidor — nao o estado do lancamento.
  assert.ok(tela.includes('onClick={() => excluir(l)}'))
})

test('a confirmacao DIZ o que sai junto', () => {
  // Um "Excluir?" seco esconderia que tres registros desaparecem.
  const tela = ler('app/dashboard/financeiro/condicoes-baas/lancamentos/LancamentoBaasClient.tsx')
  assert.ok(tela.includes('Excluir este lançamento BaaS?'))
  assert.ok(tela.includes('o lançamento financeiro'))
  assert.ok(tela.includes('o título a receber'))
  assert.ok(tela.includes('o título a pagar'))
})

test('a EDICAO e bloqueada pela LIQUIDACAO, nao por status', () => {
  const rota = ler('app/api/lancamento-baas/[id]/route.ts')
  assert.ok(rota.includes('await liquidacaoDe(id)'))
  assert.ok(!rota.includes("atual.status === 'FECHADO'"), 'a guarda por status voltou')
})

test('a EXCLUSAO confere liquidacao e apaga os tres', () => {
  const rota = ler('app/api/lancamento-baas/[id]/route.ts')
  const ini = rota.indexOf('export async function DELETE')
  const del = rota.slice(ini)
  assert.ok(del.includes('liquidacaoDe(id)'), 'a exclusao nao confere liquidacao')
  assert.ok(del.includes('apagarTitulos(id)'), 'a exclusao nao remove os titulos')
  assert.ok(del.includes('EXCLUIU_LANCAMENTO_BAAS'), 'a exclusao nao e auditada')
})

test('a AUDITORIA da exclusao e gravada ANTES do delete', () => {
  // Depois do delete o registro nao existe mais para ser consultado, e a
  // trilha precisa carregar os valores — nao so o id de algo que sumiu.
  const rota = ler('app/api/lancamento-baas/[id]/route.ts')
  const del = rota.slice(rota.indexOf('export async function DELETE'))
  const iAudit = del.indexOf('EXCLUIU_LANCAMENTO_BAAS')
  const iDelete = del.indexOf('lancamentoBaas.delete')
  assert.ok(iAudit > 0 && iDelete > 0)
  assert.ok(iAudit < iDelete, 'a auditoria ficou depois do delete')
})

test('a trilha de auditoria carrega os VALORES, nao so o id', () => {
  const rota = ler('app/api/lancamento-baas/[id]/route.ts')
  const del = rota.slice(rota.indexOf('export async function DELETE'))
  for (const campo of ['saldo', 'tarifas', 'overprice', 'residual']) {
    assert.ok(del.includes(campo), `a auditoria nao registra ${campo}`)
  }
})

/* ========================================================================= *
 * DETALHES — de onde veio o valor
 * ========================================================================= */

test('o detalhe mostra PRODUTO | TAXA | VOLUME | TOTAL', () => {
  const d = ler('components/financeiro/DetalheBaas.tsx')
  for (const col of ['Produto', 'Taxa', 'Volume', 'Total']) {
    assert.ok(d.includes(`>${col}<`), `a coluna ${col} saiu do detalhe`)
  }
  assert.ok(d.includes('Total de Tarifas'))
})

test('o detalhe mostra a cascata inteira, etapa por etapa', () => {
  const d = ler('components/financeiro/DetalheBaas.tsx')
  for (const etapa of [
    'Saldo inicial da conta', 'Total de Tarifas', 'Saldo após tarifas',
    'Overprice', 'Comissão devida ao parceiro',
  ]) {
    assert.ok(d.includes(etapa), `a etapa "${etapa}" saiu do detalhe`)
  }
})

test('o detalhe declara a CONTABILIZACAO, nao so a cascata', () => {
  // A cascata responde "como o numero foi formado"; a contabilizacao responde
  // "o que ele faz no resultado". Com receita e despesa BRUTAS, a margem deixa
  // de estar a vista — ninguem le 100.000 e 75.000 e conclui 25.000 sem fazer
  // a conta. Entao a conta aparece feita.
  const d = ler('components/financeiro/DetalheBaas.tsx')
  assert.ok(d.includes('Saldo integral apurado'), 'a receita nao diz que e o integral')
  assert.ok(d.includes('Comissão devida ao parceiro'), 'a despesa nao diz que e comissao')
  assert.ok(d.includes('Resultado do lançamento'), 'o resultado nao e declarado')
  assert.ok(d.includes('Receita − comissão do parceiro'), 'a formula do resultado saiu')

  // E a receita vem do saldo, nao da margem.
  assert.ok(d.includes('const receita = l.saldoInicial'), 'a receita voltou a ser a margem')
  assert.ok(
    !d.includes('const receita = l.totalTarifas + l.overpriceValor'),
    'a receita voltou a ser tarifas + overprice',
  )
})

test('o detalhe diz o que cada modulo recebeu', () => {
  const d = ler('components/financeiro/DetalheBaas.tsx')
  assert.ok(d.includes('Contas a Receber'))
  assert.ok(d.includes('Contas a Pagar'))
  assert.ok(d.includes('O título da receita — mesmo valor'))
})

test('o detalhe e alcancavel DE LANCAMENTOS', () => {
  // E a pergunta que a tela de Lancamentos levanta: de onde veio esse valor?
  //
  // O caminho mudou nesta rodada. Era um botao condicional que abria o
  // DetalheBaas direto; agora TODA linha tem "Detalhes", e o painel geral
  // acrescenta a camada BaaS quando a linha veio de um Lancamento BaaS — a
  // decisao de mostrar ou nao a composicao saiu da tabela e foi para o
  // painel, que e quem tem o dado.
  const l = ler('app/dashboard/financeiro/cp-cr/lancamentos/LancamentosClient.tsx')
  assert.ok(l.includes('onClick={() => setDetalhe(l)}>Detalhes</Button>'))
  assert.ok(l.includes('<DetalheLancamento'))

  // E o painel decide pela origem, mostrando o mesmo corpo do modulo.
  const d = ler('components/financeiro/DetalheLancamento.tsx')
  assert.ok(d.includes('l.baasReceita ?? l.baasContaPagar ?? null'))
  assert.ok(d.includes('<CorpoBaas l={baas} />'))
})

test('o detalhe NAO e um dashboard: nenhum grafico', () => {
  const d = ler('components/financeiro/DetalheBaas.tsx')
  for (const proibido of ['recharts', '<Bar ', '<Line ', '<Area ', 'ResponsiveContainer']) {
    assert.ok(!d.includes(proibido), `${proibido} entrou no painel de detalhes`)
  }
})

/* ========================================================================= *
 * DESCRIÇÃO SIMPLES
 * ========================================================================= */

test('a descricao gerada e CURTA: "<o que> — <parceiro>"', () => {
  const t = ler('lib/baas-titulos.ts')
  assert.ok(
    t.includes('`${oque} — ${d.parceiroNome}`'),
    'a descricao nao esta no formato curto',
  )

  // O QUE NAO PODE VOLTAR para a descricao, e por que:
  //   - a conta e o intervalo: nao cabem numa linha de tabela;
  //   - a competencia: a data ja e uma COLUNA da tela de Lancamentos;
  //   - os produtos e volumes: e o que o painel de detalhes mostra.
  assert.ok(!t.includes('conta ${d.numeroConta} ·'), 'a conta voltou para a descricao')
  assert.ok(!t.includes('${competencia}'), 'a competencia voltou para a descricao')
  assert.ok(!t.includes('toLocaleDateString'), 'a descricao voltou a formatar data')
})

test('os tres registros tem descricoes distinguiveis e curtas', () => {
  const t = ler('lib/baas-titulos.ts')

  /**
   * v28 — DOIS RÓTULOS para TRÊS registros, e cada um diz o que a linha vale:
   *
   *   "Apuração BaaS" → o lançamento de RECEITA **e** o título a receber.
   *                     São o mesmo valor (o saldo integral) visto de dois
   *                     lugares: a competência e a cobrança.
   *   "Comissão BaaS" → o lançamento de DESPESA, devido ao parceiro.
   *
   * O rótulo repetido é a INFORMAÇÃO, não um descuido: os dois registros
   * valem o mesmo, e nomeá-los diferente sugeriria valores diferentes. Era
   * assim antes da v28 também, quando os dois diziam "Tarifa BaaS".
   */
  assert.equal(
    (t.match(/descricao\(d, 'Apuração BaaS'\)/g) ?? []).length, 2,
    'a receita e o titulo a receber devem dizer "Apuração BaaS"',
  )
  assert.ok(t.includes("descricao(d, 'Comissão BaaS')"), 'a despesa perdeu o rotulo')
  assert.equal(
    (t.match(/descricao\(d, 'Comissão BaaS'\)/g) ?? []).length, 1,
    'o rotulo da comissao deixou de identificar um registro so',
  )

  // Os rotulos longos e os revogados sairam.
  assert.ok(!t.includes("'Repasse ao parceiro'"), 'o rotulo longo do repasse voltou')
  assert.ok(!t.includes("'Lançamento BaaS')"), 'o rotulo antigo da receita voltou')
  assert.ok(!t.includes("descricao(d, 'Repasse BaaS')"), 'o rotulo "Repasse" voltou')
  // E "Tarifa BaaS" saiu do titulo: ele descreveria 10 mil num titulo de 100 mil.
  assert.ok(!t.includes("descricao(d, 'Tarifa BaaS')"), 'o titulo voltou a dizer "Tarifa"')
})
