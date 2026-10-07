/**
 * COCKPIT — a janela de 7, 30 e 90 dias, e o piso de 01/06.
 *
 * ── AS DUAS REGRAS ───────────────────────────────────────────────────────
 *
 * 1. A SÉRIE DIÁRIA COMEÇA EM 01/06/2026 e nada anterior é exibido.
 *
 *    Era 01/10/2026 até a normalização histórica (migration v29). O piso de
 *    outubro existia porque fevereiro a setembro tinham UM lançamento por mês,
 *    com o valor do mês inteiro — e uma série diária alimentada por isso
 *    desenharia 29 dias vazios e um pico. Distribuídos dia a dia, junho passou
 *    a ser o primeiro mês com TPV real.
 *
 *    O piso é uma CONSTANTE, não uma data móvel. "O 1º de junho mais recente"
 *    pareceria mais esperto e seria errado: em julho de 2027 o piso saltaria
 *    para 01/06/2027 e apagaria um ano de operação real. O piso marca quando a
 *    base passou a valer — um fato do passado, que não se move.
 *
 * 2. CADA GRÁFICO TEM A SUA JANELA, e o período vem do BACKEND.
 *
 *    Não é um recorte feito no navegador: a janela escolhida gera uma chamada
 *    a `/api/dashboard/series?range=…`. Mandar 90 dias e cortar no cliente
 *    faria o payload ser sempre o maior possível e transformaria o filtro numa
 *    afirmação do cliente sobre o que o servidor mandou.
 *
 * ── O QUE SE TESTA SEM BANCO ─────────────────────────────────────────────
 *
 * `janelaDiaria` e `rangeDias` são PURAS: recebem o pedido e a data de
 * referência e devolvem o intervalo. É nelas que as duas regras vivem.
 *
 * A integração (consulta, API, componente) é verificada estruturalmente.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  janelaDiaria, rangeDias, RANGES_DIAS, RANGE_PADRAO, DATA_MINIMA_ATIVIDADE,
} from '../lib/kpi'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

/**
 * O FONTE SEM COMENTÁRIOS.
 *
 * Estes testes afirmam a AUSÊNCIA de coisas no código — um gráfico removido,
 * um id que não deve voltar. Sem isto, o comentário que EXPLICA a remoção
 * ("`id: 'atividade'` saiu porque…") faria o teste falhar, e a documentação
 * do produto passaria a ser proibida no arquivo que ela documenta.
 */
const semComentarios = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const iso = (d: Date) => d.toISOString().slice(0, 10)

/* ========================================================================= *
 * O PISO DE 01/10
 * ========================================================================= */

test('a data minima da serie diaria e 01/06/2026', () => {
  /**
   * ERA 01/10/2026, e o piso de outubro existia por um motivo que deixou de
   * valer: de fevereiro a setembro cada mes tinha UM lancamento, no ultimo
   * dia, com o valor do MES INTEIRO. Uma serie diaria alimentada por isso
   * desenharia 29 dias vazios e um pico de R$ 1,4 bilhao.
   *
   * A migration v29 distribuiu esses consolidados dia a dia, com soma
   * identica ao original. JUNHO e o primeiro mes com TPV real, e e dele que a
   * base passa a sustentar leitura diaria — fevereiro a maio so tem
   * quantidade de transacoes.
   */
  assert.equal(iso(DATA_MINIMA_ATIVIDADE), '2026-06-01')
})

test('o piso e CONSTANTE, nao calculado a partir de hoje', () => {
  // Uma data movel ("o 1º de outubro mais recente") apagaria um ano de
  // operacao real na virada de outubro de 2027. O piso e um fato do passado.
  const K = ler('lib/kpi.ts')
  assert.ok(
    K.includes('export const DATA_MINIMA_ATIVIDADE = new Date(Date.UTC(2026, 5, 1))'),
    'o piso deixou de ser uma constante',
  )
  // E nao e derivado do relogio.
  const bloco = K.slice(
    K.indexOf('export const DATA_MINIMA_ATIVIDADE'),
    K.indexOf('export const RANGES_DIAS'),
  )
  assert.ok(!bloco.includes('new Date()'), 'o piso passou a depender de hoje')
})

test('a janela NUNCA comeca antes do piso', () => {
  // 90 dias antes de 07/10/2026 seria 10/07/2026 — anterior ao piso. A janela
  // e encurtada, e nenhum dado anterior e exibido.
  const hoje = new Date('2026-10-07T12:00:00Z')
  for (const dias of RANGES_DIAS) {
    const j = janelaDiaria(dias, hoje)
    assert.ok(
      j.inicio.getTime() >= DATA_MINIMA_ATIVIDADE.getTime(),
      `a janela de ${dias} dias comecou antes do piso`,
    )
  }
})

test('com o piso em junho, as tres janelas sao DIFERENTES ja em outubro', () => {
  /**
   * ESTE E O GANHO DA NORMALIZACAO, e e o que o pedido chamava de "os
   * graficos nao podem mais comecar artificialmente em 01/10".
   *
   * Com o piso em 01/10, em 07/10/2026 as tres janelas devolviam os MESMOS 7
   * dias e duas delas vinham `limitada`. Com o piso em junho, 30 e 90 dias
   * medem o que prometem — ha historico para elas.
   */
  const hoje = new Date('2026-10-07T12:00:00Z')
  const [j7, j30, j90] = RANGES_DIAS.map((d) => janelaDiaria(d, hoje))

  assert.equal(iso(j7.inicio), '2026-10-01')
  assert.equal(j7.dias, 7)

  assert.equal(iso(j30.inicio), '2026-09-08')
  assert.equal(j30.dias, 30)

  assert.equal(iso(j90.inicio), '2026-07-10')
  assert.equal(j90.dias, 90)

  // NENHUMA foi encurtada pelo piso: ha mais de 90 dias de base desde junho.
  for (const j of [j7, j30, j90]) {
    assert.equal(j.limitada, false, `${j.pedidos} dias nao deveria estar limitada`)
  }

  // E `pedidos` preserva o que foi PEDIDO, para a tela poder dizer o que cortou.
  assert.deepEqual([j7, j30, j90].map((j) => j.pedidos), [7, 30, 90])
})

test('o piso AINDA encurta, quando a janela pedida o atravessa', () => {
  // `limitada` nao morreu: em 20/06/2026 uma janela de 90 dias comecaria em
  // marco, e o piso a corta em 01/06. A tela continua precisando declarar.
  const hoje = new Date('2026-06-20T12:00:00Z')
  const j90 = janelaDiaria(90, hoje)
  assert.equal(iso(j90.inicio), '2026-06-01')
  assert.equal(j90.dias, 20)
  assert.equal(j90.limitada, true)
})

test('passados 90 dias do piso, as tres janelas sao DIFERENTES', () => {
  // Em 01/03/2027 ja ha mais de 90 dias desde o piso: nenhuma janela e cortada
  // e as tres medem o que prometem.
  const hoje = new Date('2027-03-01T12:00:00Z')
  const j7 = janelaDiaria(7, hoje)
  const j30 = janelaDiaria(30, hoje)
  const j90 = janelaDiaria(90, hoje)

  assert.equal(j7.dias, 7)
  assert.equal(j30.dias, 30)
  assert.equal(j90.dias, 90)
  for (const j of [j7, j30, j90]) assert.equal(j.limitada, false)

  // O piso continua respeitado, e segue sendo a mesma data.
  assert.equal(iso(DATA_MINIMA_ATIVIDADE), '2026-06-01')
})

/* ========================================================================= *
 * A JANELA
 * ========================================================================= */

test('a janela de N dias INCLUI hoje', () => {
  // "Ultimos 7 dias" e hoje e os 6 anteriores — nao hoje e os 7 anteriores.
  // Errar por um dia aqui deslocaria todo o grafico.
  const hoje = new Date('2027-06-15T12:00:00Z')
  const j = janelaDiaria(7, hoje)
  assert.equal(iso(j.inicio), '2027-06-09')
  // O fim e EXCLUSIVO: o dia seguinte a hoje.
  assert.equal(iso(j.fim), '2027-06-16')
  assert.equal(j.dias, 7)
})

test('a janela atravessa a virada de mes e de ano', () => {
  const j = janelaDiaria(30, new Date('2027-01-05T12:00:00Z'))
  assert.equal(iso(j.inicio), '2026-12-07')
  assert.equal(iso(j.fim), '2027-01-06')
  assert.equal(j.dias, 30)
})

test('a janela e de CALENDARIO, nao de registros lancados', () => {
  // A versao anterior cortava por quantidade de dias LANCADOS
  // (`obs.slice(-dias)`), e isso fazia "30 dias" esticar no tempo conforme os
  // fins de semana sem operacao — podia cobrir seis semanas de calendario.
  const K = ler('lib/kpi.ts')
  assert.ok(
    !K.includes('obs.slice(-dias)'),
    'o recorte por quantidade de registros voltou',
  )
  // A consulta filtra por DATA, entre as duas pontas da janela.
  const bloco = K.slice(
    K.indexOf('export async function serieDiaria'),
    K.indexOf('export interface PontoMensalCockpit'),
  )
  assert.ok(
    bloco.includes('data: { gte: j.inicio, lt: j.fim }'),
    'a serie diaria deixou de filtrar por intervalo de datas',
  )
})

test('dia sem lancamento NAO vira zero', () => {
  // Zero afirmaria que o dia teve movimento nenhum; o que houve foi ausencia
  // de lancamento. O mapa sai direto das linhas encontradas — nenhum dia e
  // sintetizado para preencher a janela.
  const K = ler('lib/kpi.ts')
  const bloco = K.slice(
    K.indexOf('export async function serieDiaria'),
    K.indexOf('export interface PontoMensalCockpit'),
  )
  assert.ok(bloco.includes('return linhas.map('), 'a serie deixou de sair das linhas reais')
  for (const proibido of ['?? 0', 'fill(', 'preencher']) {
    assert.ok(!bloco.includes(proibido), `a serie diaria sintetiza dia ausente (${proibido})`)
  }
})

/* ========================================================================= *
 * O CONJUNTO FECHADO DE JANELAS
 * ========================================================================= */

test('as tres janelas, e nada mais', () => {
  assert.deepEqual([...RANGES_DIAS], [7, 30, 90])
  assert.equal(RANGE_PADRAO, 30)
})

test('rangeDias aceita 7d, 30d, 90d — e tambem o numero cru', () => {
  assert.equal(rangeDias('7d'), 7)
  assert.equal(rangeDias('30d'), 30)
  assert.equal(rangeDias('90d'), 90)
  assert.equal(rangeDias('90'), 90)
  assert.equal(rangeDias('30D'), 30)
})

test('rangeDias RECUSA qualquer janela fora do conjunto', () => {
  // Sem o conjunto fechado, `range=100000d` varreria a tabela inteira a pedido
  // de quem montasse a URL.
  for (const ruim of ['', '1d', '45d', '365d', '100000d', 'abc', '-7d', '7.5d', null, undefined]) {
    assert.equal(rangeDias(ruim), null, `aceitou ${String(ruim)}`)
  }
})

test('a API recusa janela invalida em vez de cair no padrao em silencio', () => {
  // Cair no padrao faria o grafico mostrar 30 dias enquanto o controle diz 90,
  // e ninguem teria como perceber. Ja `range` AUSENTE e legitimo: e a primeira
  // carga.
  const api = ler('app/api/dashboard/series/route.ts')
  assert.ok(api.includes('status: 400'), 'a API nao recusa janela invalida')
  assert.ok(
    api.includes('pedido !== null && dias === null'),
    'a API deixou de distinguir ausente de invalido',
  )
  assert.ok(api.includes('dias ?? RANGE_PADRAO'), 'a ausencia deixou de cair no padrao')
})

test('a API exige sessao', () => {
  const api = ler('app/api/dashboard/series/route.ts')
  assert.ok(api.includes("await getSession()"), 'a rota nao confere sessao')
  assert.ok(api.includes('status: 401'), 'a rota nao recusa anonimo')
})

test('a API NOVA nao quebra a existente', () => {
  // `/api/dashboard` continua respondendo o que respondia; a nova rota e um
  // arquivo separado, sob o mesmo prefixo.
  const antiga = ler('app/api/dashboard/route.ts')
  assert.ok(antiga.includes('export async function GET'), 'a API antiga perdeu o GET')
  assert.ok(antiga.includes('kpisDoPeriodo'), 'a API antiga mudou de fonte')

  // E o prefixo registrado em lib/modules ja cobre a rota nova por prefixo —
  // sem isso ela ficaria fora do controle de acesso.
  const mod = ler('lib/modules.ts')
  assert.ok(
    mod.includes("api: ['/api/dashboard']"),
    'o prefixo do Cockpit mudou — a rota de series ficaria sem autorizacao',
  )
})

/* ========================================================================= *
 * O CONTROLE NA TELA
 * ========================================================================= */

const CHARTS = ler('components/dashboard/DashboardCharts.tsx')

test('TODO grafico tem o controle de periodo', () => {
  // Um unico seletor renderizado dentro do `ChartCard`, que TODO grafico usa —
  // inclusive o diario, que mora fora do grid reordenavel.
  assert.ok(CHARTS.includes('function SeletorRange('), 'o seletor de periodo nao existe')
  assert.ok(CHARTS.includes('<SeletorRange'), 'o seletor nao e renderizado')
  // O card exige a janela e o callback: nenhum grafico pode ser montado sem
  // controle, porque o tipo nao permite.
  assert.ok(/range: RangeDias\n\s+onRange: \(r: RangeDias\) => void/.test(CHARTS),
    'o ChartCard deixou de exigir a janela')
})

test('os tres rotulos sao os pedidos: 7, 30 e 90 dias', () => {
  for (const label of ["label: '7 dias'", "label: '30 dias'", "label: '90 dias'"]) {
    assert.ok(CHARTS.includes(label), `${label} saiu do controle`)
  }
})

test('NAO foram criados tres graficos — e o mesmo com periodo variavel', () => {
  // Cada metrica aparece UMA vez na lista de definicoes. Tres variantes por
  // janela seriam 36 graficos e tres legendas por metrica.
  const defs = CHARTS.slice(
    CHARTS.indexOf('const CHART_DEFS: ChartDef[] = ['),
    CHARTS.indexOf('const DEFAULT_ORDER'),
  )
  for (const id of ['tpv', 'receita', 'transacoes', 'saldo', 'med', 'clientes', 'takerate']) {
    assert.equal(
      (defs.match(new RegExp(`id: '${id}'`, 'g')) ?? []).length, 1,
      `o grafico ${id} foi duplicado por janela`,
    )
  }
  // E nenhum id carrega a janela no nome.
  for (const sufixo of ['7d', '30d', '90d', '_7', '_30', '_90']) {
    assert.ok(!defs.includes(`id: '${sufixo}`), `id com janela embutida: ${sufixo}`)
  }
})

test('a troca de janela BUSCA NO BACKEND', () => {
  // Nao e filtro visual: o periodo escolhido gera chamada a API.
  assert.ok(
    CHARTS.includes('fetch(`/api/dashboard/series?range=${range}d`)'),
    'a troca de janela deixou de buscar no backend',
  )
})

test('as janelas sao CACHEADAS — nao se busca a mesma duas vezes', () => {
  // Doze graficos e tres janelas: sem cache, trocar seis graficos para 90 dias
  // faria seis requisicoes identicas.
  assert.ok(CHARTS.includes('function useSeries('), 'o cache de janelas saiu')
  assert.ok(CHARTS.includes('pedidas.current.has(range)'), 'a deduplicacao de pedidos saiu')
  assert.ok(CHARTS.includes('setCache('), 'o resultado deixou de ser guardado')
})

test('a falha de rede NAO esvazia o grafico', () => {
  // Esvaziar faria parecer que nao ha dado. O grafico continua mostrando a
  // janela anterior, com o aviso ao lado.
  assert.ok(CHARTS.includes('Os gráficos seguem mostrando o último período carregado.'),
    'a tela nao avisa o que aconteceu na falha')
  // E permite tentar de novo: sem isto, uma falha transitoria trancaria a
  // janela para o resto da sessao.
  assert.ok(CHARTS.includes('pedidas.current.delete(range)'), 'a falha trancou a janela')
})

test('a PRIMEIRA pintura ja tem dado — vem do servidor', () => {
  // Sem isto os doze graficos abririam vazios e preencheriam depois, o que no
  // Cockpit le como "o sistema nao tem dado".
  const pagina = ler('app/dashboard/page.tsx')
  assert.ok(pagina.includes('seriesCockpit()'), 'a pagina nao apura a janela padrao')
  assert.ok(pagina.includes('<DashboardCharts series={series} />'), 'a serie nao e passada')
})

test('servidor e cliente usam a MESMA funcao para montar o payload', () => {
  // Duas montagens do mesmo payload e como a tela passa a mostrar um numero
  // diferente depois do clique.
  const pagina = ler('app/dashboard/page.tsx')
  const api = ler('app/api/dashboard/series/route.ts')
  assert.ok(pagina.includes('seriesCockpit('), 'a pagina nao usa seriesCockpit')
  assert.ok(api.includes('seriesCockpit('), 'a API nao usa seriesCockpit')
})

test('a tela DECLARA a janela de fato usada, e o piso', () => {
  // Um usuario que escolhe 90 dias e ve 7 pontos precisa saber por que.
  assert.ok(CHARTS.includes('function rodapeDe('), 'a declaracao da janela saiu')
  assert.ok(
    CHARTS.includes('e não há dado anterior'),
    'a tela nao diz que o piso encurtou a janela',
  )
  assert.ok(
    CHARTS.includes('janela.limitada'),
    'a tela nao consulta se a janela foi encurtada',
  )
})

/* ========================================================================= *
 * AS DUAS RESOLUÇÕES
 * ========================================================================= */

test('os TRES graficos sem grao diario estao marcados como mensais', () => {
  // BaaS ativos, White Labels e MRR nao tem resolucao diaria e nao ha como
  // inventa-la: "parceiros ativos" e contagem de cadastro e o MRR e apurado
  // sobre a carteira do mes. Desenha-los dia a dia daria 90 pontos identicos.
  const defs = CHARTS.slice(
    CHARTS.indexOf('const CHART_DEFS: ChartDef[] = ['),
    CHARTS.indexOf('const DEFAULT_ORDER'),
  )
  for (const id of ['baas', 'whitelabel', 'mrr']) {
    const linha = defs.split('\n').find((l) => l.includes(`id: '${id}'`))
    assert.ok(linha, `o grafico ${id} saiu da lista`)
    assert.ok(
      linha.includes("resolucao: 'mensal'"),
      `${id} deveria ser mensal — diario desenharia uma reta`,
    )
  }
})

test('os OITO graficos de grao diario estao marcados como diarios', () => {
  const defs = CHARTS.slice(
    CHARTS.indexOf('const CHART_DEFS: ChartDef[] = ['),
    CHARTS.indexOf('const DEFAULT_ORDER'),
  )
  for (const id of ['tpv', 'receita', 'transacoes', 'saldo', 'med', 'clientes', 'takerate']) {
    const linha = defs.split('\n').find((l) => l.includes(`id: '${id}'`))
    assert.ok(linha?.includes("resolucao: 'diaria'"), `${id} deveria ser diario`)
  }
  // E o operacional diario tambem.
  assert.ok(CHARTS.includes("id: 'diario'"), 'o grafico operacional diario saiu')
})

test('"Atividade Operacional" SAIU — nao ha dois graficos para a mesma pergunta', () => {
  /**
   * Havia DOIS graficos lendo a mesma `serieDiaria`: "Atividade Operacional"
   * (transacoes, MEDs e clientes ativos) e "Evolucao Atividade Operacional
   * Diaria" (TPV, receita, transacoes e MED). O segundo e estritamente mais
   * informativo.
   *
   * Dois graficos do mesmo dado no mesmo painel nao dao duas leituras: dao a
   * duvida de qual dos dois e o certo.
   */
  const sem = semComentarios(CHARTS)
  assert.ok(!sem.includes("id: 'atividade'"), 'a definicao do grafico voltou')
  assert.ok(!sem.includes('atividade: (id)'), 'o renderizador do grafico voltou')
  assert.ok(!sem.includes("case 'atividade'"), 'o delta do grafico voltou')

  // O QUE FICOU: o diario de largura inteira, com o titulo que o pedido manda
  // preservar.
  assert.ok(CHARTS.includes("title: 'Evolução Atividade Operacional Diária'"))

  // E NENHUMA METRICA SE PERDEU: clientes ativos tem o seu proprio grafico.
  assert.ok(CHARTS.includes("id: 'clientes'"))
})

test('serie mensal de UM ponto nao desenha um pixel solto', () => {
  // Interpolar dias dentro do mes inventaria dado; desenhar um ponto solto nao
  // e uma leitura. O quadro diz o que esta acontecendo e aponta a janela que
  // resolve.
  assert.ok(CHARTS.includes('function SerieMensalCurta('), 'o estado de serie curta saiu')
  assert.ok(CHARTS.includes('d.length <= 1'), 'a serie curta deixou de ser detectada')
})

test('o PISO de 01/10 NAO se aplica a serie mensal', () => {
  // O piso e uma afirmacao sobre o LANCAMENTO DIARIO. A historia das condicoes
  // comerciais e anterior e continua valida; aplica-lo colapsaria os tres
  // graficos mensais a um unico mes sem nenhuma razao de dado.
  const K = ler('lib/kpi.ts')
  const bloco = K.slice(
    K.indexOf('export async function serieMensalCockpit'),
    K.indexOf('export interface SeriesCockpit'),
  )
  assert.ok(
    !bloco.includes('DATA_MINIMA_ATIVIDADE'),
    'o piso diario vazou para a serie mensal',
  )
  // Ela usa a janela so para descobrir QUAIS MESES o intervalo atravessa.
  assert.ok(bloco.includes('janelaDiaria(dias, hoje)'), 'a serie mensal ignora a janela')
  assert.ok(bloco.includes('evolucaoParceiros(meses)'), 'a serie mensal perdeu a fonte')
})

test('o MRR e apurado POR MES, nao repetido', () => {
  // A versao anterior repetia o numero de hoje em todos os meses, produzindo
  // uma linha reta que o grafico tinha de detectar e recusar.
  const K = ler('lib/kpi.ts')
  const bloco = K.slice(
    K.indexOf('export async function serieMensalCockpit'),
    K.indexOf('export interface SeriesCockpit'),
  )
  assert.ok(
    bloco.includes('Promise.all(meses.map((m) => calcularMrr(m)))'),
    'o MRR voltou a ser repetido em vez de apurado por mes',
  )
  const pagina = ler('app/dashboard/page.tsx')
  assert.ok(
    !pagina.includes('mrr: estrutura.mrr.total'),
    'a pagina voltou a repetir o MRR corrente em todos os meses',
  )
})

/* ========================================================================= *
 * O QUE NÃO MUDOU
 * ========================================================================= */

test('o grafico operacional MANTEVE as quatro metricas e a forma', () => {
  // Transacoes e MED como LINHAS, TPV e Receita como COLUNAS — o conceito
  // visual nao muda com a janela. (A forma em si e verificada em
  // tests/layout.test.ts; aqui so se garante que as metricas continuam.)
  const bloco = CHARTS.slice(
    CHARTS.indexOf('function graficoDiarioOperacional()'),
    CHARTS.indexOf('const charts: Record<string, (id: string) => React.ReactNode>'),
  )
  for (const m of ['dataKey="tpv"', 'dataKey="receita"', 'dataKey="transacoes"', 'dataKey="medPercentual"']) {
    assert.ok(bloco.includes(m), `${m} saiu do grafico operacional`)
  }
  assert.ok(bloco.includes('<Bar '), 'as colunas sairam')
  assert.ok(bloco.includes('<Line '), 'as linhas sairam')
})

test('a reordenacao dos graficos continua existindo', () => {
  assert.ok(CHARTS.includes('setReordering'), 'a reordenacao saiu')
  // E a chave do localStorage foi VERSIONADA: uma ordem salva com a lista
  // antiga deixaria buracos no grid.
  // A LISTA de graficos mudou nesta rodada — "Atividade Operacional" saiu —,
  // e uma ordem salva com o id antigo deixaria um buraco no grid, porque
  // `charts['atividade']` nao existe mais.
  assert.ok(CHARTS.includes("LS_KEY = 'dashboard_chart_order_v7'"), 'a chave nao foi versionada')
})

test('o seletor NAO aparece em modo de reordenar', () => {
  // O card inteiro vira alvo de arraste, e um botao dentro de um elemento
  // arrastavel engole o clique na metade das tentativas.
  assert.ok(CHARTS.includes('{!reordering && ('), 'o seletor disputa com o arraste')
})

/* ========================================================================= *
 * OS TRÊS GRÁFICOS MENSAIS — o piso é a DISPONIBILIDADE, não a janela
 *
 * ── O DEFEITO QUE ISTO CORRIGE ───────────────────────────────────────────
 *
 * "Evolução de BaaS Ativos", "Evolução de White Labels Ativos" e "Evolução do
 * MRR" desenhavam ZERO em todo mês anterior ao cadastro das condições
 * comerciais. Em Production as 20 condições foram criadas em 01–02/10/2026 —
 * então os gráficos mostravam uma rampa de 0 para 9 entre setembro e outubro,
 * como se nove parceiros tivessem entrado num mês.
 *
 * Nenhum entrou. A Bass Pago já tinha parceiros; o CADASTRO deles é que é
 * novo. Zero não era o número: era a ausência de registro desenhada como
 * número — exatamente o que a série diária já recusa (dia sem lançamento fica
 * fora, não vira zero).
 * ========================================================================= */

test('a serie mensal comeca na DISPONIBILIDADE REAL, nunca em zero', () => {
  const K = ler('lib/kpi.ts')
  const bloco = K.slice(
    K.indexOf('export async function serieMensalCockpit'),
    K.indexOf('export interface SeriesCockpit'),
  )

  // O piso vem do CADASTRO, não da janela.
  assert.ok(
    bloco.includes('await primeiroMesComParceiros()'),
    'a serie mensal voltou a comecar no inicio da janela',
  )
  // Mês anterior à disponibilidade NÃO entra — nem como zero.
  assert.ok(bloco.includes('if (mes >= disponivelDe) meses.push(mes)'))
  // Sem nenhuma condição cadastrada, a série é VAZIA — não é uma linha de zeros.
  assert.ok(bloco.includes('if (!disponivelDe) return []'))
})

test('a disponibilidade sai de `createdAt`, nao de `sustentacaoInicio`', () => {
  /**
   * `createdAt` é quando o REGISTRO passou a existir, que é exatamente a
   * pergunta: desde quando o sistema tem como responder. `sustentacaoInicio` é
   * a vigência do contrato, e `evolucaoParceiros` já a respeita ao montar cada
   * ponto — usá-la aqui faria a série começar antes de existir cadastro.
   */
  const F = ler('lib/financeiro.ts')
  const bloco = F.slice(
    F.indexOf('export async function primeiroMesComParceiros'),
    F.indexOf('export async function primeiroMesComParceiros') + 700,
  )
  assert.ok(bloco.includes("orderBy: { createdAt: 'asc' }"))
  assert.ok(bloco.includes('select: { createdAt: true }'))
  assert.ok(!bloco.includes('sustentacaoInicio'))
  // `null` quando nao ha condicao nenhuma — nunca uma data inventada.
  assert.ok(bloco.includes('if (!primeira) return null'))
})

test('o payload DECLARA de que mes a serie mensal existe', () => {
  /**
   * Sem a declaração, um usuário que escolhe 90 dias e vê um ponto só nos três
   * gráficos concluiria que estão quebrados — quando o que há é um mês de
   * histórico.
   */
  const K = ler('lib/kpi.ts')
  assert.ok(K.includes('mensalDisponivelDe: string | null'))
  assert.ok(K.includes('primeiroMesComParceiros(),'))
  assert.ok(K.includes('mensalDisponivelDe,'))
})

test('a tela distingue JANELA curta de HISTORICO curto', () => {
  /**
   * A conduta de quem lê muda: janela curta se resolve ampliando para 90 dias;
   * histórico curto não. Mandar "escolha 90 dias" quando o cadastro começou
   * neste mês é mandar o usuário a um lugar onde não há nada.
   */
  assert.ok(CHARTS.includes('function SerieMensalCurta({ nome, disponivelDe }'))
  assert.ok(CHARTS.includes("'Histórico ainda de um mês'"))
  assert.ok(CHARTS.includes('não há mês anterior para'))
  assert.ok(CHARTS.includes('o que falta é '))
  // E os TRES mensais passam a disponibilidade.
  const quantos = (CHARTS.match(/disponivelDe=\{serieDe\(id\)\.mensalDisponivelDe/g) ?? []).length
  assert.equal(quantos, 3, 'algum dos tres graficos mensais parou de declarar')
})

test('o rodape dos mensais cita o primeiro mes com cadastro', () => {
  const bloco = CHARTS.slice(CHARTS.indexOf('function rodapeDe(id: string)'))
  assert.ok(bloco.includes('s.mensalDisponivelDe'))
  assert.ok(bloco.includes('o primeiro mês com condição cadastrada'))
})

test('as mensagens de serie vazia nao culpam mais a janela', () => {
  // "Nenhum BaaS ativo NA JANELA" sugeria que ampliar resolveria. O que
  // existe, ou nao, e cadastro.
  assert.ok(!CHARTS.includes('Nenhum BaaS ativo na janela'))
  assert.ok(!CHARTS.includes('Nenhum White Label ativo na janela'))
  assert.ok(CHARTS.includes('nos meses com cadastro'))
})

/* ========================================================================= *
 * A VARIAÇÃO DOS GRÁFICOS — dia contra dia anterior
 * ========================================================================= */

test('o delta diario compara os DOIS ULTIMOS dias, sem descartar zeros', () => {
  /**
   * A versão anterior filtrava os zeros ANTES de pegar os dois últimos
   * valores: se o dia 05 tivesse saldo zero, "a variação do dia 06" comparava
   * 06 com 04 — e o rodapé continuava dizendo "no dia". Dois dias de
   * distância apresentados como um.
   *
   * Zero é um valor: um dia com zero MED é um dia sem MED, não um dia sem
   * lançamento — e dia sem lançamento já fica fora da série.
   */
  const bloco = CHARTS.slice(
    CHARTS.indexOf('function deltaDiario(id: string'),
    CHARTS.indexOf('function deltaMensal(id: string'),
  )
  const sem = semComentarios(bloco)
  assert.ok(!sem.includes("v !== 0"), 'o filtro de zero voltou ao delta diario')
  assert.ok(sem.includes('serie[serie.length - 1]'))
  assert.ok(sem.includes('serie[serie.length - 2]'))
})

test('o delta diario EXIGE que os dois dias sejam vizinhos', () => {
  // A serie pode ter buracos (dia sem lancamento). Se o ultimo par nao for de
  // dias de calendario vizinhos, a comparacao nao e "dia vs dia anterior" e a
  // seta nao e desenhada.
  assert.ok(CHARTS.includes('function diasVizinhos(anterior: string, posterior: string)'))
  assert.ok(CHARTS.includes('if (!diasVizinhos(penultimo.dia, ultimo.dia)) return null'))
  assert.ok(CHARTS.includes('return b - a === 86_400_000'))
})

test('o delta mensal tambem parou de descartar zeros', () => {
  // Uma contagem de parceiros que caiu a zero e informacao, e descarta-la
  // fazia o grafico comparar outubro com agosto chamando de "no mes".
  const bloco = CHARTS.slice(
    CHARTS.indexOf('function deltaMensal(id: string'),
    CHARTS.indexOf('function mensal(id: string)'),
  )
  assert.ok(!semComentarios(bloco).includes("v !== 0"))
})
