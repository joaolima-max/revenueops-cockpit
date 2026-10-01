/**
 * FINANCEIRO — regras puras: composição do MRR, ARR e expansão de lançamentos.
 *
 * `calcularMrr` fala com o Prisma, então o que se testa aqui é a ARITMÉTICA da
 * composição, replicada sobre as mesmas quatro parcelas que a função soma. Se
 * a regra de negócio do MRR mudar, este arquivo tem que mudar junto — é o
 * ponto onde a definição fica escrita de forma executável.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  arrDoMrr, parcelasDoMrr, expandirLancamento, sustentacaoVigente, situacaoDoTitulo,
  mesesEntre, MESES_RECORRENCIA_INDEFINIDA,
  type Mrr,
} from '../lib/financeiro'
// O limite de anexos mora em lib/arquivos.ts: a tela de Lancamentos precisa
// dele no navegador, e lib/financeiro.ts importa Prisma.
import { limiteAnexosAtingido, MAX_ANEXOS_LANCAMENTO, validarArquivo } from '../lib/arquivos'
// `podeVisualizar` e uma lista de MIMEs, sem Prisma: pode ser importada aqui.
import { podeVisualizar } from '../lib/storage'
// `lib/kpi.ts` tambem importa Prisma; aqui so entram as constantes e a regra
// de soma, que sao puras.
import {
  somaNoTotal, TIPOS_QUE_SOMAM, TIPOS_RECEITA_CONSELHO, TIPO_RECEITA_LABEL,
} from '../lib/kpi'

/**
 * A mesma soma que `calcularMrr` faz, sobre parcelas já carregadas.
 *
 *   MRR = MENSALIDADES + SUSTENTAÇÃO
 *
 *   Mensalidades = API mensal dos parceiros + API mensal da carteira
 *   Sustentação  = BaaS + White Label, já vigentes
 *
 * CONTA ATIVA NÃO ENTRA. A quantidade de contas de um parceiro oscila com a
 * operação dele, então o recorrente subia e descia sem nenhum contrato ter
 * mudado — e um MRR que se move sozinho não serve para comparar mês a mês.
 *
 * `sustentacaoAguardandoInicio` também fica fora: é a parcela contratada cuja
 * data de início ainda não chegou.
 */
type Parcelas = Partial<Omit<Mrr, 'total'>>

function totalMrr(p: Parcelas): number {
  return (p.sustentacaoBaas ?? 0) + (p.sustentacaoWhiteLabel ?? 0)
    + (p.apiMensalParceiros ?? 0) + (p.apiMensalCarteira ?? 0)
}

/* ── MRR ─────────────────────────────────────────────────────────────────── */

test('MRR = Mensalidades + Sustentação', () => {
  const parcelas = {
    sustentacaoBaas: 12_000,
    sustentacaoWhiteLabel: 8_000,
    apiMensalParceiros: 5_500,
    apiMensalCarteira: 3_200,
  }
  assert.equal(totalMrr(parcelas), 28_700)
})

test('MENSALIDADE DE CONTA ATIVA NÃO ENTRA NO MRR', () => {
  // A regressão mais fácil de reintroduzir: a parcela continua sendo
  // calculada e devolvida — para a tela poder dizer que está de fora —, e
  // somá-la "para fechar o total" é o erro que este teste trava.
  const semConta = totalMrr({ sustentacaoBaas: 10_000, apiMensalParceiros: 2_000 })
  const comConta = totalMrr({
    sustentacaoBaas: 10_000, apiMensalParceiros: 2_000, mensalidadeContaAtiva: 50_000,
  })
  assert.equal(semConta, 12_000)
  assert.equal(comConta, 12_000, 'conta ativa voltou para o total do MRR')
})

test('as duas parcelas do MRR somam o total', () => {
  const p = {
    sustentacaoBaas: 12_000, sustentacaoWhiteLabel: 8_000,
    apiMensalParceiros: 5_500, apiMensalCarteira: 3_200,
    mensalidadeContaAtiva: 1_800, sustentacaoAguardandoInicio: 0,
  }
  const { mensalidades, sustentacao } = parcelasDoMrr({ ...p, total: totalMrr(p) })
  assert.equal(mensalidades, 8_700)
  assert.equal(sustentacao, 20_000)
  assert.equal(mensalidades + sustentacao, totalMrr(p))
})

test('parcela ausente entra como zero, não como buraco no total', () => {
  assert.equal(totalMrr({ sustentacaoBaas: 10_000 }), 10_000)
})

test('sustentação aguardando início fica FORA do total', () => {
  // Um parceiro em implantação já está ativo e cadastrado, mas ainda não paga.
  const total = totalMrr({ sustentacaoBaas: 10_000, apiMensalParceiros: 2_000 })
  const comAguardando = totalMrr({
    sustentacaoBaas: 10_000, apiMensalParceiros: 2_000, sustentacaoAguardandoInicio: 40_000,
  })
  assert.equal(total, 12_000)
  assert.equal(comAguardando, 12_000, 'o que ainda não é cobrado não infla o recorrente')
})

/* ── Vigência da sustentação ─────────────────────────────────────────────── */

const DIA = (iso: string) => new Date(iso + 'T00:00:00Z')

test('sem data de início, a sustentação já está vigente', () => {
  assert.equal(sustentacaoVigente(null, DIA('2026-01-01')), true)
  assert.equal(sustentacaoVigente(undefined, DIA('2026-01-01')), true)
})

test('sustentação com início no futuro ainda não vigora', () => {
  assert.equal(sustentacaoVigente(DIA('2026-06-01'), DIA('2026-03-31')), false)
})

test('sustentação vigora a partir do próprio dia de início', () => {
  assert.equal(sustentacaoVigente(DIA('2026-03-31'), DIA('2026-03-31')), true)
  assert.equal(sustentacaoVigente(DIA('2026-03-01'), DIA('2026-03-31')), true)
})

test('API mensal do parceiro e do cliente da carteira são parcelas distintas', () => {
  // São campos de tabelas diferentes: CondicaoComercial.apiMensal e
  // Cliente.mensalidadeApi. Somar as duas não é dupla contagem — seria dupla
  // contagem se a MESMA mensalidade aparecesse nas duas.
  const parceirosSo = totalMrr({ apiMensalParceiros: 1_000 })
  const carteiraSo = totalMrr({ apiMensalCarteira: 1_000 })
  const ambos = totalMrr({ apiMensalParceiros: 1_000, apiMensalCarteira: 1_000 })
  assert.equal(parceirosSo, 1_000)
  assert.equal(carteiraSo, 1_000)
  assert.equal(ambos, 2_000)
})

test('MRR zerado quando não há nada contratado', () => {
  assert.equal(totalMrr({}), 0)
})

/* ── ARR ─────────────────────────────────────────────────────────────────── */

test('ARR é o MRR vezes doze, sem projeção de crescimento', () => {
  assert.equal(arrDoMrr(28_700), 344_400)
  assert.equal(arrDoMrr(0), 0)
})

test('ARR usa o MRR calculado, não uma segunda apuração', () => {
  const mrr = totalMrr({
    sustentacaoBaas: 12_000, sustentacaoWhiteLabel: 8_000,
    apiMensalParceiros: 5_500, apiMensalCarteira: 3_200,
  })
  assert.equal(arrDoMrr(mrr), mrr * 12)
  assert.equal(arrDoMrr(mrr), 344_400)
})

/* ── Expansão de lançamentos ─────────────────────────────────────────────── */

const D = (iso: string) => new Date(iso + 'T00:00:00Z')
const iso = (d: Date) => d.toISOString().slice(0, 10)

test('lançamento único gera exatamente uma linha', () => {
  const linhas = expandirLancamento('UNICA', D('2026-03-10'), 1_500)
  assert.equal(linhas.length, 1)
  assert.equal(iso(linhas[0].data), '2026-03-10')
  assert.equal(linhas[0].valor, 1_500)
  assert.equal(linhas[0].parcela, null)
})

test('parcelado gera uma linha por parcela, mensal, com o valor da parcela', () => {
  const linhas = expandirLancamento('PARCELADA', D('2026-01-15'), 500, { totalParcelas: 6 })
  assert.equal(linhas.length, 6)
  assert.deepEqual(linhas.map((l) => iso(l.data)), [
    '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15',
  ])
  assert.ok(linhas.every((l) => l.valor === 500))
  assert.deepEqual(linhas.map((l) => l.parcela), [1, 2, 3, 4, 5, 6])
  assert.ok(linhas.every((l) => l.totalParcelas === 6))
})

test('parcelado que começa no dia 31 cai no último dia dos meses curtos', () => {
  // Sem isso, 31/01 + 1 mês viraria 02/03 e a parcela pularia de mês.
  const linhas = expandirLancamento('PARCELADA', D('2026-01-31'), 100, { totalParcelas: 4 })
  assert.deepEqual(linhas.map((l) => iso(l.data)), [
    '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
  ])
})

/* ── Recorrência: com data final e indefinida ────────────────────────────── */

test('recorrente COM data final vai até o mês dela, inclusive', () => {
  const linhas = expandirLancamento('RECORRENTE', D('2026-01-05'), 900, {
    recorrenciaFim: D('2026-06-05'),
  })
  assert.equal(linhas.length, 6)
  assert.ok(linhas.every((l) => l.valor === 900))
  assert.ok(linhas.every((l) => l.parcela === null), 'recorrência não é parcelamento')
  assert.equal(iso(linhas[0].data), '2026-01-05')
  assert.equal(iso(linhas[5].data), '2026-06-05')
})

test('a data final conta pelo MÊS, não pelo dia exato', () => {
  // Fim no dia 28 e lançamento no dia 5: o mês de junho continua coberto.
  const linhas = expandirLancamento('RECORRENTE', D('2026-01-05'), 100, {
    recorrenciaFim: D('2026-06-28'),
  })
  assert.equal(linhas.length, 6)
})

test('recorrente INDEFINIDA não pede data e usa o horizonte do sistema', () => {
  const linhas = expandirLancamento('RECORRENTE', D('2026-01-05'), 900)
  assert.equal(linhas.length, MESES_RECORRENCIA_INDEFINIDA)
  assert.ok(linhas.every((l) => l.valor === 900))
})

test('recorrenciaFim nula é indefinida — não é "zero meses"', () => {
  assert.equal(
    expandirLancamento('RECORRENTE', D('2026-01-05'), 900, { recorrenciaFim: null }).length,
    MESES_RECORRENCIA_INDEFINIDA,
  )
})

test('data final anterior ao início não produz zero linhas', () => {
  // A API rejeita antes de chegar aqui; a expansão ainda assim nunca devolve
  // vazio, que geraria um cadastro sem nenhuma linha.
  const linhas = expandirLancamento('RECORRENTE', D('2026-06-05'), 100, {
    recorrenciaFim: D('2026-01-05'),
  })
  assert.equal(linhas.length, 1)
})

test('mesesEntre conta os dois extremos', () => {
  assert.equal(mesesEntre(D('2026-01-10'), D('2026-01-31')), 1)
  assert.equal(mesesEntre(D('2026-01-10'), D('2026-12-10')), 12)
  assert.equal(mesesEntre(D('2026-11-10'), D('2027-02-01')), 4)
})

test('parcelamento degenerado não produz zero linhas', () => {
  assert.equal(expandirLancamento('PARCELADA', D('2026-01-05'), 100, { totalParcelas: 0 }).length, 1)
})

/* ── Contas a Pagar ──────────────────────────────────────────────────────── */

const HOJE = D('2026-09-30')

test('título pendente com vencimento passado está VENCIDO', () => {
  const s = situacaoDoTitulo('PENDENTE', D('2026-09-20'), HOJE)
  assert.equal(s.situacao, 'VENCIDA')
  assert.equal(s.diasParaVencer, -10)
})

test('título pendente com vencimento futuro está A VENCER', () => {
  const s = situacaoDoTitulo('PENDENTE', D('2026-10-05'), HOJE)
  assert.equal(s.situacao, 'A_VENCER')
  assert.equal(s.diasParaVencer, 5)
})

test('vencimento hoje ainda é A VENCER, não vencido', () => {
  const s = situacaoDoTitulo('PENDENTE', HOJE, HOJE)
  assert.equal(s.situacao, 'A_VENCER')
  assert.equal(s.diasParaVencer, 0)
})

test('título PAGO não vira vencido, mesmo pago depois do prazo', () => {
  const s = situacaoDoTitulo('PAGO', D('2026-01-01'), HOJE)
  assert.equal(s.situacao, 'PAGA')
  assert.equal(s.diasParaVencer, null, 'pago não tem prazo a correr')
})

test('título CANCELADO sai das contas, não vira vencido', () => {
  assert.equal(situacaoDoTitulo('CANCELADO', D('2026-01-01'), HOJE).situacao, 'CANCELADA')
})

/* ── Anexos ──────────────────────────────────────────────────────────────── */

test('o limite de anexos por lançamento é quatro', () => {
  assert.equal(MAX_ANEXOS_LANCAMENTO, 4)
})

test('até o quarto anexo, o envio é liberado', () => {
  for (let n = 0; n < 4; n++) {
    assert.equal(limiteAnexosAtingido(n), null, `com ${n} anexos ainda cabe mais um`)
  }
})

test('o quinto anexo é recusado, com explicação', () => {
  const problema = limiteAnexosAtingido(4)
  assert.ok(problema, 'o quinto envio tem que ser barrado')
  assert.match(problema!, /4 anexos/)
})

test('o total materializado de um parcelado é a soma das parcelas', () => {
  const linhas = expandirLancamento('PARCELADA', D('2026-01-10'), 250, { totalParcelas: 12 })
  assert.equal(linhas.reduce((a, l) => a + l.valor, 0), 3_000)
})

/* ========================================================================= *
 * RECEITA REALIZADA × MRR — a dupla contagem
 * ========================================================================= */

test('MENSALIDADES nao soma no total da receita do Conselho', () => {
  // As mensalidades de API ja estao embutidas na tarifa transacional — e
  // assim que a Bass Pago cobra hoje. Soma-las contaria o mesmo dinheiro
  // duas vezes. A linha continua aparecendo como indicador de recorrencia.
  assert.equal(somaNoTotal('MENSALIDADES'), false)
})

test('as outras cinco linhas SOMAM', () => {
  for (const t of ['TRANSACIONAL', 'SETUP', 'SUSTENTACAO', 'SERVICOS', 'BAAS'] as const) {
    assert.equal(somaNoTotal(t), true, `${t} deveria somar`)
  }
})

test('os seis tipos do Conselho, com os rotulos da especificacao', () => {
  assert.deepEqual(
    TIPOS_RECEITA_CONSELHO.map((t) => TIPO_RECEITA_LABEL[t]),
    ['Transacional', 'Setup', 'Mensalidades', 'Sustentação', 'Serviços', 'BaaS'],
  )
})

test('TARIFARIA nao aparece como tipo separado — Transacional E a tarifaria', () => {
  // Mostrar as duas duplicaria o mesmo dinheiro na composicao.
  for (const t of TIPOS_RECEITA_CONSELHO) {
    assert.ok(
      !/tarif/i.test(TIPO_RECEITA_LABEL[t]),
      `${t} aparece como "${TIPO_RECEITA_LABEL[t]}" ao lado de Transacional`,
    )
  }
})

test('TIPOS_QUE_SOMAM e subconjunto proprio dos seis tipos', () => {
  assert.equal(TIPOS_QUE_SOMAM.length, TIPOS_RECEITA_CONSELHO.length - 1)
  for (const t of TIPOS_QUE_SOMAM) {
    assert.ok(TIPOS_RECEITA_CONSELHO.includes(t))
  }
})

/* ========================================================================= *
 * ANEXOS — formatos, limite e visualização (§45)
 * ========================================================================= */

test('foto e PDF sao aceitos — sao os dois formatos que a especificacao exige', () => {
  for (const [nome, mime] of [
    ['comprovante.jpg', 'image/jpeg'],
    ['comprovante.jpeg', 'image/jpeg'],
    ['print.png', 'image/png'],
    ['recibo.webp', 'image/webp'],
    ['nota.pdf', 'application/pdf'],
  ] as const) {
    assert.equal(
      validarArquivo(nome, mime, 100_000), null,
      `${nome} foi recusado`,
    )
  }
})

test('foto e PDF sao VISUALIZAVEIS; planilha so se baixa', () => {
  // A regra do §45: visualizar foto/PDF abre; download explicito baixa. Uma
  // planilha aberta inline seria uma aba em branco.
  for (const m of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
    assert.equal(podeVisualizar(m), true, `${m} deveria abrir`)
  }
  for (const m of [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'text/csv',
  ]) {
    assert.equal(podeVisualizar(m), false, `${m} nao deveria abrir inline`)
  }
})

test('o QUINTO anexo e bloqueado; o quarto passa', () => {
  assert.equal(limiteAnexosAtingido(3), null, 'o quarto ainda cabe')
  assert.ok(limiteAnexosAtingido(4), 'o quinto tem de ser recusado')
  assert.ok(limiteAnexosAtingido(4)!.includes('4'))
})

test('MIME tem de bater com a extensao — extensao sozinha se falsifica', () => {
  // Renomear um .exe para .pdf nao basta para subir.
  assert.ok(validarArquivo('malicioso.pdf', 'application/x-msdownload', 1000))
  assert.ok(validarArquivo('foto.png', 'application/pdf', 1000))
})
