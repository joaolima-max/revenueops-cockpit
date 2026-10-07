/**
 * LANÇAMENTO BAAS → AR E AP, automaticamente.
 *
 * ── O DEFEITO ────────────────────────────────────────────────────────────
 *
 * "Os títulos de Contas a Pagar e Contas a Receber NÃO estão sendo
 * atualizados automaticamente após um Lançamento BaaS."
 *
 * Nada estava errado no cálculo nem na geração. O lançamento era criado como
 * RASCUNHO e os três registros só nasciam quando alguém clicava "Lançar"
 * depois — um segundo passo que ninguém tinha motivo para supor que existia.
 * Foi assim que apareceram, em produção, lançamentos com conjunto incompleto.
 *
 * ── A CORREÇÃO ───────────────────────────────────────────────────────────
 *
 *   1. CRIAR já gera os três (lançar É gerar);
 *   2. EDITAR atualiza os mesmos títulos, nunca cria um segundo conjunto;
 *   3. os que já ficaram incompletos têm uma rotina de reparo idempotente.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  calcular, receitaBaas, despesaBaas, resultadoBaas,
} from '../lib/lancamento-baas'

const ler = (p: string) => readFileSync(p, 'utf8')

const POST = ler('app/api/lancamento-baas/route.ts')
const ID = ler('app/api/lancamento-baas/[id]/route.ts')
const TITULOS = ler('lib/baas-titulos.ts')
const SYNC = ler('app/api/lancamento-baas/sincronizar/route.ts')

/* ========================================================================= *
 * CRIAR JÁ GERA OS TRÊS
 * ========================================================================= */

test('CRIAR chama gerarTitulos — o rascunho sem titulos acabou', () => {
  assert.ok(POST.includes("from '@/lib/baas-titulos'"), 'a criacao nao importa a geracao')
  assert.ok(POST.includes('await gerarTitulos({'), 'criar voltou a nao gerar os titulos')
  assert.ok(POST.includes('lancamentoBaasId: criado.id'))
})

test('CRIAR passa os TRES valores certos para os TRES destinos', () => {
  // v28 — AR = tarifas; lancamento de receita = saldo INTEGRAL apurado;
  // lancamento de despesa = comissao do parceiro.
  assert.ok(POST.includes('tarifas: calc.totalTarifas'), 'o AR deixou de cobrar as tarifas')
  assert.ok(POST.includes('receita: receitaBaas(calc)'), 'o lancamento perdeu a receita integral')
  assert.ok(POST.includes('despesa: despesaBaas(calc)'), 'a despesa perdeu a comissao')

  // A RECEITA nao pode voltar a ser a margem: era isso que fazia o
  // faturamento aparecer como um quarto do apurado.
  assert.ok(
    !POST.includes('receita: resultadoBaas(calc)'),
    'a receita voltou a ser a margem',
  )
})

test('se a geracao falhar, o lancamento NAO e descartado nem o erro engolido', () => {
  // Apagar o lançamento jogaria fora o formulário preenchido; devolver 201 em
  // silêncio reproduziria o defeito original.
  assert.ok(POST.includes('avisoTitulos'), 'a falha de geracao voltou a ser silenciosa')
  assert.ok(POST.includes('TÍTULOS NÃO GERADOS'), 'a auditoria nao registra a falha')
  assert.ok(!POST.includes('lancamentoBaas.delete'), 'a criacao passou a descartar o lancamento')
})

/* ========================================================================= *
 * EDITAR ATUALIZA, NÃO DUPLICA
 * ========================================================================= */

test('EDITAR atualiza os titulos vinculados', () => {
  assert.ok(ID.includes('await gerarTitulos({'), 'editar deixou de atualizar os titulos')
})

test('gerarTitulos ATUALIZA quando a FK ja aponta para algo', () => {
  // A idempotência é do banco: as três FKs são UNIQUE, e a função escolhe
  // entre `update` e `create` conforme o id já exista.
  for (const par of [
    'atual.lancamentoId\n      ? await tx.lancamentoFinanceiro.update',
    'atual.contaReceberId\n      ? await tx.contaReceber.update',
    'atual.contaPagarId\n      ? await tx.lancamentoFinanceiro.update',
  ]) {
    assert.ok(TITULOS.includes(par), `a geracao deixou de atualizar: ${par.slice(0, 30)}`)
  }
})

test('as tres FKs sao UNIQUE no schema — e a garantia de nao duplicar', () => {
  const schema = ler('prisma/schema.prisma')
  const bloco = schema.slice(
    schema.indexOf('model LancamentoBaas {'),
    schema.indexOf('model LancamentoBaasItem'),
  )
  for (const fk of ['lancamentoId', 'contaReceberId', 'contaPagarId']) {
    assert.ok(
      new RegExp(`${fk}\\s+String\\?\\s+@unique`).test(bloco),
      `${fk} perdeu o UNIQUE — o conjunto pode duplicar`,
    )
  }
})

/* ========================================================================= *
 * OS VALORES — AR e AP nunca se misturam
 * ========================================================================= */

test('AR = TARIFAS; AP = RESIDUAL; e um nao e o outro', () => {
  // O exemplo do pedido, numero a numero.
  const c = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_650 }], 25)

  assert.equal(c.totalTarifas, 10_065)
  assert.equal(c.saldoRemanescente, 89_935)
  assert.equal(c.overpriceValor, 22_483.75)
  assert.equal(c.valorCliente, 67_451.25)

  // Os dois títulos, cada um com o seu valor.
  const ar = c.totalTarifas
  const ap = c.valorCliente
  assert.equal(ar, 10_065)
  assert.equal(ap, 67_451.25)
  assert.notEqual(ar, ap, 'AR e AP viraram o mesmo numero')

  // A RECEITA e o saldo integral apurado; o RESULTADO e tarifas + overprice.
  assert.equal(receitaBaas(c), 100_000)
  assert.equal(despesaBaas(c), ap)
  assert.equal(resultadoBaas(c), 32_548.75)

  // E a soma dos dois títulos não é receita de nada — nem do período, nem do
  // parceiro. É o erro que "não misturar os dois valores" previne.
  assert.notEqual(ar + ap, receitaBaas(c))
  assert.notEqual(ar + ap, resultadoBaas(c))
})

test('a cascata FECHA: tarifas + overprice + residual = saldo', () => {
  const c = calcular(100_000, [{ nome: 'PIX', preco: 0.10, volume: 100_650 }], 25)
  assert.equal(
    Math.round((c.totalTarifas + c.overpriceValor + c.valorCliente) * 100) / 100,
    c.saldoInicial,
  )
})

/* ========================================================================= *
 * O BACKFILL
 * ========================================================================= */

test('a sincronizacao so olha lancamentos INCOMPLETOS', () => {
  // Conjunto completo não é tocado — nem para "conferir": reescrever um
  // título correto é risco sem ganho.
  assert.ok(TITULOS.includes('{ lancamentoId: null }'))
  assert.ok(TITULOS.includes('{ contaReceberId: null }'))
  assert.ok(TITULOS.includes('{ contaPagarId: null }'))
  assert.ok(TITULOS.includes('OR: ['), 'a busca deixou de ser por ausencia de titulo')
})

test('a sincronizacao NAO mexe em nada liquidado', () => {
  const bloco = TITULOS.slice(TITULOS.indexOf('export async function sincronizarTitulosFaltantes'))
  assert.ok(bloco.includes('await liquidacaoDe(lb.id)'), 'o reparo deixou de conferir liquidacao')
  assert.ok(bloco.includes('if (liq.liquidado)'))
  assert.ok(bloco.includes('continue'), 'o reparo passou a reescrever historico liquidado')
})

test('a sincronizacao usa os valores GRAVADOS — nao a tarifa de hoje', () => {
  const bloco = TITULOS.slice(TITULOS.indexOf('export async function sincronizarTitulosFaltantes'))
  assert.ok(bloco.includes('tarifas: lb.totalTarifas'), 'o reparo recalcula com preco atual')
  assert.ok(bloco.includes('despesa: lb.valorCliente'), 'o reparo perdeu a comissao gravada')
  // A RECEITA tambem vem do snapshot, e e o `saldoInicial` gravado — nao
  // `totalTarifas + overpriceValor`, que e a margem.
  assert.ok(bloco.includes('receita: lb.saldoInicial'), 'o reparo nao usa o saldo gravado')
  assert.ok(
    !bloco.includes('lb.totalTarifas + lb.overpriceValor'),
    'o reparo voltou a gravar a margem como receita',
  )
  assert.ok(
    !bloco.includes('calcular('),
    'o reparo voltou a recalcular do cadastro, reescrevendo o historico',
  )
})

test('uma falha NAO interrompe o reparo dos outros', () => {
  const bloco = TITULOS.slice(TITULOS.indexOf('export async function sincronizarTitulosFaltantes'))
  assert.ok(bloco.includes('try {') && bloco.includes('falhas.push'))
})

test('a rota de sincronizacao e POST e exige manage_receita', () => {
  // GET que escreve seria pre-carregado por qualquer prefetch do navegador.
  assert.ok(SYNC.includes('export async function POST'))
  assert.ok(!SYNC.includes('export async function GET'))
  assert.ok(SYNC.includes("'manage_receita'"))
})

test('a sincronizacao e auditada quando muda algo', () => {
  assert.ok(SYNC.includes('SINCRONIZOU_TITULOS_BAAS'))
  assert.ok(
    SYNC.includes('if (r.reparados > 0 || r.falhas.length > 0)'),
    'passou a auditar "examinei 0" a cada clique',
  )
})

/* ========================================================================= *
 * "FECHAR" NÃO EXISTE MAIS
 * ========================================================================= */

test('nenhuma rota aceita a acao de FECHAR', () => {
  for (const [nome, txt] of [['POST', POST], ['[id]', ID]] as const) {
    assert.ok(!txt.includes("acao === 'fechar'"), `${nome} ainda aceita fechar`)
    assert.ok(!txt.includes("status: 'FECHADO'"), `${nome} ainda grava FECHADO`)
  }
})

test('a UI nao oferece FECHAR — oferece EXCLUIR', () => {
  const ui = ler('app/dashboard/lancamento-baas/LancamentoBaasClient.tsx')
  assert.ok(!ui.includes('>Fechar lançamento<'))
  assert.ok(ui.includes('>Excluir<'), 'o botao de excluir saiu da tela')
})

test('o que bloqueia editar e excluir e a LIQUIDACAO, nao um status', () => {
  assert.ok(ID.includes('await liquidacaoDe(id)'))
  assert.ok(
    !ID.includes("atual.status === 'FECHADO'"),
    'voltou a usar o status manual como tranca',
  )
})
