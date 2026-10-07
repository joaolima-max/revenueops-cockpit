/**
 * LAYOUT — truncagem de texto cadastrado.
 *
 * Três lugares quebravam com texto longo: a descrição e a categoria em
 * Lançamentos, e o badge de segmento no card do Pipeline. Em todos, o texto é
 * CADASTRADO — ninguém controla o tamanho — e sem teto ele empurrava as
 * colunas de valor e ações para fora da tela, ou esticava o card.
 *
 * O que se testa aqui são as PROPRIEDADES que a correção precisa ter, lendo o
 * próprio código: as classes de truncagem e o `title` que recupera o texto
 * inteiro. Um teste de pixel exigiria navegador; este pega a regressão que de
 * fato acontece — alguém remover o teto ou o tooltip numa edição futura.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ler = (p: string) => readFileSync(p, 'utf8')
/** Raiz do repositório — os testes rodam a partir dela. */
const RAIZ = process.cwd()

/**
 * O arquivo SEM as linhas de comentário.
 *
 * Existe porque os comentários deste projeto registram o que foi REMOVIDO e
 * por quê — e um teste que varre o arquivo inteiro por substring acusa a
 * própria explicação como se fosse o código voltando.
 */
const semComentarios = (txt: string) =>
  txt
    // Blocos saem INTEIROS. Filtrar linha por linha deixava passar as linhas
    // do meio de um `{/* … */}` de tres linhas — e e justamente la que os
    // comentarios citam o rotulo ou a classe que foi removida.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const LANCAMENTOS = ler('app/dashboard/financeiro/lancamentos/LancamentosClient.tsx')
const PIPELINE = ler('app/dashboard/pipeline/PipelineClient.tsx')
const CARTEIRA = ler('app/dashboard/carteira/CarteiraClient.tsx')
const BADGE = ler('components/ui/Badge.tsx')

/* ========================================================================= *
 * O BADGE SABE TRUNCAR
 * ========================================================================= */

test('o Badge aceita `truncar` e `title`', () => {
  assert.ok(BADGE.includes('truncar'), 'o Badge perdeu a capacidade de truncar')
  assert.ok(BADGE.includes('title'), 'o Badge perdeu o tooltip')
})

test('o Badge corta com reticencias, e nao quebra linha', () => {
  // `whitespace-nowrap` sozinho nao corta: sem teto de largura o badge
  // simplesmente cresce. Os tres juntos e que produzem as reticencias.
  assert.ok(BADGE.includes('whitespace-nowrap'))
  assert.ok(BADGE.includes('overflow-hidden'))
  assert.ok(BADGE.includes('text-ellipsis'))
  assert.ok(BADGE.includes('max-w-'), 'sem teto de largura, nada e cortado')
})

test('o Badge usa min-w-0 — sem isso o flex item nao encolhe', () => {
  assert.ok(BADGE.includes('min-w-0'))
})

/* ========================================================================= *
 * LANÇAMENTOS — descrição e categoria
 * ========================================================================= */

test('a coluna de DESCRICAO tem teto de largura', () => {
  assert.ok(
    /<Th className="pl-5 w-\[clamp\(/.test(LANCAMENTOS),
    'a descricao voltou a crescer sem limite',
  )
})

test('a DESCRICAO trunca e leva o texto inteiro no title', () => {
  assert.ok(LANCAMENTOS.includes('bp-truncate" title={l.descricao}'))
})

test('a segunda linha da descricao tambem trunca, com tooltip', () => {
  // Fornecedor e parceiro vivem nela: cortar sem tooltip esconderia o que
  // distingue dois lancamentos de mesma descricao.
  assert.ok(LANCAMENTOS.includes('title={contexto(l)}'))
  assert.ok(LANCAMENTOS.includes('function contexto('))
})

test('a CATEGORIA usa badge truncado com tooltip', () => {
  assert.ok(LANCAMENTOS.includes('<Badge truncar title={l.categoria.nome}>'))
})

test('as celulas usam max-w-0 — e o que faz respeitar a largura da coluna', () => {
  // Dentro de uma tabela, `truncate` sem isto nao corta: a celula cresce com
  // o conteudo e ignora o teto do cabecalho.
  assert.ok(LANCAMENTOS.includes('className="pl-5 max-w-0"'))
  assert.ok(LANCAMENTOS.includes('<Td className="max-w-0">'))
})

/* ========================================================================= *
 * PIPELINE — o badge de segmento
 * ========================================================================= */

test('o segmento do card trunca, com teto proprio', () => {
  assert.ok(
    PIPELINE.includes('truncar="max-w-[7.5rem]"'),
    'o segmento voltou a esticar o card',
  )
})

test('o segmento truncado mostra o nome completo no hover', () => {
  assert.ok(PIPELINE.includes('title={rotuloSegmento(card.lead?.segmento) ?? undefined}'))
})

test('o RESULTADO do card NAO trunca — sao tres palavras conhecidas', () => {
  // Truncar "Em andamento" nao resolveria nada e tiraria a informacao que o
  // card existe para dar.
  assert.ok(PIPELINE.includes('className="flex-none"'))
})

test('o segmento continua APARECENDO — truncar nao e remover', () => {
  assert.ok(PIPELINE.includes('rotuloSegmento(card.lead?.segmento)'))
})

test('a linha do card nao quebra: flex com min-w-0, sem wrap', () => {
  // `flex-wrap` deixava o badge longo pular para a linha de baixo e aumentar
  // a altura do card.
  assert.ok(PIPELINE.includes('mt-2 flex items-center gap-1.5 min-w-0'))
  assert.ok(!PIPELINE.includes('mt-2 flex flex-wrap items-center gap-1.5'))
})

/* ========================================================================= *
 * CARTEIRA — mesmo teto
 * ========================================================================= */

test('o segmento da Carteira trunca com o mesmo tratamento', () => {
  assert.ok(CARTEIRA.includes('<Badge truncar title={c.segmentoComercial.nome}>'))
  // `max-w-0` e o que faz a truncagem funcionar dentro de tabela; o `pr-6` e
  // o respiro que substituiu o fio vertical.
  assert.ok(CARTEIRA.includes('className="max-w-0 pr-6"'))
})

/* ========================================================================= *
 * RESPONSIVIDADE PRESERVADA
 * ========================================================================= */

test('a tabela continua rolando no mobile, em vez de estourar a pagina', () => {
  const tabela = ler('components/ui/DataTable.tsx')
  assert.ok(tabela.includes('overflow-x-auto'), 'o scroll horizontal da tabela saiu')
  assert.ok(tabela.includes('min-w-['), 'sem largura minima a tabela comprime demais')
})

test('os filtros de Lancamentos continuam responsivos', () => {
  assert.ok(LANCAMENTOS.includes('sm:grid-cols-2 lg:grid-cols-6'))
})

test('as acoes e o status continuam na tabela', () => {
  // A correcao era visual: nenhuma coluna podia desaparecer.
  for (const col of ['Descrição', 'Categoria', 'Lançamento', 'Vencimento', 'Período', 'Status', 'Valor', 'Ações']) {
    assert.ok(LANCAMENTOS.includes(`>${col}<`), `a coluna ${col} desapareceu`)
  }
})

/* ========================================================================= *
 * CARTEIRA — Modelo e Segmento separados
 * ========================================================================= */

test('MODELO vem antes de SEGMENTO, e os dois tem largura propria', () => {
  const iModelo = CARTEIRA.indexOf('>Modelo operacional<')
  const iSegmento = CARTEIRA.indexOf('>Segmento<')
  assert.ok(iModelo > 0 && iSegmento > 0, 'uma das colunas desapareceu')
  assert.ok(iModelo < iSegmento, 'Modelo deveria vir antes de Segmento')

  // Largura folgada nas duas: o modelo cabe o rotulo por extenso sem quebrar,
  // e o segmento tem espaco para texto cadastrado antes de truncar.
  assert.ok(CARTEIRA.includes('className="w-[11rem] whitespace-nowrap">Modelo operacional'))
  assert.ok(CARTEIRA.includes('className="w-[12rem]">Segmento'))
})

test('ha RESPIRO entre o badge do modelo e o do segmento', () => {
  assert.ok(CARTEIRA.includes('<Td className="pr-6">'), 'o espacamento entre as duas colunas saiu')
})

test('NAO ha fio vertical dentro da tabela da Carteira', () => {
  /**
   * O divisor entre Modelo e Segmento SAIU.
   *
   * Ele resolvia a ambiguidade de dois badges cinzas lado a lado, mas era o
   * unico fio vertical da tabela — lia como se aquelas duas colunas fossem um
   * grupo separado do resto. A separacao agora vem de largura e espacamento,
   * que e o que deveria ter bastado desde o inicio.
   */
  const corpo = semComentarios(CARTEIRA)
  assert.ok(!corpo.includes('border-l border-line'), 'o fio vertical voltou a tabela')
})

test('a Carteira preserva as colunas que a tela existe para dar', () => {
  for (const col of [
    'Cliente', 'Conta', 'Modelo operacional', 'Segmento', 'Status', 'Gestor', 'Ações',
  ]) {
    assert.ok(CARTEIRA.includes(`>${col}<`), `a coluna ${col} desapareceu`)
  }
})

/* ========================================================================= *
 * FOLLOW UP — a data em AZUL
 * ========================================================================= */

test('a data prevista NO PRAZO usa o azul institucional, nao verde', () => {
  // Verde no design system significa atingimento. Um follow-up agendado para
  // o mes que vem nao e uma conquista — e so uma data.
  const F = ler('app/dashboard/followup/FollowUpClient.tsx')
  assert.ok(
    F.includes("return 'text-accent-soft'"),
    'a data voltou a ser verde',
  )
  assert.ok(!/if \(diffDays < 0\) return 'text-neg'[\s\S]{0,120}return 'text-pos'/.test(F))
})

test('ATRASO e VENCIMENTO PROXIMO continuam vermelho e ambar', () => {
  // Esses dois tem significado funcional: alguem precisa agir.
  const F = ler('app/dashboard/followup/FollowUpClient.tsx')
  assert.ok(F.includes("if (diffDays < 0) return 'text-neg'"))
  assert.ok(F.includes("if (diffDays <= 1) return 'text-warn'"))
})

test('o DIA DE HOJE no calendario e azul, borda inclusa', () => {
  const F = ler('app/dashboard/followup/FollowUpClient.tsx')
  assert.ok(F.includes("isToday ? 'text-accent-soft'"))
  assert.ok(F.includes("isToday ? 'border-accent/40'"))
  assert.ok(!F.includes("isToday ? 'text-pos'"))
  assert.ok(!F.includes("isToday ? 'border-pos/40'"))
})

test('o azul e um TOKEN, e por isso funciona em Light e em Dark', () => {
  // `accent-soft` tem valor proprio por tema (#6b8cff no escuro, #1b4fd8 no
  // claro). Uma cor fixa em hex funcionaria num tema e falharia no outro.
  const css = ler('app/globals.css')
  assert.ok(css.includes('--color-accent-soft: #6b8cff'), 'o token do tema escuro saiu')
  assert.ok(css.includes('--color-accent-soft: #1b4fd8'), 'o token do tema claro saiu')
})

/* ========================================================================= *
 * COCKPIT — NENHUMA VELA, NENHUMA META
 * ========================================================================= */

/** Todo arquivo de código do produto. A varredura precisa ser exaustiva. */
function todosOsFontes(): string[] {
  const dirs = ['app', 'components', 'lib']
  const out: string[] = []
  const anda = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const caminho = `${d}/${e.name}`
      if (e.isDirectory()) anda(caminho)
      else if (/\.tsx?$/.test(e.name)) out.push(caminho)
    }
  }
  for (const d of dirs) anda(resolve(RAIZ, d))
  return out
}

test('os arquivos de vela foram REMOVIDOS do projeto', () => {
  for (const f of [
    'components/ui/Candles.tsx',
    'lib/candle.ts',
    'tests/candle.test.ts',
  ]) {
    assert.ok(!existsSync(resolve(RAIZ, f)), `${f} ainda existe`)
  }
})

test('nenhum arquivo do produto menciona candlestick, vela ou OHLC', () => {
  // Varredura do codigo INTEIRO, nao de uma lista de telas: o pedido e que
  // nao sobre nenhuma versao duplicada ou escondida.
  const culpados: string[] = []
  for (const f of todosOsFontes()) {
    const txt = readFileSync(f, 'utf8')
    // So o CODIGO: os comentarios registram POR QUE as velas sairam, e essa
    // memoria tem valor. Linhas de comentario saem da conta.
    const codigo = txt
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n')
    for (const termo of ['Candles', 'Candlestick', 'velaDegenerada', 'variacaoDaVela', 'OHLC']) {
      if (codigo.includes(termo)) culpados.push(`${f}: ${termo}`)
    }
  }
  assert.deepEqual(culpados, [], `vela sobreviveu em: ${culpados.join(', ')}`)
})

test('o Cockpit nao importa nada de velas', () => {
  for (const f of ['app/dashboard/page.tsx', 'components/dashboard/DashboardCharts.tsx']) {
    const c = ler(f)
    assert.ok(!c.includes("from '@/lib/candle'"), `${f} ainda importa lib/candle`)
    assert.ok(!c.includes("from '@/components/ui/Candles'"), `${f} ainda importa Candles`)
    assert.ok(!c.includes('<Candles'), `${f} ainda renderiza <Candles>`)
  }
})

test('o Cockpit nao tem mais NENHUMA secao de metas', () => {
  // So o CODIGO. O comentario do arquivo explica POR QUE as metas sairam, e
  // cita `metasDoPeriodo` ao fazer isso — um teste por substring do arquivo
  // inteiro falharia justamente por causa da explicacao.
  const c = semComentarios(ler('app/dashboard/page.tsx'))
  assert.ok(!c.includes('MetaAnalytics'), 'MetaAnalytics voltou ao Cockpit')
  assert.ok(!c.includes('metasDoPeriodo'), 'o Cockpit voltou a consultar metas')
  assert.ok(!c.includes('avaliarCompleto'), 'o Cockpit voltou a avaliar metas')
  assert.ok(!c.includes('<MetaBar'), 'uma barra de meta voltou ao Cockpit')
})

test('a grade e discreta: so horizontal, sem tracejado', () => {
  const tema = ler('lib/chart-theme.ts')
  assert.ok(tema.includes('vertical: false'))
  assert.ok(tema.includes("strokeDasharray: '0'"))
})

/* ========================================================================= *
 * COCKPIT — "Evolução Atividade Operacional Diária"
 * ========================================================================= */

/**
 * Só o corpo do gráfico diário.
 *
 * O gráfico virou FUNÇÃO (`graficoDiarioOperacional`) quando cada gráfico
 * ganhou janela própria de 7/30/90 dias: a série passou a depender da janela
 * escolhida em tempo de execução, e um nó montado uma vez fixaria a janela da
 * primeira renderização. O mapa de gráficos mudou junto, de `React.ReactNode`
 * para `(id: string) => React.ReactNode`.
 */
function corpoDoDiario(): string {
  const C = ler('components/dashboard/DashboardCharts.tsx')
  const ini = C.indexOf('function graficoDiarioOperacional()')
  const fim = C.indexOf('const charts: Record<string, (id: string) => React.ReactNode>')
  assert.ok(ini > 0 && fim > ini, 'o grafico diario mudou de forma')
  return C.slice(ini, fim)
}

test('o grafico diario existe, com o nome EXATO pedido', () => {
  const C = ler('components/dashboard/DashboardCharts.tsx')
  assert.ok(
    C.includes("title: 'Evolução Atividade Operacional Diária'"),
    'o titulo do grafico diario nao e o pedido',
  )
})

test('TPV e Receita sao COLUNAS; Transacoes e MED sao LINHAS', () => {
  const d = corpoDoDiario()
  // Barras: exatamente duas, TPV e Receita.
  assert.ok(/<Bar [^>]*dataKey="tpv"/.test(d), 'TPV nao e coluna')
  assert.ok(/<Bar [^>]*dataKey="receita"/.test(d), 'Receita nao e coluna')
  assert.equal((d.match(/<Bar /g) ?? []).length, 2, 'o numero de colunas mudou')

  // Linhas: exatamente duas, Transacoes e MED.
  assert.ok(/<Line [^>]*dataKey="transacoes"/.test(d), 'Transacoes nao e linha')
  assert.ok(/<Line [^>]*dataKey="medPercentual"/.test(d), 'MED nao e linha')
  assert.equal((d.match(/<Line /g) ?? []).length, 2, 'o numero de linhas mudou')
})

test('TPV e Receita tem EIXOS MONETARIOS SEPARADOS — um nao esmaga o outro', () => {
  const d = corpoDoDiario()
  // Dois eixos monetarios distintos: no mesmo eixo, a receita (milhares)
  // viraria um fio ao lado do TPV (milhoes).
  assert.ok(d.includes('yAxisId="tpv"'), 'o eixo do TPV sumiu')
  assert.ok(d.includes('yAxisId="receita"'), 'o eixo da Receita sumiu')
  assert.ok(d.includes('orientation="right"'), 'os dois eixos monetarios ficaram do mesmo lado')
  // Transacoes e MED com amplitude propria.
  assert.ok(d.includes('yAxisId="tx"'), 'o eixo de transacoes sumiu')
  assert.ok(d.includes('yAxisId="med"'), 'o eixo de MED sumiu')
})

test('os dados NAO sao normalizados artificialmente', () => {
  const d = corpoDoDiario()
  for (const proibido of ['/ max', 'normaliz', '* 100 /', 'indice']) {
    assert.ok(!d.includes(proibido), `o grafico diario normaliza (${proibido})`)
  }
})

test('o tooltip diario mostra data, transacoes, receita, TPV e MED', () => {
  const d = corpoDoDiario()
  for (const nome of ["nome: 'TPV'", "nome: 'Receita'", "nome: 'Transações'", "nome: 'MED'"]) {
    assert.ok(d.includes(nome), `${nome} saiu do tooltip diario`)
  }
})

test('o tooltip diario usa VALOR MONETARIO COMPLETO — nunca K, M ou BI', () => {
  const d = corpoDoDiario()
  // Cada serie monetaria carrega `moedaCheia`, nao o formatador de eixo.
  assert.equal(
    (d.match(/formatar: moedaCheia/g) ?? []).length, 2,
    'TPV e Receita precisam dos dois formatadores de moeda cheia',
  )
  assert.ok(!d.includes('formatar: eixoMoeda'), 'o tooltip usou o formatador de eixo')
})

test('o grafico diario tem a altura de DOIS graficos normais', () => {
  const d = corpoDoDiario()
  const normal = ler('components/dashboard/DashboardCharts.tsx').includes('height={200}')
  assert.ok(normal, 'o grafico normal mudou de altura — reveja a proporcao')
  assert.ok(d.includes('height={420}'), 'o grafico diario nao tem altura dupla')
})

test('o grafico diario NAO e candlestick', () => {
  const d = corpoDoDiario()
  for (const proibido of ['Candle', 'faixa', 'high', 'low', 'OHLC']) {
    assert.ok(!d.includes(proibido), `${proibido} apareceu no grafico diario`)
  }
})

/* ========================================================================= *
 * LAYOUT DESTA RODADA — detalhe BaaS, tela BaaS, datas, Carteira
 * ========================================================================= */

const DETALHE = ler('components/financeiro/DetalheBaas.tsx')
const BAAS = ler('app/dashboard/lancamento-baas/LancamentoBaasClient.tsx')

test('o detalhe BaaS: PRODUTO nao engole mais a tabela', () => {
  /**
   * "Produto" era a unica coluna sem `whitespace-nowrap` e com `max-w-0`: o
   * navegador lhe dava TODO o espaco sobrante e empurrava Taxa, Volume e
   * Total para a borda direita, com um vao vazio no meio.
   *
   * As quatro larguras somam 100%, entao nenhuma pode crescer sobre as
   * outras.
   */
  for (const largura of ['w-[40%]', 'w-[18%]', 'w-[24%]']) {
    assert.ok(DETALHE.includes(largura), `a largura ${largura} saiu da tabela de produtos`)
  }
  // Duas colunas de 18% (Taxa e Volume).
  assert.equal(
    (DETALHE.match(/w-\[18%\]/g) ?? []).length, 2,
    'Taxa e Volume deixaram de ter a mesma largura',
  )
})

test('as quatro colunas do detalhe BaaS existem, nesta ordem', () => {
  const cabecalho = DETALHE.slice(DETALHE.indexOf('<HeadRow>'), DETALHE.indexOf('</HeadRow>'))
  const ordem = ['Produto', 'Taxa', 'Volume', 'Total']
  let pos = -1
  for (const col of ordem) {
    const i = cabecalho.indexOf(`>${col}<`)
    assert.ok(i > pos, `${col} fora de ordem no detalhe BaaS`)
    pos = i
  }
})

test('o nome do produto TRUNCA e mantem o texto no tooltip', () => {
  // A informacao continua completa: `title` com o nome inteiro.
  assert.ok(DETALHE.includes('max-w-0'), 'a celula do produto voltou a crescer')
  assert.ok(DETALHE.includes('bp-truncate'), 'o nome do produto deixou de truncar')
  assert.ok(DETALHE.includes('title={i.nome}'), 'o nome completo saiu do tooltip')
})

test('a tela de Lancamentos BaaS ROLA na horizontal em vez de espremer', () => {
  // Dez colunas, seis monetarias e por extenso. O TableShell ja tem
  // `overflow-x-auto`; o que faltava era a largura minima confortavel.
  assert.ok(BAAS.includes('min-w-[82rem]'), 'a tabela BaaS voltou a espremer as colunas')
  const shell = ler('components/ui/DataTable.tsx')
  assert.ok(shell.includes('overflow-x-auto'), 'o TableShell perdeu a rolagem horizontal')
})

test('DATA BASE e DATA DE CORTE sao DUAS colunas, lado a lado', () => {
  /**
   * Era uma coluna "Periodo" com "01/10/2026 a 31/10/2026" dentro, e na
   * largura disponivel a string quebrava em TRES linhas, esticando a altura
   * de toda a linha da tabela.
   */
  assert.ok(BAAS.includes('>Data base<'), 'a coluna Data base nao existe')
  assert.ok(BAAS.includes('>Data de corte<'), 'a coluna Data de corte nao existe')
  // Lado a lado e sem quebrar.
  assert.ok(
    BAAS.indexOf('>Data base<') < BAAS.indexOf('>Data de corte<'),
    'Data de corte vem antes de Data base',
  )
  // Duas celulas, cada uma com uma data, e nenhuma delas quebrando linha.
  assert.equal(
    (BAAS.match(/whitespace-nowrap">\s*\{formatDate\(l\.periodo/g) ?? []).length, 2,
    'as duas datas da linha mudaram de forma',
  )
  // A coluna unica "Periodo" saiu do cabecalho.
  const cabecalho = BAAS.slice(BAAS.indexOf('<HeadRow>'), BAAS.indexOf('</HeadRow>'))
  assert.ok(!cabecalho.includes('>Período<'), 'a coluna unica "Periodo" voltou')
})

test('os nomes oficiais aparecem tambem no FORMULARIO', () => {
  assert.ok(BAAS.includes('>Data base *<'), 'o formulario nao usa "Data base"')
  assert.ok(BAAS.includes('>Data de corte *<'), 'o formulario nao usa "Data de corte"')
  // So o CODIGO: o comentario do arquivo cita o rotulo antigo ao explicar a
  // troca, e procura-lo no arquivo inteiro acusaria a propria explicacao.
  assert.ok(
    !semComentarios(BAAS).includes('Período — início'),
    'o rotulo antigo voltou ao formulario',
  )
})

test('CARTEIRA: Modelo operacional e Segmento ficam visualmente SEPARADOS', () => {
  // Sem fio: a separacao e largura declarada + espacamento em cada celula.
  assert.ok(
    CARTEIRA.includes('>Modelo operacional<'),
    'o cabecalho voltou a abreviar para "Modelo"',
  )
  assert.ok(CARTEIRA.includes('w-[11rem] whitespace-nowrap">Modelo operacional'))
  assert.ok(CARTEIRA.includes('w-[12rem]">Segmento'))
  // Respiro nas DUAS celulas, nao so numa.
  assert.equal(
    (CARTEIRA.match(/<Td className="(pr-6|max-w-0 pr-6)">/g) ?? []).length, 2,
    'o espacamento entre Modelo e Segmento mudou de forma',
  )
})

test('CARTEIRA: a ordem das colunas e a da composicao', () => {
  // Cliente → Modelo → Segmento → Conta → Status → Mensalidade → Gestor → Ações
  //
  // "Conta" passou para DEPOIS de Segmento: ela e curta e de largura fixa, e
  // ficava entre o nome e o modelo separando duas colunas que se leem juntas.
  const cabecalho = CARTEIRA.slice(CARTEIRA.indexOf('<HeadRow>'), CARTEIRA.indexOf('</HeadRow>'))
  const ordem = [
    'Cliente', 'Modelo operacional', 'Segmento', 'Conta',
    'Status', 'Mensalidade API', 'Gestor', 'Ações',
  ]
  let pos = -1
  for (const col of ordem) {
    const i = cabecalho.indexOf(`>${col}<`)
    assert.ok(i > pos, `${col} fora de ordem no cabecalho da Carteira`)
    pos = i
  }
})

test('CARTEIRA: nada foi removido — conta, status, mensalidade e gestor ficam', () => {
  for (const col of ['Cliente', 'Conta', 'Status', 'Mensalidade API', 'Gestor']) {
    assert.ok(CARTEIRA.includes(`>${col}<`), `a coluna ${col} desapareceu da Carteira`)
  }
})

/* ========================================================================= *
 * DESCRIÇÃO CURTA E CATEGORIA — na tela de Lançamentos
 * ========================================================================= */

test('LANCAMENTOS: toda linha tem DETALHES, nao so a de origem BaaS', () => {
  // Um lancamento comum nao tinha para onde clicar: para LER a observacao era
  // preciso abrir o formulario de ESCRITA.
  assert.ok(
    LANCAMENTOS.includes('onClick={() => setDetalhe(l)}>Detalhes</Button>'),
    'o botao Detalhes voltou a ser condicional',
  )
})

test('o painel de detalhes mostra os campos gerais pedidos', () => {
  const D = ler('components/financeiro/DetalheLancamento.tsx')
  for (const campo of [
    'Descrição', 'Categoria', 'Tipo', 'Data do lançamento',
    'Status', 'Periodicidade', 'Fornecedor', 'Origem',
  ]) {
    assert.ok(D.includes(`rotulo="${campo}"`), `o campo ${campo} saiu do detalhe`)
  }
  // Observacao aparece sempre, com "—" quando vazia: a ausencia e informacao.
  assert.ok(D.includes('Observação'))
  assert.ok(D.includes("l.observacao?.trim() || '—'"))
})

test('o detalhe BaaS entra no MESMO painel, nao num segundo modal', () => {
  const D = ler('components/financeiro/DetalheLancamento.tsx')
  assert.ok(D.includes('<CorpoBaas l={baas} />'), 'a camada BaaS saiu do painel geral')
  assert.ok(!D.includes('<DetalheBaas'), 'voltou a empilhar um modal sobre o outro')
})
