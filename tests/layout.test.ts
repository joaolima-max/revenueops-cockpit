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
