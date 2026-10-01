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
import { readFileSync } from 'node:fs'

const ler = (p: string) => readFileSync(p, 'utf8')

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
  assert.ok(CARTEIRA.includes('<Td className="max-w-0">'))
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
  // Estavam colados: segmento e texto cadastrado, de largura imprevisivel, e
  // sem teto encostava no modelo — que e um badge curto e fixo.
  const iModelo = CARTEIRA.indexOf('>Modelo<')
  const iSegmento = CARTEIRA.indexOf('>Segmento<')
  assert.ok(iModelo > 0 && iSegmento > 0, 'uma das colunas desapareceu')
  assert.ok(iModelo < iSegmento, 'Modelo deveria vir antes de Segmento')

  assert.ok(CARTEIRA.includes('className="w-[7.5rem]">Modelo'))
  assert.ok(CARTEIRA.includes('className="w-[10rem]">Segmento'))
})

test('ha RESPIRO entre o badge do modelo e o do segmento', () => {
  assert.ok(CARTEIRA.includes('<Td className="pr-4">'), 'o espacamento entre as duas colunas saiu')
})

test('a Carteira preserva as colunas que a tela existe para dar', () => {
  for (const col of ['Cliente', 'Conta', 'Modelo', 'Segmento', 'Status', 'Gestor', 'Ações']) {
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
 * COCKPIT — velas simplificadas
 * ========================================================================= */

/** Só o corpo da função do tooltip — comentários do arquivo não contam. */
function corpoDoTooltip(): string {
  const C = ler('components/ui/Candles.tsx')
  const ini = C.indexOf('function Dica(')
  const fim = C.indexOf('return (\n    <ResponsiveContainer')
  assert.ok(ini > 0 && fim > ini, 'a função do tooltip mudou de forma')
  return C.slice(ini, fim)
}

test('o tooltip da vela mostra PERIODO e OHLC — e nada mais', () => {
  const t = corpoDoTooltip()
  for (const r of ['Abertura', 'Máxima', 'Mínima', 'Fechamento']) {
    assert.ok(t.includes(`rotulo="${r}"`), `${r} saiu do tooltip`)
  }
  assert.ok(t.includes('periodo'), 'o periodo saiu do tooltip')

  // O que saiu: contagem de observacoes, variacao percentual e a nota sobre
  // vela sem dispersao. Cada uma era verdadeira e nenhuma era a pergunta.
  assert.ok(!t.includes('observaç'), 'a contagem de observacoes voltou ao tooltip')
  assert.ok(!t.includes('% no período'), 'a variacao percentual voltou ao tooltip')
  assert.ok(!t.includes('velaDegenerada'), 'a nota de vela sem dispersao voltou')
})

test('o calculo de variacao saiu do grafico', () => {
  const C = ler('components/ui/Candles.tsx')
  assert.ok(!C.includes('variacaoDaVela'), 'o grafico voltou a calcular variacao')
})

test('sem indicador de trading: nenhum RSI, MACD, banda ou media movel', () => {
  const C = ler('components/ui/Candles.tsx')
  // Palavra inteira: `/EMA/i` casaria dentro de "SEMANA", e `/SMA/i` dentro
  // de "mesma" — um teste que falha por substring nao protege nada.
  for (const proibido of ['RSI', 'MACD', 'Bollinger', 'EMA', 'SMA', 'ATR', 'Ichimoku']) {
    assert.ok(
      !new RegExp(`\\b${proibido}\\b`).test(C),
      `${proibido} apareceu no grafico de velas`,
    )
  }
  // Uma única série: a das velas. Nenhuma linha ou área sobreposta.
  assert.equal((C.match(/<Bar /g) ?? []).length, 1, 'ha mais de uma serie no grafico')
  assert.ok(!C.includes('<Line '), 'uma linha foi sobreposta as velas')
  assert.ok(!C.includes('<Area '), 'uma area foi sobreposta as velas')
})

test('a grade e discreta: so horizontal, sem tracejado', () => {
  const tema = ler('lib/chart-theme.ts')
  assert.ok(tema.includes('vertical: false'))
  assert.ok(tema.includes("strokeDasharray: '0'"))
})

test('o eixo e limpo: poucas marcas e rotulos que nao se empilham', () => {
  const C = ler('components/ui/Candles.tsx')
  assert.ok(C.includes('tickCount={4}'), 'o eixo voltou a encher de numeros')
  assert.ok(C.includes('interval="preserveStartEnd"'), 'os rotulos voltam a competir no mobile')
})

test('os candles sao estreitos — a serie precisa parecer uma serie', () => {
  const C = ler('components/ui/Candles.tsx')
  assert.ok(C.includes('width * 0.44'), 'os candles voltaram a encostar um no outro')
})

test('o valor no tooltip vem do formatador de fora — moeda por extenso', () => {
  // Nunca K, M, MM ou BI: quem passa o formatador e o Cockpit, com `moedaCheia`.
  const C = ler('components/ui/Candles.tsx')
  assert.ok(C.includes('formatar: (n: number) => string'))
  const cockpit = ler('components/dashboard/DashboardCharts.tsx')
  assert.ok(cockpit.includes('formatar={moedaCheia}'))
})

test('cada vela tem titulo proprio no Cockpit', () => {
  const cockpit = ler('components/dashboard/DashboardCharts.tsx')
  for (const t of ['TPV — velas mensais', 'Receita — velas mensais', 'Transações — velas mensais']) {
    assert.ok(cockpit.includes(t), `o grafico "${t}" perdeu o titulo`)
  }
})
