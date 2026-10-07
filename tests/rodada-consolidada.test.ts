/**
 * AS CORREÇÕES DESTA RODADA — categoria unificada, descrição legível,
 * Contas a Receber sem criação manual e Metas sem comparação histórica.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CATEGORIA_BAAS, CATEGORIA_RECEITA_BAAS, CATEGORIA_DESPESA_BAAS } from '../lib/baas-titulos'

const ler = (p: string) => readFileSync(p, 'utf8')
const RAIZ = process.cwd()

/** O arquivo sem comentários — de linha, de bloco e de JSX. Os comentários
 *  citam o que foi removido, e varrer o arquivo inteiro por substring acusa a
 *  própria explicação como se fosse o defeito voltando. */
const semComentarios = (txt: string) =>
  txt
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/* ========================================================================= *
 * CATEGORIA BAAS — um nome, nos dois tipos
 * ========================================================================= */

test('a categoria dos TRES registros e "BaaS"', () => {
  // Receita, titulo a receber e repasse: a categoria responde "de onde vem?",
  // e a resposta e a mesma para os tres.
  assert.equal(CATEGORIA_BAAS, 'BaaS')
  assert.equal(CATEGORIA_RECEITA_BAAS, 'BaaS')
  assert.equal(CATEGORIA_DESPESA_BAAS, 'BaaS')
})

test('nao existe categoria chamada pelo PAPEL do registro', () => {
  // "Tarifa BaaS" e "Repasse BaaS" sao DESCRICAO, nao categoria. Nomear a
  // categoria pelo papel criava tres nomes para uma origem.
  const t = ler('lib/baas-titulos.ts')
  for (const proibido of [
    "= 'Tarifas BaaS'", "= 'Tarifa BaaS'",
    "= 'Repasse BaaS'", "= 'Repasse a Cliente BaaS'",
    "= 'Receita BaaS'",
  ]) {
    assert.ok(!t.includes(proibido), `categoria nomeada pelo papel: ${proibido}`)
  }
})

test('os TRES registros usam a categoria/rotulo BaaS no codigo', () => {
  const t = semComentarios(ler('lib/baas-titulos.ts'))
  // Lancamento de receita e repasse: pela FK de categoria.
  assert.ok(t.includes("categoria(tx, CATEGORIA_BAAS, 'RECEITA')"))
  assert.ok(t.includes("categoria(tx, CATEGORIA_BAAS, 'DESPESA')"))
  // Titulo a receber: `tipo` e texto livre, e e o badge que a tela mostra.
  assert.ok(t.includes('tipo: CATEGORIA_BAAS'), 'o titulo a receber perdeu a categoria BaaS')
})

test('a DESCRICAO continua distinguindo os tres', () => {
  // A categoria agrupa; a descricao diz qual e qual. Se as duas colapsassem,
  // tres linhas identicas apareceriam em Lancamentos.
  const t = ler('lib/baas-titulos.ts')
  /**
   * v28 — DOIS rotulos para TRES registros.
   *
   * "Apuração BaaS" nomeia a receita E o titulo a receber, que valem o MESMO
   * (o saldo integral apurado) visto de dois lugares. "Comissão BaaS" nomeia a
   * despesa. O rotulo repetido e a informacao: nomea-los diferente sugeriria
   * valores diferentes.
   */
  assert.equal(
    (t.match(/descricao\(d, 'Apuração BaaS'\)/g) ?? []).length, 2,
    'a receita e o titulo a receber devem compartilhar o rotulo',
  )
  assert.equal(
    (t.match(/descricao\(d, 'Comissão BaaS'\)/g) ?? []).length, 1,
    'a comissao deixou de ter rotulo proprio',
  )
})

/* ========================================================================= *
 * CONTAS A RECEBER — não cria títulos
 * ========================================================================= */

test('a rota de Contas a Receber RECUSA criacao de titulo', () => {
  const r = ler('app/api/financeiro/contas-receber/route.ts')
  // A tela nunca ofereceu o botao; o endpoint existia e era alcancavel por
  // qualquer um com manage_financeiro.
  assert.ok(!r.includes('prisma.contaReceber.create'), 'a criacao manual voltou')
  assert.ok(r.includes('status: 405'), 'a recusa nao usa 405')
})

test('a recusa DIZ onde o titulo se cria', () => {
  // Apagar a rota devolveria 405 sem explicacao. A diferenca entre "nao
  // existe" e "nao e por aqui" e o que evita a pessoa procurar um bug.
  const r = ler('app/api/financeiro/contas-receber/route.ts')
  assert.ok(r.includes('Lançamentos'), 'a recusa nao aponta Lancamentos')
  assert.ok(r.includes('Lançamento BaaS'), 'a recusa nao aponta o Lancamento BaaS')
})

test('a tela de Contas a Receber nao tem criacao', () => {
  const c = ler('app/dashboard/financeiro/cp-cr/receber/ContasReceberClient.tsx')
  for (const proibido of ['Novo Título', 'Novo título', "method: 'POST'"]) {
    assert.ok(!c.includes(proibido), `criacao manual na tela: ${proibido}`)
  }
})

test('Contas a Receber tem "Ir para lançamentos"', () => {
  const c = ler('app/dashboard/financeiro/cp-cr/receber/ContasReceberClient.tsx')
  assert.ok(c.includes('Ir para Lançamentos') || c.includes('Ir para lançamentos'))
})

test('Contas a Pagar tem "Ir para lançamentos"', () => {
  const c = ler('app/dashboard/financeiro/cp-cr/ContasPagarClient.tsx')
  assert.ok(c.includes('Ir para lançamentos'))
  // No cabecalho, sempre alcancavel — nao so no estado vazio.
  assert.ok(
    c.indexOf('Ir para lançamentos') < c.indexOf('Nenhuma despesa neste período'),
    'o botao existe apenas no estado vazio',
  )
})

/* ========================================================================= *
 * LANÇAMENTOS — a descrição cabe
 * ========================================================================= */

test('"Folha de pagamento" cabe em UMA linha', () => {
  /**
   * Duas propriedades, e as duas sao necessarias:
   *
   *   1. `bp-truncate` tem `white-space: nowrap`, entao a palavra nunca
   *      quebra — o texto cabe ou ganha reticencias;
   *   2. o PISO da coluna precisa ser largo o bastante para o caso comum.
   *      "Folha de pagamento" em t-body (0.9375rem) ocupa ~8,5rem de texto;
   *      com o `pl-5` e a folga da celula, 16rem acomoda com sobra.
   *
   * Sem o piso, a coluna era comprimida a ~12rem pelas outras sete e cortava
   * o texto ainda sobrando tela.
   */
  const css = ler('app/globals.css')
  assert.ok(
    /\.bp-truncate\s*\{[^}]*white-space:\s*nowrap/.test(css),
    'bp-truncate perdeu o nowrap — a descricao voltaria a quebrar palavra',
  )

  const L = ler('app/dashboard/financeiro/cp-cr/lancamentos/LancamentosClient.tsx')
  const m = L.match(/w-\[clamp\((\d+)rem,\s*\d+%,\s*\d+rem\)\]">Descrição/)
  assert.ok(m, 'a coluna Descricao perdeu o clamp de largura')
  assert.ok(
    Number(m![1]) >= 16,
    `o piso da Descricao e ${m![1]}rem — insuficiente para "Folha de pagamento"`,
  )
})

test('a tabela de Lancamentos ROLA em vez de comprimir', () => {
  const L = ler('app/dashboard/financeiro/cp-cr/lancamentos/LancamentosClient.tsx')
  assert.ok(L.includes('min-w-[76rem]'), 'a tabela voltou a comprimir as oito colunas')
  const shell = ler('components/ui/DataTable.tsx')
  assert.ok(shell.includes('overflow-x-auto'), 'o TableShell perdeu a rolagem')
})

test('a Categoria fica COMPACTA e nao disputa com a descricao', () => {
  const L = ler('app/dashboard/financeiro/cp-cr/lancamentos/LancamentosClient.tsx')
  assert.ok(L.includes('className="w-[9rem]">Categoria'))
})

test('descricao longa ganha ellipsis E o texto no tooltip', () => {
  const L = ler('app/dashboard/financeiro/cp-cr/lancamentos/LancamentosClient.tsx')
  assert.ok(L.includes('bp-truncate" title={l.descricao}'), 'a descricao perdeu o tooltip')
})

/* ========================================================================= *
 * CARTEIRA — legível, com rolagem
 * ========================================================================= */

test('a Carteira ROLA em vez de esmagar as oito colunas', () => {
  const C = ler('app/dashboard/carteira/CarteiraClient.tsx')
  assert.ok(C.includes('min-w-[76rem]'), 'a Carteira voltou a comprimir as colunas')
})

test('o nome do cliente trunca com tooltip', () => {
  // Razao social cadastrada: ninguem controla o tamanho.
  const C = ler('app/dashboard/carteira/CarteiraClient.tsx')
  assert.ok(C.includes('title={c.nome}'), 'o nome do cliente perdeu o tooltip')
  assert.ok(C.includes('<Td className="pl-5 max-w-0">'), 'a celula do nome voltou a crescer')
})

/* ========================================================================= *
 * METAS — sem comparação histórica
 * ========================================================================= */

test('o grafico de COMPARACAO HISTORICA foi REMOVIDO', () => {
  assert.ok(
    !existsSync(resolve(RAIZ, 'components/metas/EvolucaoMetas.tsx')),
    'o componente da comparacao historica ainda existe',
  )
  const p = semComentarios(ler('app/dashboard/metas/page.tsx'))
  assert.ok(!p.includes('EvolucaoMetas'), 'a comparacao historica voltou a Metas')
  assert.ok(!p.includes('Comparação histórica'))
  // As 6 consultas que a alimentavam sairam junto.
  assert.ok(!p.includes('ultimosPeriodos'), 'a janela de 6 meses continua sendo consultada')
})

test('NADA entrou no lugar da comparacao historica', () => {
  const p = semComentarios(ler('app/dashboard/metas/page.tsx'))
  // Dois blocos: acompanhamento e cadastro. Nem um terceiro, nem substituto.
  assert.ok(p.includes('<MetaAnalytics'), 'o acompanhamento saiu de Metas')
  assert.ok(p.includes('<MetasClient'), 'o cadastro saiu de Metas')
  const componentes = (p.match(/<[A-Z][A-Za-z]+/g) ?? [])
    .filter((c) => !['<MetaAnalytics', '<MetasClient'].includes(c))
  assert.deepEqual(componentes, [], `componente inesperado em Metas: ${componentes.join(', ')}`)
})

test('o RESTO do painel de Metas permanece', () => {
  // A remocao e cirurgica: so o grafico de comparacao historica.
  const M = ler('components/metas/MetaAnalytics.tsx')
  for (const peca of ['Regua', 'pacing', 'cumprimento', 'gap']) {
    assert.ok(M.includes(peca), `o painel perdeu ${peca}`)
  }
  const C = ler('app/dashboard/metas/MetasClient.tsx')
  assert.ok(C.includes('META_TIPOS'), 'o cadastro perdeu os tipos de meta')
})

/* ========================================================================= *
 * DISTRIBUIÇÃO DO PIPELINE — nenhum campo monetário no CONTRATO
 * ========================================================================= */

test('o contrato da distribuicao do Pipeline NAO tem campo monetario', () => {
  /**
   * O pedido e explicito: "nao basta esconder a moeda visualmente — remover o
   * campo monetario da origem do dataset/contrato".
   *
   * A distribuicao e `Array<{ resultado, total }>`, e `total` e CONTAGEM de
   * cards. Nenhum campo de valor atravessa a API.
   */
  const crm = ler('app/dashboard/crm/CrmClient.tsx')
  const m = crm.match(/distribuicao:\s*Array<\{([^}]*)\}>/)
  assert.ok(m, 'o contrato da distribuicao mudou de forma')
  const campos = m![1]
  for (const proibido of ['valor', 'value', 'amount', 'montante', 'receita']) {
    assert.ok(!campos.includes(proibido), `campo monetario no contrato: ${proibido}`)
  }
  assert.ok(campos.includes('total'), 'a contagem saiu do contrato')
})

test('a API do Comercial nao seleciona o valor legado do card', () => {
  // `Deal.value` existe na tabela como legado e nao e cadastrado nem exibido.
  const api = semComentarios(ler('app/api/crm/route.ts'))
  assert.ok(!/\bvalue:\s*true/.test(api), 'a API voltou a selecionar Deal.value')
})

/* ========================================================================= *
 * ANEXOS — os formatos e o teto
 * ========================================================================= */

test('anexos: no maximo 4 por lancamento', () => {
  const a = ler('lib/arquivos.ts')
  assert.ok(a.includes('export const MAX_ANEXOS_LANCAMENTO = 4'))
})

test('anexos aceitam JPG, JPEG, PNG, WEBP e PDF', () => {
  const a = ler('lib/arquivos.ts')
  for (const ext of ['pdf:', 'jpg:', 'jpeg:', 'png:', 'webp:']) {
    assert.ok(a.includes(ext), `a extensao ${ext} saiu dos formatos aceitos`)
  }
})

test('o quinto anexo e BLOQUEADO, com mensagem', () => {
  const a = ler('lib/arquivos.ts')
  assert.ok(a.includes('if (quantidadeAtual < MAX_ANEXOS_LANCAMENTO) return null'))
  assert.ok(a.includes('que é o máximo'), 'o bloqueio nao explica')
})
