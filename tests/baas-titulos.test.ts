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
import { calcular, receitaBassPago, centavos } from '../lib/lancamento-baas'

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

test('§12: CONTAS A RECEBER = R$ 10.065,00 — SO as tarifas', () => {
  // O que se COBRA do parceiro. NAO inclui o overprice: ele e receita nossa,
  // mas e realizado pagando ao parceiro menos — fatura-lo tambem seria cobrar
  // duas vezes o mesmo valor.
  assert.equal(CENARIO.totalTarifas, 10_065)
})

test('§12: CONTAS A PAGAR = R$ 67.451,25 — o residual do parceiro', () => {
  assert.equal(CENARIO.valorCliente, 67_451.25)
})

test('§12: NAO INVERTER — o AR e o menor, o AP e o maior', () => {
  // A troca dos dois seria silenciosa: os numeros existem e a soma nao fecha
  // com nada visivel. Este teste e o que a pega.
  assert.ok(CENARIO.totalTarifas < CENARIO.valorCliente)
  assert.notEqual(CENARIO.totalTarifas, CENARIO.valorCliente)
})

test('§12: NAO SOMAR os dois como uma receita unica', () => {
  // AR + AP = 77.516,25, que nao e receita nenhuma: e a soma de uma cobranca
  // com uma divida. A receita da Bass Pago e outra coisa.
  const somaErrada = centavos(CENARIO.totalTarifas + CENARIO.valorCliente)
  assert.equal(somaErrada, 77_516.25)
  assert.notEqual(somaErrada, receitaBassPago(CENARIO))
  assert.notEqual(somaErrada, CENARIO.saldoInicial)
})

test('LANCAMENTOS registra a RECEITA: tarifas + overprice', () => {
  // O lancamento financeiro e o que a Receita do periodo soma, e a receita
  // inclui o overprice. O titulo a receber cobra menos — a diferenca e
  // exatamente o overprice retido.
  assert.equal(receitaBassPago(CENARIO), 32_548.75)
  assert.equal(
    centavos(receitaBassPago(CENARIO) - CENARIO.totalTarifas),
    CENARIO.overpriceValor,
  )
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

test('receita e despesa usam categorias DIFERENTES', () => {
  // Classificar os dois na mesma categoria faria o resultado do periodo
  // somar receita com despesa no mesmo balde.
  assert.notEqual(CATEGORIA_RECEITA_BAAS, CATEGORIA_DESPESA_BAAS)
  assert.equal(CATEGORIA_RECEITA_BAAS, 'Tarifas BaaS')
  assert.equal(CATEGORIA_DESPESA_BAAS, 'Repasse a Cliente BaaS')
})

/* ========================================================================= *
 * EDIÇÃO — recalcula e não duplica
 * ========================================================================= */

test('editar o volume muda os TRES valores, de forma coerente', () => {
  const antes = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_000 }], 25)
  const depois = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 200_000 }], 25)

  assert.notEqual(antes.totalTarifas, depois.totalTarifas)
  assert.notEqual(receitaBassPago(antes), receitaBassPago(depois))
  assert.notEqual(antes.valorCliente, depois.valorCliente)

  // E os dois continuam fechando com o saldo.
  for (const c of [antes, depois]) {
    assert.equal(centavos(receitaBassPago(c) + c.valorCliente), 100_000)
  }
})

test('o mesmo lancamento recalculado duas vezes da o MESMO resultado', () => {
  // A idempotencia da geracao depende disto: se o calculo variasse, editar
  // sem mudar nada produziria titulos com valores diferentes.
  const a = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_000 }], 25)
  const b = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_000 }], 25)
  assert.deepEqual(a, b)
  assert.equal(receitaBassPago(a), receitaBassPago(b))
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
  const tela = ler('app/dashboard/lancamento-baas/LancamentoBaasClient.tsx')
  assert.ok(!tela.includes('>Fechar</Button>'), 'o botao Fechar voltou a lista')
  assert.ok(!tela.includes('async function fechar('), 'o handler de fechar voltou')
  assert.ok(!tela.includes('acao=fechar'), 'a chamada de fechar voltou')
})

test('EXCLUIR existe, e em qualquer estado', () => {
  const tela = ler('app/dashboard/lancamento-baas/LancamentoBaasClient.tsx')
  assert.ok(tela.includes('>Excluir</Button>'))
  // Fora de qualquer `l.status === 'RASCUNHO'`: o que bloqueia e a liquidacao,
  // conferida no servidor — nao o estado do lancamento.
  assert.ok(tela.includes('onClick={() => excluir(l)}'))
})

test('a confirmacao DIZ o que sai junto', () => {
  // Um "Excluir?" seco esconderia que tres registros desaparecem.
  const tela = ler('app/dashboard/lancamento-baas/LancamentoBaasClient.tsx')
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
    'Overprice', 'Valor residual devido ao parceiro',
  ]) {
    assert.ok(d.includes(etapa), `a etapa "${etapa}" saiu do detalhe`)
  }
})

test('o detalhe diz o que cada modulo recebeu', () => {
  const d = ler('components/financeiro/DetalheBaas.tsx')
  assert.ok(d.includes('Contas a Receber'))
  assert.ok(d.includes('Contas a Pagar'))
  assert.ok(d.includes('Só as tarifas — o que se cobra'))
})

test('o detalhe e alcancavel DE LANCAMENTOS', () => {
  // E a pergunta que a tela de Lancamentos levanta: de onde veio esse valor?
  const l = ler('app/dashboard/financeiro/lancamentos/LancamentosClient.tsx')
  assert.ok(l.includes('function origemBaas('))
  assert.ok(l.includes('setDetalheBaas(origemBaas(l))'))
  assert.ok(l.includes('<DetalheBaas'))
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

test('a descricao gerada e simples: "<o que> — <parceiro> — <competencia>"', () => {
  const t = ler('lib/baas-titulos.ts')
  assert.ok(t.includes('`${oque} — ${d.parceiroNome} — ${competencia}`'))
  // A composicao por produto NAO entra na descricao: e o que o detalhe mostra.
  assert.ok(!t.includes('conta ${d.numeroConta} ·'), 'a conta voltou para a descricao')
})

test('os tres registros tem descricoes distinguiveis', () => {
  const t = ler('lib/baas-titulos.ts')
  assert.ok(t.includes("descricao(d, 'Lançamento BaaS')"), 'o lancamento financeiro')
  assert.ok(t.includes("descricao(d, 'Tarifas BaaS')"), 'o titulo a receber')
  assert.ok(t.includes("descricao(d, 'Repasse ao parceiro')"), 'o titulo a pagar')
})
