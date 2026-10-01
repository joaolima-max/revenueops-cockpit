/**
 * LANÇAMENTO BAAS — a cascata do faturamento de um parceiro.
 *
 * O que estes testes protegem:
 *
 *   1. A ORDEM da cascata. O overprice incide sobre o SALDO REMANESCENTE,
 *      não sobre o saldo inicial — e isso muda o resultado.
 *   2. O FECHAMENTO: o que a Bass Pago cobrou mais o que é devido ao cliente
 *      tem de ser exatamente o saldo informado. Nenhum real aparece nem
 *      desaparece na conta.
 *   3. CENTAVOS. Cem linhas de R$ 0,10 não podem produzir 10.000000000000002.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calcular, receitaBassPago, centavos, validarLancamento,
  periodosSobrepostos, rotuloPeriodo,
} from '../lib/lancamento-baas'

const D = (iso: string) => new Date(`${iso}T00:00:00Z`)

/* ========================================================================= *
 * A CASCATA
 * ========================================================================= */

test('o exemplo da especificacao, etapa por etapa', () => {
  // Saldo 100.000; PIX 0,10 x 100.000 = 10.000; KYC 6,50 x 10 = 65.
  const c = calcular(100_000, [
    { nome: 'PIX', preco: 0.10, volume: 100_000 },
    { nome: 'KYC', preco: 6.50, volume: 10 },
  ], 25)

  assert.equal(c.itens[0].total, 10_000)
  assert.equal(c.itens[1].total, 65)
  assert.equal(c.totalTarifas, 10_065)
  assert.equal(c.saldoRemanescente, 89_935)
  // 25% do SALDO REMANESCENTE, nao do saldo inicial.
  assert.equal(c.overpriceValor, 22_483.75)
  assert.equal(c.valorCliente, 67_451.25)
})

test('o OVERPRICE incide sobre o remanescente, nao sobre o saldo inicial', () => {
  // E a diferenca que a ordem da cascata produz: 25% de 50.000 e 12.500;
  // 25% de 100.000 seriam 25.000.
  const c = calcular(100_000, [{ nome: 'Tarifa', preco: 1, volume: 50_000 }], 25)
  assert.equal(c.saldoRemanescente, 50_000)
  assert.equal(c.overpriceValor, 12_500)
  assert.notEqual(c.overpriceValor, 25_000)
  assert.equal(c.valorCliente, 37_500)
})

test('A CONTA FECHA: receita + valor do cliente = saldo informado', () => {
  // Nenhum real aparece nem desaparece. Se este teste quebrar, a cascata
  // passou a criar ou sumir com dinheiro.
  for (const [saldo, preco, volume, pct] of [
    [100_000, 0.10, 100_000, 25],
    [50_000, 6.50, 100, 10],
    [1_234.56, 0.07, 999, 33],
    [10_000, 1, 0, 50],
  ] as const) {
    const c = calcular(saldo, [{ nome: 'P', preco, volume }], pct)
    assert.equal(
      centavos(receitaBassPago(c) + c.valorCliente), centavos(saldo),
      `nao fechou com saldo ${saldo}`,
    )
  }
})

test('sem overprice cadastrado, nao se aplica overprice nenhum', () => {
  for (const pct of [null, undefined, 0]) {
    const c = calcular(1_000, [{ nome: 'P', preco: 1, volume: 100 }], pct)
    assert.equal(c.overpricePercent, null)
    assert.equal(c.overpriceValor, 0)
    assert.equal(c.valorCliente, 900, 'o cliente recebe o remanescente inteiro')
  }
})

test('volume ZERO e valido e produz linha com total zero', () => {
  // O produto existe no contrato e nao foi usado no periodo. Omiti-lo faria
  // parecer que nao esta mais contratado.
  const c = calcular(1_000, [
    { nome: 'PIX', preco: 0.10, volume: 0 },
    { nome: 'KYC', preco: 6.50, volume: 2 },
  ], null)
  assert.equal(c.itens.length, 2)
  assert.equal(c.itens[0].total, 0)
  assert.equal(c.totalTarifas, 13)
})

test('tarifas MAIORES que o saldo: remanescente negativo e SEM overprice', () => {
  // Aplicar o percentual sobre saldo negativo produziria overprice negativo —
  // a Bass Pago devolvendo dinheiro por ter cobrado demais.
  const c = calcular(100, [{ nome: 'P', preco: 1, volume: 500 }], 25)
  assert.equal(c.saldoRemanescente, -400)
  assert.equal(c.overpriceValor, 0, 'overprice negativo nao existe')
  assert.equal(c.valorCliente, -400, 'o negativo e a informacao: o saldo nao cobre as tarifas')
})

test('CENTAVOS: cem linhas de dez centavos somam exatamente dez reais', () => {
  // Sem arredondamento por etapa, 0.1 * 100 produz 10.000000000000002 e o
  // erro viaja ate o overprice.
  const c = calcular(100, [{ nome: 'P', preco: 0.1, volume: 100 }], null)
  assert.equal(c.totalTarifas, 10)
  assert.equal(c.saldoRemanescente, 90)
})

test('centavos arredonda para duas casas, nunca mais', () => {
  assert.equal(centavos(10.005), 10.01)
  assert.equal(centavos(0.1 * 3), 0.3)
  assert.equal(centavos(1 / 3), 0.33)
})

test('a receita da Bass Pago e tarifas + overprice', () => {
  const c = calcular(100_000, [{ nome: 'P', preco: 0.10, volume: 100_000 }], 25)
  assert.equal(receitaBassPago(c), centavos(c.totalTarifas + c.overpriceValor))
  assert.equal(receitaBassPago(c), 32_500)
})

/* ========================================================================= *
 * VALIDAÇÃO
 * ========================================================================= */

const VALIDO = {
  condicaoId: 'c1',
  numeroConta: '12345',
  periodoInicio: '2026-10-01',
  periodoFim: '2026-10-31',
  saldoInicial: 1000,
  produtos: [{ nome: 'PIX', preco: 0.1, volume: 10 }],
}

test('a entrada completa passa', () => {
  assert.deepEqual(validarLancamento(VALIDO), [])
})

test('parceiro, conta, periodo e saldo sao obrigatorios', () => {
  for (const campo of ['condicaoId', 'numeroConta', 'periodoInicio', 'periodoFim', 'saldoInicial']) {
    const e = { ...VALIDO, [campo]: undefined }
    const erros = validarLancamento(e)
    assert.ok(erros.some((x) => x.campo === campo), `${campo} passou sem valor`)
  }
})

test('fim do periodo ANTES do inicio e recusado', () => {
  const erros = validarLancamento({ ...VALIDO, periodoInicio: '2026-10-31', periodoFim: '2026-10-01' })
  assert.ok(erros.some((e) => e.campo === 'periodoFim'))
})

test('periodo de um dia so e valido', () => {
  const erros = validarLancamento({ ...VALIDO, periodoInicio: '2026-10-05', periodoFim: '2026-10-05' })
  assert.deepEqual(erros, [])
})

test('data em formato invalido e recusada', () => {
  for (const v of ['31/10/2026', '2026-10', 'outubro', '', 20261031]) {
    const erros = validarLancamento({ ...VALIDO, periodoInicio: v })
    assert.ok(erros.some((e) => e.campo === 'periodoInicio'), `${JSON.stringify(v)} passou`)
  }
})

test('saldo NEGATIVO e recusado', () => {
  const erros = validarLancamento({ ...VALIDO, saldoInicial: -1 })
  assert.ok(erros.some((e) => e.campo === 'saldoInicial'))
})

test('saldo ZERO e valido — a conta pode estar zerada', () => {
  assert.deepEqual(validarLancamento({ ...VALIDO, saldoInicial: 0 }), [])
})

test('VOLUME NEGATIVO e recusado', () => {
  // Inverteria o sinal da tarifa e viraria credito ao cliente.
  const erros = validarLancamento({
    ...VALIDO, produtos: [{ nome: 'PIX', preco: 0.1, volume: -5 }],
  })
  assert.ok(erros.some((e) => e.campo === 'produtos.0.volume'))
})

test('volume fracionario e recusado — transacao nao e meia', () => {
  const erros = validarLancamento({
    ...VALIDO, produtos: [{ nome: 'PIX', preco: 0.1, volume: 1.5 }],
  })
  assert.ok(erros.some((e) => e.campo === 'produtos.0.volume'))
})

test('preco negativo e recusado; preco zero e aceito', () => {
  const negativo = validarLancamento({
    ...VALIDO, produtos: [{ nome: 'PIX', preco: -1, volume: 1 }],
  })
  assert.ok(negativo.some((e) => e.campo === 'produtos.0.preco'))

  const zero = validarLancamento({
    ...VALIDO, produtos: [{ nome: 'Gratuito', preco: 0, volume: 100 }],
  })
  assert.deepEqual(zero, [], 'ha produto contratado sem tarifa')
})

test('parceiro SEM produtos cadastrados e recusado, com instrucao', () => {
  const erros = validarLancamento({ ...VALIDO, produtos: [] })
  assert.equal(erros.length, 1)
  assert.ok(/Condi[çc][õo]es BaaS/i.test(erros[0].mensagem), erros[0].mensagem)
})

/* ========================================================================= *
 * PERÍODO
 * ========================================================================= */

test('periodos que se tocam numa ponta SE SOBREPOEM', () => {
  // Tarifar o mesmo dia duas vezes e dupla contagem de receita.
  assert.equal(
    periodosSobrepostos(D('2026-10-01'), D('2026-10-31'), D('2026-10-31'), D('2026-11-30')),
    true,
  )
})

test('periodos consecutivos NAO se sobrepoem', () => {
  assert.equal(
    periodosSobrepostos(D('2026-10-01'), D('2026-10-31'), D('2026-11-01'), D('2026-11-30')),
    false,
  )
})

test('um periodo dentro do outro se sobrepoe', () => {
  assert.equal(
    periodosSobrepostos(D('2026-10-01'), D('2026-10-31'), D('2026-10-10'), D('2026-10-20')),
    true,
  )
})

test('o rotulo do periodo sai em pt-BR', () => {
  assert.equal(rotuloPeriodo(D('2026-10-01'), D('2026-10-31')), '01/10/2026 a 31/10/2026')
})

/* ========================================================================= *
 * O EXEMPLO EXATO DA ESPECIFICAÇÃO (§56)
 * ========================================================================= */

test('§56: saldo 100.000, tarifas 10.065, overprice 25% -> residual 67.451,25', () => {
  // Os seis números da especificacao, conferidos um por um.
  const c = calcular(100_000, [
    { nome: 'PIX', preco: 0.10, volume: 100_000 },  // 10.000,00
    { nome: 'KYC', preco: 6.50, volume: 10 },       //      65,00
  ], 25)

  assert.equal(c.saldoInicial, 100_000)
  assert.equal(c.totalTarifas, 10_065)
  assert.equal(c.saldoRemanescente, 89_935)
  assert.equal(c.overpricePercent, 25)
  assert.equal(c.overpriceValor, 22_483.75)
  assert.equal(c.valorCliente, 67_451.25)

  // E o FECHAMENTO: nada aparece nem desaparece.
  assert.equal(centavos(receitaBassPago(c) + c.valorCliente), 100_000)
})

test('a TAXA vem do cadastro — o calculo nunca a recebe do volume', () => {
  // A assinatura separa preco de volume de proposito: nao ha caminho em que o
  // colaborador digite o preco. Trocar um pelo outro produziria outro numero.
  const correto = calcular(1_000, [{ nome: 'P', preco: 0.5, volume: 100 }], null)
  const trocado = calcular(1_000, [{ nome: 'P', preco: 100, volume: 0.5 }], null)
  assert.equal(correto.totalTarifas, 50)
  // Volume fracionario e recusado pela validacao; aqui so se mostra que a
  // ordem importa e que os campos nao sao intercambiaveis por acidente.
  assert.notEqual(correto.itens[0].volume, trocado.itens[0].volume)
})

test('produtos DINAMICOS: a cascata nao conhece PIX nem KYC por nome', () => {
  // Nada no calculo depende do nome do produto — e por isso manutencao de
  // conta, boleto e API entram sem alteracao de codigo.
  const c = calcular(10_000, [
    { nome: 'Manutenção de conta', preco: 12.90, volume: 50 },
    { nome: 'Boleto', preco: 2.45, volume: 200 },
    { nome: 'API', preco: 0.01, volume: 30_000 },
  ], 10)
  assert.equal(c.itens.length, 3)
  assert.equal(c.totalTarifas, centavos(12.90 * 50 + 2.45 * 200 + 0.01 * 30_000))
  assert.equal(centavos(receitaBassPago(c) + c.valorCliente), 10_000)
})

test('um produto SO tambem fecha a conta', () => {
  const c = calcular(500, [{ nome: 'Único', preco: 1.37, volume: 73 }], 15)
  assert.equal(centavos(receitaBassPago(c) + c.valorCliente), 500)
})

test('saldo zerado: nenhuma tarifa, nenhum overprice, residual zero', () => {
  const c = calcular(0, [{ nome: 'P', preco: 1, volume: 0 }], 25)
  assert.equal(c.totalTarifas, 0)
  assert.equal(c.saldoRemanescente, 0)
  assert.equal(c.overpriceValor, 0, 'overprice sobre zero e zero, nao um erro')
  assert.equal(c.valorCliente, 0)
})
