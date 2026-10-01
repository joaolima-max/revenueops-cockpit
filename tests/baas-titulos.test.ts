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
import { calcular, receitaBassPago, centavos } from '../lib/lancamento-baas'
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

test('§7: CONTAS A RECEBER = receita da Bass Pago (tarifas + overprice)', () => {
  // Nao e o saldo, nao sao so as tarifas: e o que a Bass Pago cobrou.
  assert.equal(receitaBassPago(CENARIO), 32_548.75)
  assert.equal(
    receitaBassPago(CENARIO),
    centavos(CENARIO.totalTarifas + CENARIO.overpriceValor),
  )
})

test('§7: CONTAS A PAGAR = R$ 67.451,25, o residual do parceiro', () => {
  assert.equal(CENARIO.valorCliente, 67_451.25)
})

test('§7: AR + AP = saldo informado — nada aparece nem desaparece', () => {
  assert.equal(
    centavos(receitaBassPago(CENARIO) + CENARIO.valorCliente),
    100_000,
  )
})

test('o AR NAO inclui mensalidade nem nada fora do lancamento', () => {
  // A fonte do valor e o proprio calculo do lancamento. Se o AR passasse a
  // somar mensalidade de API ou sustentacao, este teste quebraria — e seria
  // dupla contagem, porque essas parcelas tem lugar proprio no MRR.
  const soTarifas = CENARIO.totalTarifas
  const soOverprice = CENARIO.overpriceValor
  assert.equal(receitaBassPago(CENARIO), centavos(soTarifas + soOverprice))
  // Nenhuma terceira parcela cabe na identidade acima.
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
