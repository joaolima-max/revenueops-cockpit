/**
 * PREVISÃO FINANCEIRA — a aritmética e as regras que impedem dupla contagem.
 *
 * ── A REGRA CENTRAL DO MÓDULO ────────────────────────────────────────────
 *
 * PREVISTO e REALIZADO são bases DIFERENTES, e o realizado tem uma fonte só:
 * `LancamentoFinanceiro`. As tabelas novas (`Orcamento`, `DespesaFutura`,
 * `ReceitaPrevista`) guardam apenas o lado previsto.
 *
 * Um campo "valor realizado" preenchido à mão criaria uma segunda versão do
 * faturamento, divergente da primeira no primeiro ajuste de lançamento — duas
 * telas do mesmo sistema respondendo números diferentes para "quanto faturamos
 * em outubro".
 *
 * ── AS QUATRO PORTAS DA DUPLA CONTAGEM ───────────────────────────────────
 *
 * Esta suíte tranca as quatro:
 *
 *   1. `ContaReceber` somada ao lado da receita (é o MESMO dinheiro);
 *   2. receita prevista somada CHEIA ao realizado (e não pelo remanescente);
 *   3. despesa futura já materializada somada junto com o lançamento;
 *   4. `LancamentoDiario.saldoEmConta` tratado como caixa próprio.
 *
 * A aritmética é verificada direto (funções puras); as regras de consulta, pela
 * estrutura do código — que é o que impede uma delas de voltar num refactor.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  centavos, execucao, previstoRealizado, tendencia, media, calcularForecast,
  projecaoDoPeriodo, pontoCaixa, curvaCaixa, diferencaResultadoCaixa,
  ocorrenciasDespesa, LIMIAR_ATENCAO, MINIMO_MESES_FORECAST,
  STATUS_PREVISAO, STATUS_ORCAMENTO, RECORRENCIAS, JANELAS_MESES,
} from '../lib/previsao-calculo'
import { periodosDaJanela, fracaoDecorrida, periodoFechado } from '../lib/previsao'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

/* ========================================================================= *
 * ORÇADO × REALIZADO — o exemplo da especificação
 * ========================================================================= */

test('o exemplo EXATO do pedido: 100 mil orçado, 72 mil realizado', () => {
  //   Orçamento   R$ 100.000
  //   Realizado   R$  72.000
  //   Saldo       R$  28.000
  //   Utilização        72%
  const e = execucao(100_000, 72_000)
  assert.equal(e.orcado, 100_000)
  assert.equal(e.realizado, 72_000)
  assert.equal(e.saldo, 28_000)
  assert.equal(e.utilizacao, 72)
  assert.equal(e.desvio, -28_000)
  assert.equal(e.situacao, 'DENTRO')
})

test('SALDO e DESVIO sao o mesmo numero com sinais opostos — e as duas perguntas', () => {
  // "Saldo" responde "quanto ainda posso gastar"; "desvio" responde "quanto
  // fugi do plano". Dar um numero so obrigaria o leitor a inverter o sinal de
  // cabeca em metade das leituras.
  const e = execucao(100_000, 120_000)
  assert.equal(e.saldo, -20_000, 'estourou: o saldo e negativo')
  assert.equal(e.desvio, 20_000, 'estourou: o desvio e positivo')
  assert.equal(centavos(e.saldo + e.desvio), 0)
})

test('ESTOURADO acima de 100%, ATENCAO a partir do limiar', () => {
  assert.equal(execucao(100, 101).situacao, 'ESTOURADO')
  assert.equal(execucao(100, 100).situacao, 'ATENCAO', '100% ainda nao estourou')
  assert.equal(execucao(100, 100 * LIMIAR_ATENCAO).situacao, 'ATENCAO')
  assert.equal(execucao(100, 100 * LIMIAR_ATENCAO - 0.01).situacao, 'DENTRO')
})

test('o limiar de atencao e 85% — e a tela cita a MESMA constante', () => {
  // Nao e um numero arbitrario disfarcado de regra: e o ponto em que ainda da
  // para remanejar. A 95% o mes ja esta decidido; a 70% o alerta vira ruido.
  assert.equal(LIMIAR_ATENCAO, 0.85)
  // Nenhuma tela repete 0.85 na mao — todas leem a constante.
  for (const arquivo of [
    'app/dashboard/financeiro/previsao/page.tsx',
    'app/dashboard/financeiro/previsao/centros-custo/page.tsx',
    'app/dashboard/financeiro/previsao/orcamento/OrcamentoClient.tsx',
  ]) {
    const t = ler(arquivo)
    assert.ok(t.includes('LIMIAR_ATENCAO'), `${arquivo} nao usa a constante`)
    assert.ok(!/\b0\.85\b/.test(t), `${arquivo} repetiu 0.85 na mao`)
  }
})

test('SEM ORCAMENTO, a utilizacao e NULL — nunca zero', () => {
  // "0% utilizado" afirma que existe um teto e nada foi gasto. Sem orcamento, o
  // percentual nao tem denominador e a pergunta nao se aplica.
  const e = execucao(0, 50_000)
  assert.equal(e.situacao, 'SEM_ORCAMENTO')
  assert.equal(e.utilizacao, null)
  assert.equal(e.desvioPercentual, null)
  // E o realizado nao desaparece: ele continua visivel no desvio.
  assert.equal(e.desvio, 50_000)
  assert.equal(e.saldo, -50_000)
})

test('a SITUACAO descreve o fato, nao o julgamento', () => {
  // Em DESPESA, estourar e ruim. Em RECEITA, superar o previsto e bom. A
  // funcao nao recebe o tipo porque o saldo nao depende dele — quem pinta de
  // vermelho ou verde e a tela, que sabe o tipo.
  const bloco = ler('lib/previsao-calculo.ts').slice(
    ler('lib/previsao-calculo.ts').indexOf('export function execucao('),
    ler('lib/previsao-calculo.ts').indexOf('export interface PrevistoRealizado'),
  )
  assert.ok(!bloco.includes('RECEITA'), 'execucao passou a depender do tipo')
  assert.ok(!bloco.includes('DESPESA'), 'execucao passou a depender do tipo')
})

/* ========================================================================= *
 * PREVISTO × REALIZADO — e o REMANESCENTE, que evita a dupla contagem
 * ========================================================================= */

test('o REMANESCENTE e previsto menos realizado', () => {
  // ESTE E O NUMERO QUE EVITA A DUPLA CONTAGEM NO CAIXA.
  //
  // Novembro com 500 mil previstos e 300 mil lancados vale 300 mil REAIS mais
  // 200 mil de EXPECTATIVA — nao 800 mil.
  const p = previstoRealizado(500_000, 300_000)
  assert.equal(p.previsto, 500_000)
  assert.equal(p.realizado, 300_000)
  assert.equal(p.remanescente, 200_000)
  assert.equal(p.desvio, -200_000)
  assert.equal(p.cumprimento, 60)

  // A soma que NAO se faz.
  assert.notEqual(p.previsto + p.realizado, 500_000)
})

test('o REMANESCENTE nunca e NEGATIVO', () => {
  // Quando o realizado ja passou do previsto, o que falta e ZERO — e nao um
  // valor negativo que subtrairia do caixa um dinheiro que entrou de verdade.
  const p = previstoRealizado(100_000, 150_000)
  assert.equal(p.remanescente, 0)
  assert.equal(p.desvio, 50_000, 'o excesso continua visivel no desvio')
  assert.equal(p.cumprimento, 150)
})

test('sem previsao, o cumprimento e NULL', () => {
  const p = previstoRealizado(0, 80_000)
  assert.equal(p.cumprimento, null)
  assert.equal(p.remanescente, 0)
  assert.equal(p.realizado, 80_000)
})

/* ========================================================================= *
 * TENDÊNCIA E FORECAST
 * ========================================================================= */

test('a tendencia e a INCLINACAO da reta, nao "ultimo menos primeiro"', () => {
  // Numa serie perfeitamente linear os dois metodos concordam.
  const t = tendencia([100, 200, 300, 400])
  assert.ok(t)
  assert.equal(t.porMes, 100)
  assert.equal(t.direcao, 'alta')
})

test('um mes ATIPICO nas pontas DESLOCA a tendencia, nao a determina', () => {
  // E a razao de usar minimos quadrados: "ultimo menos primeiro" deixaria um
  // unico mes definir a tendencia inteira.
  //
  // Serie estavel com um pico no PRIMEIRO mes. Por "ultimo menos primeiro", a
  // tendencia seria fortemente negativa; pela reta, ela e suave.
  const serie = [500, 100, 100, 100, 100]
  const ultimoMenosPrimeiro = (serie[serie.length - 1] - serie[0]) / (serie.length - 1)
  assert.equal(ultimoMenosPrimeiro, -100)

  const t = tendencia(serie)
  assert.ok(t)
  assert.ok(
    Math.abs(t.porMes) < Math.abs(ultimoMenosPrimeiro),
    'a reta deveria ser menos sensivel ao mes atipico',
  )
})

test('tendencia ESTAVEL abaixo de 0,5% da media', () => {
  // Abaixo disso a "tendencia" e ruido de arredondamento, e declara-la como
  // alta ou baixa seria dar significado a nada.
  const t = tendencia([100_000, 100_050, 100_100, 100_150])
  assert.ok(t)
  assert.equal(t.direcao, 'estavel')
  assert.ok(t.percentual !== null && Math.abs(t.percentual) < 0.5)
})

test('tendencia exige pelo menos DOIS pontos', () => {
  assert.equal(tendencia([]), null)
  assert.equal(tendencia([100]), null)
  assert.ok(tendencia([100, 200]))
})

test('media de serie vazia e NULL, nunca zero', () => {
  assert.equal(media([]), null)
  assert.equal(media([100, 200, 300]), 200)
})

test('o FORECAST exige tres meses fechados — dois pontos nao dizem nada', () => {
  // Dois pontos definem uma reta perfeita e nao dizem nada sobre tendencia.
  // Projetar a partir deles produziria um numero com cara de previsao e nenhum
  // conteudo — e e exatamente o que o pedido proibe ("sem inventar dados").
  assert.equal(MINIMO_MESES_FORECAST, 3)
  assert.equal(calcularForecast([100]), null)
  assert.equal(calcularForecast([100, 200]), null)
  assert.ok(calcularForecast([100, 200, 300]))
})

test('o forecast devolve as CINCO leituras que o pedido lista', () => {
  // realizado acumulado, media historica, tendencia, projecao do periodo e o
  // forecast dos proximos meses.
  const f = calcularForecast([100, 200, 300], 3)
  assert.ok(f)
  assert.equal(f.mesesConsiderados, 3)
  assert.equal(f.realizadoAcumulado, 600)
  assert.equal(f.mediaHistorica, 200)
  assert.ok(f.tendencia)
  assert.equal(f.tendencia.porMes, 100)
  assert.equal(f.proximosMeses.length, 3)
  // Media + tendencia acumulada: 200+100, 200+200, 200+300.
  assert.deepEqual(f.proximosMeses, [300, 400, 500])
  // A projecao do periodo em curso e preenchida por quem tem a fracao do mes.
  assert.equal(f.projecaoPeriodoAtual, null)
})

test('o forecast NUNCA projeta valor NEGATIVO', () => {
  // Uma tendencia de queda forte projetaria receita negativa depois de alguns
  // meses, o que nao existe. O piso e zero, e a tendencia aparece ao lado para
  // que a queda nao desapareca da leitura.
  const f = calcularForecast([1000, 600, 200], 6)
  assert.ok(f)
  assert.ok(f.tendencia)
  assert.equal(f.tendencia.direcao, 'baixa')
  for (const v of f.proximosMeses) {
    assert.ok(v >= 0, `projetou valor negativo: ${v}`)
  }
  // E o ultimo mes do horizonte chegou ao piso.
  assert.equal(f.proximosMeses[f.proximosMeses.length - 1], 0)
})

test('a PROJECAO do periodo em curso estende o realizado pelo tempo decorrido', () => {
  // 10 milhoes em 7 de 30 dias projetam ~42,8 milhoes para o mes.
  const p = projecaoDoPeriodo(10_000_000, 7 / 30)
  assert.ok(p !== null)
  assert.equal(Math.round(p), 42_857_143)
})

test('projecao com ZERO decorrido e NULL, nao infinito', () => {
  assert.equal(projecaoDoPeriodo(1000, 0), null)
  assert.equal(projecaoDoPeriodo(1000, -1), null)
})

test('mes JA FECHADO nao se projeta: a projecao E o realizado', () => {
  assert.equal(projecaoDoPeriodo(50_000, 1), 50_000)
})

/* ========================================================================= *
 * FLUXO DE CAIXA
 * ========================================================================= */

const MOVIMENTO_ZERO = {
  entradasRealizadas: 0, entradasAReceber: 0, entradasPrevistas: 0,
  saidasRealizadas: 0, saidasAPagar: 0, saidasPrevistas: 0,
}

test('a CONTA DO CAIXA, exatamente como o pedido descreve', () => {
  //   saldo atual
  //     + entradas futuras
  //     − saidas futuras
  //   = caixa projetado
  const p = pontoCaixa('2026-11', 100_000, {
    ...MOVIMENTO_ZERO,
    entradasRealizadas: 50_000,
    saidasRealizadas: 20_000,
    entradasAReceber: 30_000,
    entradasPrevistas: 10_000,
    saidasAPagar: 15_000,
    saidasPrevistas: 500_000,
  }, false)

  // Realizado: 100 + 50 − 20 = 130 mil.
  assert.equal(p.geracaoRealizada, 30_000)
  assert.equal(p.saldoRealizado, 130_000)

  // Projetado: 30 + 10 − 15 − 500 = −475 mil.
  assert.equal(p.geracaoProjetada, -475_000)
  assert.equal(p.saldoProjetado, -345_000)
})

test('PERIODO FECHADO nao tem projecao: o projetado E o realizado', () => {
  // Manter a projecao num mes encerrado faria a curva mostrar uma expectativa
  // que o calendario ja respondeu — e um titulo vencido e nao pago em marco
  // apareceria como "entrada futura de marco" para sempre.
  const p = pontoCaixa('2026-03', 0, {
    ...MOVIMENTO_ZERO,
    entradasRealizadas: 100_000,
    entradasAReceber: 999_999,
    saidasPrevistas: 888_888,
  }, true)

  assert.equal(p.geracaoProjetada, 0)
  assert.equal(p.saldoProjetado, p.saldoRealizado)
  assert.equal(p.saldoProjetado, 100_000)
})

test('a CURVA encadeia pelo PROJETADO, nao pelo realizado', () => {
  // A curva responde "quanto vou ter em dezembro", e para chegar la e preciso
  // carregar o que se espera de novembro. Encadear pelo realizado faria cada
  // mes futuro partir do caixa de hoje.
  const pontos = curvaCaixa(1000, [
    { periodo: '2026-10', movimento: { ...MOVIMENTO_ZERO, entradasRealizadas: 500 }, fechado: true },
    { periodo: '2026-11', movimento: { ...MOVIMENTO_ZERO, entradasPrevistas: 300 }, fechado: false },
    { periodo: '2026-12', movimento: { ...MOVIMENTO_ZERO, entradasPrevistas: 200 }, fechado: false },
  ])

  assert.equal(pontos[0].saldoProjetado, 1500, 'mes fechado: so o realizado')
  assert.equal(pontos[1].saldoInicial, 1500)
  assert.equal(pontos[1].saldoProjetado, 1800)
  // Dezembro parte dos 1800 de novembro — nao dos 1500 de hoje.
  assert.equal(pontos[2].saldoInicial, 1800)
  assert.equal(pontos[2].saldoProjetado, 2000)
})

test('RESULTADO CONTABIL e GERACAO DE CAIXA sao coisas diferentes', () => {
  // Um mes pode ter resultado positivo e caixa negativo — faturou e nao
  // recebeu, pagou o que devia do mes anterior. A diferenca E o capital de
  // giro do periodo, e e o que explica "demos lucro" e "nao tem dinheiro na
  // conta" serem verdade ao mesmo tempo.
  const d = diferencaResultadoCaixa(500_000, -100_000)
  assert.equal(d.resultadoContabil, 500_000)
  assert.equal(d.geracaoCaixa, -100_000)
  assert.equal(d.diferenca, 600_000)
})

/* ========================================================================= *
 * RECORRÊNCIA DE DESPESA FUTURA
 * ========================================================================= */

const JANELA = ['2026-10', '2026-11', '2026-12', '2027-01']

test('despesa UNICA ocorre uma vez, no mes da data prevista', () => {
  const o = ocorrenciasDespesa({
    valor: 500_000,
    dataPrevista: new Date('2026-11-05T00:00:00Z'),
    recorrencia: 'UNICA',
    recorrenciaFim: null,
  }, JANELA)

  assert.equal(o.length, 1)
  assert.equal(o[0].periodo, '2026-11')
  assert.equal(o[0].valor, 500_000)
})

test('a FOLHA DE PAGAMENTO do pedido: 500 mil, 05/11 — aparece em novembro', () => {
  // O exemplo literal da especificacao.
  const o = ocorrenciasDespesa({
    valor: 500_000,
    dataPrevista: new Date('2026-11-05T00:00:00Z'),
    recorrencia: 'RECORRENTE',
    recorrenciaFim: null,
  }, JANELA)

  assert.ok(o.some((x) => x.periodo === '2026-11' && x.valor === 500_000))
})

test('RECORRENTE sem fim ocorre em TODOS os meses a partir da data prevista', () => {
  const o = ocorrenciasDespesa({
    valor: 1000,
    dataPrevista: new Date('2026-11-05T00:00:00Z'),
    recorrencia: 'RECORRENTE',
    recorrenciaFim: null,
  }, JANELA)

  assert.deepEqual(o.map((x) => x.periodo), ['2026-11', '2026-12', '2027-01'])
  // OUTUBRO fica fora: antes da data prevista nao ha despesa. A recorrencia
  // comeca quando comeca, e nao no inicio da janela consultada.
  assert.ok(!o.some((x) => x.periodo === '2026-10'))
})

test('RECORRENTE com fim para no mes do fim, inclusivo', () => {
  const o = ocorrenciasDespesa({
    valor: 1000,
    dataPrevista: new Date('2026-10-01T00:00:00Z'),
    recorrencia: 'RECORRENTE',
    recorrenciaFim: new Date('2026-12-31T00:00:00Z'),
  }, JANELA)

  assert.deepEqual(o.map((x) => x.periodo), ['2026-10', '2026-11', '2026-12'])
})

test('PARCELADA conta como UNICA — a parcela JA E uma linha', () => {
  // O cadastro de uma despesa em 6x cria seis despesas futuras, uma por
  // vencimento, do mesmo jeito que `LancamentoFinanceiro` faz. Expandir aqui E
  // materializar la contaria a mesma parcela duas vezes.
  const o = ocorrenciasDespesa({
    valor: 1000,
    dataPrevista: new Date('2026-10-15T00:00:00Z'),
    recorrencia: 'PARCELADA',
    recorrenciaFim: null,
  }, JANELA)

  assert.equal(o.length, 1)
  assert.equal(o[0].periodo, '2026-10')
})

test('a recorrencia e expandida NA LEITURA, nao materializada', () => {
  // Uma folha "recorrente sem data final" nao tem quantas linhas materializar.
  // Escolher um numero — 12? 60? — seria inventar um fim que ninguem definiu.
  const bloco = ler('lib/previsao.ts')
  assert.ok(
    bloco.includes('ocorrenciasDespesa(d, periodos)'),
    'a expansao na leitura saiu',
  )
  // E nao existe caminho que grave N linhas a partir de uma recorrencia.
  const rota = ler('app/api/previsao/despesas-futuras/route.ts')
  assert.ok(!rota.includes('createMany'), 'a recorrencia passou a ser materializada')
})

/* ========================================================================= *
 * JANELAS E PERÍODOS
 * ========================================================================= */

test('a janela de 1, 3 e 12 meses termina no periodo de referencia', () => {
  assert.deepEqual(periodosDaJanela('2026-10', 1), ['2026-10'])
  assert.deepEqual(periodosDaJanela('2026-10', 3), ['2026-08', '2026-09', '2026-10'])
  assert.equal(periodosDaJanela('2026-10', 12).length, 12)
  assert.equal(periodosDaJanela('2026-10', 12)[0], '2025-11')
  assert.equal(periodosDaJanela('2026-10', 12)[11], '2026-10')
})

test('a janela atravessa a virada de ano', () => {
  assert.deepEqual(periodosDaJanela('2027-01', 3), ['2026-11', '2026-12', '2027-01'])
})

test('trimestre e ano NAO sao granularidades proprias: sao soma de meses', () => {
  // Uma coluna "trimestre" exigiria decidir o que fazer quando o trimestre
  // mudasse de definicao, e duplicaria o dado mensal.
  assert.deepEqual([...JANELAS_MESES], [1, 3, 12])

  // Sobre o CODIGO, nao sobre os comentarios: o schema EXPLICA que trimestre e
  // ano sao soma de meses, e varrer o arquivo inteiro acusaria a propria
  // explicacao como se fosse o defeito.
  const schema = ler('prisma/schema.prisma')
    .replace(/^\s*\/\/\/.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const proibido of ['trimestre', 'Trimestre']) {
    assert.ok(!schema.includes(proibido), `o schema ganhou coluna de ${proibido}`)
  }
})

test('a janela e CAPADA — nenhuma consulta varre 36 meses a pedido da URL', () => {
  // Sem o teto, `meses=100000` varreria a tabela inteira.
  assert.equal(periodosDaJanela('2026-10', 1000).length, 36)
  assert.equal(periodosDaJanela('2026-10', 0).length, 1)
  assert.equal(periodosDaJanela('2026-10', -5).length, 1)
})

test('fracaoDecorrida: mes fechado = 1, futuro = 0, em curso = proporcao', () => {
  const hoje = new Date('2026-10-07T12:00:00Z')
  assert.equal(fracaoDecorrida('2026-09', hoje), 1, 'mes fechado')
  assert.equal(fracaoDecorrida('2026-11', hoje), 0, 'mes futuro')
  // Outubro tem 31 dias; dia 7.
  assert.equal(fracaoDecorrida('2026-10', hoje), 7 / 31)
})

test('periodoFechado distingue passado de presente e futuro', () => {
  const hoje = new Date('2026-10-07T12:00:00Z')
  assert.equal(periodoFechado('2026-09', hoje), true)
  assert.equal(periodoFechado('2026-10', hoje), false, 'o mes em curso nao fechou')
  assert.equal(periodoFechado('2026-11', hoje), false)
})

/* ========================================================================= *
 * AS QUATRO PORTAS DA DUPLA CONTAGEM
 * ========================================================================= */

const PREVISAO = ler('lib/previsao.ts')

test('PORTA 1 — `ContaReceber` NAO e somada na Previsao', () => {
  // Ela e o MESMO dinheiro que o `LancamentoFinanceiro` de receita, visto como
  // cobranca — e todas as suas linhas nascem do Lancamento BaaS (a rota de
  // Contas a Receber recusa criacao manual, com 405). Soma-la ao lado da
  // receita contaria a tarifa BaaS duas vezes.
  const semComentarios = PREVISAO
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.ok(
    !semComentarios.includes('prisma.contaReceber'),
    'a Previsao passou a somar titulos a receber',
  )
})

test('PORTA 2 — a receita prevista entra pelo REMANESCENTE, nunca cheia', () => {
  const bloco = PREVISAO.slice(
    PREVISAO.indexOf('export async function fluxoDeCaixa'),
    PREVISAO.indexOf('export interface ForecastPrevisao'),
  )
  assert.ok(
    bloco.includes('m.entradasPrevistas += r.remanescente'),
    'a receita prevista voltou a entrar cheia no caixa',
  )
  assert.ok(
    bloco.includes('m.saidasPrevistas += d.remanescente'),
    'a despesa prevista voltou a entrar cheia no caixa',
  )
  // E nenhum caminho soma o `previsto` direto.
  assert.ok(
    !bloco.includes('+= r.previsto'),
    'o previsto cheio entrou na projecao de caixa',
  )
})

test('PORTA 3 — despesa JA MATERIALIZADA sai da previsao', () => {
  // Quando `lancamentoId` esta preenchido, a despesa virou lancamento, e e o
  // lancamento que conta: manter as duas somaria a mesma saida duas vezes.
  const bloco = PREVISAO.slice(
    PREVISAO.indexOf('export async function despesaPrevistaVsRealizada'),
    PREVISAO.indexOf('export interface FluxoDeCaixa'),
  )
  assert.ok(bloco.includes('lancamentoId: null'), 'a despesa materializada voltou a contar')
})

test('PORTA 4 — `saldoEmConta` NAO e tratado como caixa da Bass Pago', () => {
  // E o saldo da conta TRANSACIONAL — dinheiro de cliente em transito, que e
  // exatamente o que o Float mede. Soma-lo ao caixa proprio inflaria o saldo em
  // ordens de grandeza e misturaria dinheiro de terceiro com dinheiro proprio.
  const semComentarios = PREVISAO
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.ok(
    !semComentarios.includes('saldoEmConta'),
    'o saldo da conta transacional entrou no caixa da Previsao',
  )
  assert.ok(
    !semComentarios.includes('lancamentoDiario'),
    'a Previsao passou a ler o lancamento diario',
  )
})

test('o REALIZADO vem SEMPRE de LancamentoFinanceiro', () => {
  // As tabelas de previsao guardam so o lado previsto. Um campo de realizado
  // nelas criaria uma segunda versao do faturamento.
  const schema = ler('prisma/schema.prisma')
  for (const modelo of ['Orcamento', 'DespesaFutura', 'ReceitaPrevista']) {
    const bloco = schema.slice(
      schema.indexOf(`model ${modelo} {`),
      schema.indexOf('}', schema.indexOf(`model ${modelo} {`)),
    )
    assert.ok(
      !/valorRealizado|realizado\s+Float/.test(bloco),
      `${modelo} ganhou um campo de realizado — segunda versao do faturamento`,
    )
  }
  assert.ok(
    PREVISAO.includes('prisma.lancamentoFinanceiro'),
    'o realizado perdeu a sua fonte',
  )
})

test('RASCUNHO nao entra nos indicadores de orcamento', () => {
  // Um teto que ninguem aprovou nao e um teto — e inclui-lo faria o "%
  // utilizado" cair pela metade no momento em que alguem comecasse a digitar o
  // orcamento do ano seguinte.
  for (const nome of ['orcamentoVsRealizado', 'detalhePorCentroCusto']) {
    const bloco = PREVISAO.slice(PREVISAO.indexOf(`export async function ${nome}`))
    assert.ok(
      bloco.includes("status: { in: ['APROVADO', 'ENCERRADO'] }"),
      `${nome} passou a somar orcamento em rascunho`,
    )
  }
})

test('CANCELADO fica fora de previsao e de lancamento', () => {
  assert.ok(
    PREVISAO.includes("status: { not: 'CANCELADO' }"),
    'o filtro de cancelado saiu',
  )
})

/* ========================================================================= *
 * O VOCABULÁRIO, E A FRONTEIRA SERVIDOR/CLIENTE
 * ========================================================================= */

test('os status de previsao e de orcamento sao conjuntos DIFERENTES', () => {
  // "Pago" nao e um estado de previsao, e "previsto" nao e um estado de
  // lancamento. Reaproveitar `StatusLancamento` faria uma despesa futura poder
  // nascer PAGA.
  assert.deepEqual([...STATUS_PREVISAO], ['PREVISTO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO'])
  assert.deepEqual([...STATUS_ORCAMENTO], ['RASCUNHO', 'APROVADO', 'ENCERRADO'])
  assert.deepEqual([...RECORRENCIAS], ['UNICA', 'RECORRENTE', 'PARCELADA'])

  // Nenhum valor de lancamento vazou para a previsao.
  for (const proibido of ['PAGO', 'PENDENTE']) {
    assert.ok(
      !(STATUS_PREVISAO as readonly string[]).includes(proibido),
      `${proibido} entrou nos status de previsao`,
    )
  }
})

test('a RECORRENCIA reusa o enum dos lancamentos — uma gramatica so', () => {
  const schema = ler('prisma/schema.prisma')
  const bloco = schema.slice(
    schema.indexOf('model DespesaFutura {'),
    schema.indexOf('model ReceitaPrevista {'),
  )
  // O espacamento e decidido por `prisma format`, entao a asserção olha a
  // DECLARACAO e nao o alinhamento — que muda sozinho a cada formatacao.
  assert.ok(
    /recorrencia\s+PeriodicidadeLancamento/.test(bloco),
    'a despesa futura criou um segundo enum de recorrencia',
  )
  assert.ok(
    /recorrenciaFim\s+DateTime\?/.test(bloco),
    'a despesa futura perdeu o fim da recorrencia',
  )
})

test('NENHUM Client Component importa `lib/previsao` — ele traz Prisma', () => {
  /**
   * ESTE TESTE TRANCA UM BUILD QUEBRADO, e ele QUEBROU de verdade nesta rodada.
   *
   * `lib/previsao.ts` importa `lib/prisma`, que importa `pg`, que faz
   * `require('fs')`. Um Client Component que importasse qualquer coisa de la
   * arrastava a cadeia inteira para o bundle do navegador:
   *
   *   pg-connection-string → pg → lib/prisma → lib/previsao → ReceitasClient
   *   Module not found: Can't resolve 'fs'
   *
   * `tsc` NAO pega: importar modulo de servidor num componente de cliente e
   * TypeScript perfeitamente valido. So o bundler reclama, e so no build de
   * producao — que e o pior momento para descobrir.
   *
   * Por isso as listas e os rotulos vivem em `lib/previsao-calculo.ts`, que e
   * puro, e `lib/previsao.ts` os reexporta para o codigo de servidor.
   */
  const clientes = [
    'app/dashboard/financeiro/previsao/orcamento/OrcamentoClient.tsx',
    'app/dashboard/financeiro/previsao/receitas/ReceitasClient.tsx',
    'app/dashboard/financeiro/previsao/despesas/DespesasClient.tsx',
    'app/dashboard/financeiro/previsao/VisaoGeralCharts.tsx',
    'components/previsao/PrevisaoCharts.tsx',
    'components/previsao/PrevisaoFiltros.tsx',
    'components/previsao/PrevisaoNav.tsx',
    'components/financeiro/CentrosCustoPanel.tsx',
  ]
  for (const arquivo of clientes) {
    const t = ler(arquivo)
    assert.ok(t.startsWith("'use client'"), `${arquivo} deixou de ser Client Component`)
    assert.ok(
      !/from '@\/lib\/previsao'/.test(t),
      `${arquivo} importa lib/previsao — isso arrasta o driver do Postgres para o navegador`,
    )
    assert.ok(
      !t.includes("from '@/lib/prisma'"),
      `${arquivo} importa Prisma direto`,
    )
  }
})

test('o modulo de calculo e PURO — nenhuma consulta', () => {
  const calculo = ler('lib/previsao-calculo.ts')
  for (const proibido of ["from '@/lib/prisma'", 'prisma.', 'await ']) {
    assert.ok(
      !calculo.includes(proibido),
      `lib/previsao-calculo deixou de ser puro: ${proibido}`,
    )
  }
})

/* ========================================================================= *
 * PERMISSÕES
 * ========================================================================= */

test('as DUAS chaves existem, e nao sao restritas', () => {
  const perms = ler('lib/permissions.ts')
  assert.ok(perms.includes("key: 'view_previsao'"), 'view_previsao nao existe')
  assert.ok(perms.includes("key: 'manage_previsao'"), 'manage_previsao nao existe')

  // COMUNS, nao restritas: seguem o atalho de ADMIN e o default por perfil,
  // porque previsao e trabalho do Financeiro e nao um dado de socio.
  const restritas = perms.slice(
    perms.indexOf('export const PERMISSOES_RESTRITAS'),
    perms.indexOf('export function permissaoRestrita'),
  )
  assert.ok(!restritas.includes('previsao'), 'as chaves de Previsao viraram restritas')
})

test('VER e LANCAR sao alcadas SEPARADAS', () => {
  // Com uma chave so, quem precisasse ver o forecast ganharia o poder de
  // reescrever o orcamento.
  const acesso = ler('lib/previsao-acesso.ts')
  const ver = acesso.slice(
    acesso.indexOf('export function podeVerPrevisao'),
    acesso.indexOf('export function podeGerenciarPrevisao'),
  )
  const gerenciar = acesso.slice(
    acesso.indexOf('export function podeGerenciarPrevisao'),
    acesso.indexOf('export function podeVerCentrosCusto'),
  )

  // Ver aceita AS DUAS: quem edita tambem le.
  assert.ok(ver.includes("'view_previsao'") && ver.includes("'manage_previsao'"))
  // Gerenciar exige SO a de escrita: ler nao da direito de escrever.
  assert.ok(gerenciar.includes("'manage_previsao'"))
  assert.ok(!gerenciar.includes("'view_previsao'"), 'ler passou a dar direito de escrever')
})

test('TODA rota de ESCRITA exige manage_previsao', () => {
  for (const rota of [
    'app/api/previsao/orcamentos/route.ts',
    'app/api/previsao/orcamentos/[id]/route.ts',
    'app/api/previsao/despesas-futuras/route.ts',
    'app/api/previsao/despesas-futuras/[id]/route.ts',
    'app/api/previsao/receitas-previstas/route.ts',
    'app/api/previsao/receitas-previstas/[id]/route.ts',
  ]) {
    const t = ler(rota)
    assert.ok(
      t.includes('await podeGerenciarPrevisaoDoBanco(session)'),
      `${rota} nao confere a alcada de escrita contra o banco`,
    )
    assert.ok(t.includes('status: 403'), `${rota} nao recusa quem nao tem a chave`)
    assert.ok(t.includes('status: 401'), `${rota} nao recusa anonimo`)
  }
})

test('TODA rota de LEITURA exige a chave, e nenhuma e aberta', () => {
  for (const rota of [
    'app/api/previsao/visao-geral/route.ts',
    'app/api/previsao/fluxo-caixa/route.ts',
    'app/api/previsao/forecast/route.ts',
  ]) {
    const t = ler(rota)
    assert.ok(
      t.includes('await podeVerPrevisaoDoBanco(session)'),
      `${rota} nao confere a alcada contra o banco`,
    )
    assert.ok(t.includes('status: 401'), `${rota} nao recusa anonimo`)
    assert.ok(t.includes('status: 403'), `${rota} nao recusa sem a chave`)
  }
})

test('o LAYOUT barra a rota inteira — as sete areas de uma vez', () => {
  // Repetir a checagem em cada pagina criaria sete copias da mesma regra,
  // livres para divergir — e a primeira divergencia seria uma sub-rota
  // esquecida, acessivel por URL direta.
  const layout = ler('app/dashboard/financeiro/previsao/layout.tsx')
  assert.ok(
    layout.includes('await podeVerPrevisaoDoBanco(session)'),
    'o layout nao confere a alcada contra o banco',
  )
  assert.ok(layout.includes('redirect('), 'o layout nao redireciona quem nao tem acesso')
})

test('a ALCADA e conferida CONTRA O BANCO, nunca contra o token', () => {
  /**
   * ESTE TESTE TRANCA O TERCEIRO ACIDENTE DA MESMA FAMÍLIA.
   *
   * O JWT fotografa as permissoes no login e vive 7 dias. `view_previsao` e
   * `manage_previsao` NASCERAM nesta rodada, entao o token de quem ja estava
   * logado nao as tem.
   *
   * Um GESTOR com lista explicita de permissoes, a quem a migration concedeu a
   * chave, seria barrado por uma foto antiga:
   *
   *   1. a lista do token nao tem a chave;
   *   2. a lista NAO esta vazia, entao o fallback por perfil nao e consultado;
   *   3. ele nao e ADMIN, entao o atalho nao se aplica;
   *   4. `hasPermission` devolve false.
   *
   * E a sidebar mostraria o item (ela le do banco), com o clique virando
   * redirect — exatamente o sintoma do bug do `isPartner` e do do
   * `view_conselho`.
   *
   * Entao: o proxy nao decide essas chaves (`PERMISSOES_RECENTES`), e a
   * autoridade — layout e APIs — le do banco.
   */
  const rotasEPaginas = [
    'app/dashboard/financeiro/previsao/layout.tsx',
    'app/dashboard/financeiro/previsao/orcamento/page.tsx',
    'app/dashboard/financeiro/previsao/receitas/page.tsx',
    'app/dashboard/financeiro/previsao/despesas/page.tsx',
    'app/dashboard/financeiro/cadastros/page.tsx',
    'app/api/previsao/visao-geral/route.ts',
    'app/api/previsao/fluxo-caixa/route.ts',
    'app/api/previsao/forecast/route.ts',
    'app/api/previsao/orcamentos/route.ts',
    'app/api/previsao/orcamentos/[id]/route.ts',
    'app/api/previsao/despesas-futuras/route.ts',
    'app/api/previsao/despesas-futuras/[id]/route.ts',
    'app/api/previsao/receitas-previstas/route.ts',
    'app/api/previsao/receitas-previstas/[id]/route.ts',
    'app/api/financeiro/centros-custo/route.ts',
    'app/api/financeiro/centros-custo/[id]/route.ts',
  ]

  for (const arquivo of rotasEPaginas) {
    const t = ler(arquivo)
    // NENHUMA usa a variante que decide pelo token.
    assert.ok(
      !/\bpodeVerPrevisao\(session\)/.test(t),
      `${arquivo} decide pelo token, nao pelo banco`,
    )
    assert.ok(
      !/\bpodeGerenciarPrevisao\(session\)/.test(t),
      `${arquivo} decide pelo token, nao pelo banco`,
    )
    assert.ok(
      !/\bpodeGerenciarCentrosCusto\(session\)/.test(t),
      `${arquivo} decide pelo token, nao pelo banco`,
    )
  }
})

test('o PROXY nao decide as chaves de Previsao', () => {
  // Lista velha para uma chave que nasce ausente e RESTRITIVA, nao permissiva.
  const perms = ler('lib/permissions.ts')
  assert.ok(
    perms.includes("'view_previsao', 'manage_previsao',"),
    'as chaves novas sairam de PERMISSOES_RECENTES',
  )
  assert.ok(perms.includes('export const PERMISSOES_RECENTES'), 'a lista de chaves novas saiu')

  const mod = ler('lib/modules.ts')
  assert.ok(
    mod.includes('if (exigeChaveRecente(feature) && !ctx.doBanco) return true'),
    'o proxy voltou a decidir as chaves novas pelo token',
  )
})

test('a SIDEBAR le do banco — e por isso mostra o item corretamente', () => {
  // `navigationFor` e chamada com `doBanco: true` pelo layout do dashboard, que
  // busca as permissoes com `estadoDoUsuario` a cada navegacao. E a razao de o
  // menu acertar enquanto o proxy errava.
  const mod = ler('lib/modules.ts')
  const bloco = mod.slice(mod.indexOf('export function navigationFor'))
  assert.ok(bloco.includes('doBanco: true'), 'a sidebar passou a decidir pelo token')
})

test('TODA escrita e AUDITADA', () => {
  for (const rota of [
    'app/api/previsao/orcamentos/route.ts',
    'app/api/previsao/orcamentos/[id]/route.ts',
    'app/api/previsao/despesas-futuras/route.ts',
    'app/api/previsao/despesas-futuras/[id]/route.ts',
    'app/api/previsao/receitas-previstas/route.ts',
    'app/api/previsao/receitas-previstas/[id]/route.ts',
    'app/api/financeiro/centros-custo/route.ts',
    'app/api/financeiro/centros-custo/[id]/route.ts',
  ]) {
    assert.ok(ler(rota).includes('logAudit('), `${rota} nao grava trilha de auditoria`)
  }
})

/* ========================================================================= *
 * EXCLUSÃO SEGURA
 * ========================================================================= */

test('CENTRO DE CUSTO em uso NAO se apaga — manda inativar', () => {
  // Apagar um centro com historico apagaria a atribuicao de area de lancamentos
  // ja feitos, e o Orcado x Realizado de periodos fechados mudaria de valor
  // retroativamente.
  const t = ler('app/api/financeiro/centros-custo/[id]/route.ts')
  for (const tabela of [
    'lancamentoFinanceiro.count', 'orcamento.count',
    'despesaFutura.count', 'receitaPrevista.count',
  ]) {
    assert.ok(t.includes(tabela), `a exclusao nao confere ${tabela}`)
  }
  assert.ok(t.includes('Inative-o em vez de excluir'), 'a recusa nao diz o que fazer')
  assert.ok(t.includes('status: 409'), 'a recusa nao usa 409')
})

test('CATEGORIA em uso confere as QUATRO tabelas, nao so lancamentos', () => {
  // Orcamento, despesa futura e receita prevista usam `onDelete: Restrict`:
  // sem conferi-las, excluir uma categoria orcada estouraria um erro de
  // constraint em vez da mensagem que diz o que fazer.
  const t = ler('app/api/financeiro/categorias/[id]/route.ts')
  for (const tabela of ['orcamento.count', 'despesaFutura.count', 'receitaPrevista.count']) {
    assert.ok(t.includes(tabela), `a exclusao de categoria nao confere ${tabela}`)
  }
})

test('ORCAMENTO ENCERRADO nao se exclui', () => {
  // Apagar o teto de um periodo encerrado reescreveria a leitura historica: o
  // mes que fechou com 95% de utilizacao passaria a nao ter orcamento nenhum.
  const t = ler('app/api/previsao/orcamentos/[id]/route.ts')
  assert.ok(t.includes("atual.status === 'ENCERRADO'"), 'o encerrado voltou a ser excluivel')
  assert.ok(t.includes('mude o status para Rascunho'), 'a recusa nao diz a alternativa')
})

test('DESPESA JA LANCADA nao se exclui, e o valor nao se edita', () => {
  const t = ler('app/api/previsao/despesas-futuras/[id]/route.ts')
  // A exclusao perderia a rastreabilidade sem alterar o caixa.
  assert.ok(t.includes('perderia a rastreabilidade'), 'a recusa de exclusao saiu')
  // E editar o valor depois do fato criaria um desvio ficticio.
  assert.ok(t.includes('desvio fictício'), 'a recusa de edicao do valor saiu')
})

test('o RECORTE do orcamento e IMUTAVEL', () => {
  // Muda-lo nao e editar este orcamento: e mover o teto de um recorte para
  // outro, e o resultado seria um orcamento de Comercial virando orcamento de
  // Tecnologia com o historico de aprovacao do primeiro.
  const put = ler('app/api/previsao/orcamentos/[id]/route.ts')
  const bloco = put.slice(put.indexOf('export async function PUT'), put.indexOf('export async function DELETE'))
  const dados = bloco.slice(bloco.indexOf('data: {'), bloco.indexOf('include: INCLUDE', bloco.indexOf('data: {')))
  for (const campo of ['periodo', 'tipo:', 'centroCustoId', 'categoriaId']) {
    assert.ok(!dados.includes(campo), `o PUT passou a alterar ${campo}`)
  }
})

/* ========================================================================= *
 * A NAVEGAÇÃO PROFUNDA
 * ========================================================================= */

test('as SETE areas do pedido existem', () => {
  const nav = ler('components/previsao/PrevisaoNav.tsx')
  for (const label of [
    'Visão Geral', 'Orçamento', 'Receitas Previstas', 'Despesas Futuras',
    'Fluxo de Caixa', 'Centros de Custo', 'Forecast',
  ]) {
    assert.ok(nav.includes(`label: '${label}'`), `a area "${label}" saiu da navegacao`)
  }
})

test('cada area e uma ROTA de verdade, nao uma aba', () => {
  // Rotas de verdade dao o que abas nao dao: cada painel busca so o que
  // precisa, o Next trata cada uma como componente de servidor proprio (com o
  // seu loading e o seu error), e "Orcamento de novembro" e um endereco.
  for (const rota of [
    'app/dashboard/financeiro/previsao/page.tsx',
    'app/dashboard/financeiro/previsao/orcamento/page.tsx',
    'app/dashboard/financeiro/previsao/receitas/page.tsx',
    'app/dashboard/financeiro/previsao/despesas/page.tsx',
    'app/dashboard/financeiro/previsao/fluxo-caixa/page.tsx',
    'app/dashboard/financeiro/previsao/centros-custo/page.tsx',
    'app/dashboard/financeiro/previsao/forecast/page.tsx',
  ]) {
    const t = ler(rota)
    assert.ok(t.includes('export default async function'), `${rota} nao e Server Component`)
  }
})

test('os FILTROS vivem na URL, nao em estado local', () => {
  // As paginas sao Server Components e leem os filtros de `searchParams` — o
  // dado filtrado vem do SERVIDOR, nao de um recorte feito no navegador.
  const filtros = ler('components/previsao/PrevisaoFiltros.tsx')
  assert.ok(filtros.includes('useSearchParams'), 'os filtros sairam da URL')
  assert.ok(filtros.includes('router.push'), 'filtrar deixou de navegar')

  // E a pagina le de `searchParams`, nao de um fetch no cliente.
  const pagina = ler('app/dashboard/financeiro/previsao/page.tsx')
  assert.ok(pagina.includes('filtroDaPagina(await searchParams)'), 'a pagina ignora os filtros da URL')
})

test('a validacao do filtro e a MESMA na pagina e na API', () => {
  // Uma segunda implementacao faria a pagina aceitar o que a rota recusa, e a
  // tela mostraria um recorte que nenhuma API devolve.
  const bloco = PREVISAO.slice(PREVISAO.indexOf('export function filtroDaPagina'))
  assert.ok(bloco.includes('filtroDaQuery(params)'), 'a pagina duplicou a validacao')
})

/* ========================================================================= *
 * OS OITO GRÁFICOS
 * ========================================================================= */

test('os OITO graficos do pedido existem', () => {
  const charts = ler('components/previsao/PrevisaoCharts.tsx')
  // Receita, despesa e resultado usam a MESMA peca de previsto x realizado:
  // tres componentes separados seriam tres copias do mesmo eixo e do mesmo
  // tooltip, livres para divergir.
  assert.ok(charts.includes('export function PrevistoRealizadoChart'))
  assert.ok(charts.includes('export function FluxoCaixaChart'))
  assert.ok(charts.includes('export function OrcamentoPorCentroChart'))
  assert.ok(charts.includes('export function DespesaPorCategoriaChart'))
  assert.ok(charts.includes('export function ForecastChart'))

  // E a tela monta os oito quadros.
  const visao = ler('app/dashboard/financeiro/previsao/VisaoGeralCharts.tsx')
  for (const titulo of [
    'title="Receita"', 'title="Despesas"', 'title="Resultado"',
    'title="Fluxo de caixa"', 'title="Orçamento por centro de custo"',
    'title="Despesas por categoria"', 'title="Forecast de faturamento"',
    'title="Forecast de caixa"',
  ]) {
    assert.ok(visao.includes(titulo), `o quadro ${titulo} saiu`)
  }
})

test('PREVISTO e traco, REALIZADO e solido', () => {
  // A convencao carrega a leitura sem legenda: o que esta cheio aconteceu.
  // Duas barras solidas lado a lado forcariam a conferir a legenda em cada
  // grafico.
  const charts = ler('components/previsao/PrevisaoCharts.tsx')
  const bloco = charts.slice(
    charts.indexOf('export function PrevistoRealizadoChart'),
    charts.indexOf('export function FluxoCaixaChart'),
  )
  assert.ok(/<Bar [^>]*dataKey="realizado"/.test(bloco), 'o realizado deixou de ser barra')
  assert.ok(/<Line [^>]*dataKey="previsto"/.test(bloco), 'o previsto deixou de ser linha')
  assert.ok(bloco.includes('strokeDasharray'), 'o previsto deixou de ser tracejado')
})

test('os graficos NAO sao decorativos', () => {
  const charts = ler('components/previsao/PrevisaoCharts.tsx')
  for (const proibido of ['PieChart', 'RadialBar', 'Treemap', 'filter: drop-shadow']) {
    assert.ok(!charts.includes(proibido), `grafico decorativo: ${proibido}`)
  }
})

test('nenhuma FUNCAO atravessa a fronteira RSC nas paginas da Previsao', () => {
  /**
   * O DEFEITO QUE JA DERRUBOU A VISAO GERAL FINANCEIRA EM PRODUCAO.
   *
   * Funcao nao atravessa a fronteira Server → Client: o React recusa a
   * serializacao com "Functions cannot be passed directly to Client
   * Components" e a tela inteira cai no error boundary, em TODA requisicao.
   *
   * `tsc` nao ve: passar funcao como prop e TypeScript valido.
   */
  const FORMATADORES = [
    'moedaCheia', 'quantidadeCompacta', 'percentual', 'eixoMoeda',
    'figuraMoeda', 'figuraQuantidade', 'figuraPercentual', 'figuraContagem',
  ]

  for (const pagina of [
    'app/dashboard/financeiro/previsao/page.tsx',
    'app/dashboard/financeiro/previsao/orcamento/page.tsx',
    'app/dashboard/financeiro/previsao/receitas/page.tsx',
    'app/dashboard/financeiro/previsao/despesas/page.tsx',
    'app/dashboard/financeiro/previsao/fluxo-caixa/page.tsx',
    'app/dashboard/financeiro/previsao/centros-custo/page.tsx',
    'app/dashboard/financeiro/previsao/forecast/page.tsx',
    'app/dashboard/financeiro/cadastros/page.tsx',
  ]) {
    const texto = ler(pagina)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    const props = texto.match(/\b[a-zA-Z]+=\{[^}]*\}/g) ?? []
    for (const prop of props) {
      const nome = prop.match(/=\{\s*([A-Za-z_$][\w$]*)\s*\}/)?.[1]
      assert.ok(
        !(nome && FORMATADORES.includes(nome)),
        `${pagina} passa o formatador ${nome} como funcao a um componente de cliente`,
      )
    }
  }
})
