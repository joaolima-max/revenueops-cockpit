/**
 * TODO VALOR DE ENUM TEM RÓTULO — verificado EXECUTANDO a busca.
 *
 * ── A LIÇÃO ──────────────────────────────────────────────────────────────
 *
 * `MODELO_OPERACIONAL_LABELS['BAAS']` era `undefined`. React renderiza
 * `undefined` como nada, então o `<option>` de BaaS existia, estava
 * selecionável e era INVISÍVEL — e o badge da tabela saía vazio. O efeito
 * apareceu nos dados: 29 clientes API, 4 White Label e ZERO BaaS, porque
 * ninguém conseguiu cadastrar o que não dava para ver.
 *
 * Os testes existentes passavam porque verificavam a LISTA de valores do
 * enum (`MODELOS` tem 'BAAS' ✓) e nunca a existência do RÓTULO de cada um.
 * Eram testes de código-fonte por substring; este EXECUTA o acesso ao mapa,
 * que é onde a ausência aparece.
 *
 * O tipo também mudou — `Record<ModeloOperacional, string>` em vez de
 * `Record<string, string>` —, então a omissão virou erro de compilação. Este
 * teste é a segunda rede: ele pega o caso em que alguém afrouxa o tipo de
 * novo, e cobre os mapas que ainda são `Record<string, string>`.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  MODELO_OPERACIONAL_LABELS, CLIENTE_STATUS_LABELS, SEGMENTO_CRM_LABELS,
} from '../lib/utils'

/** Os valores de um enum, lidos do schema — a fonte da verdade. */
function valoresDoEnum(nome: string): string[] {
  const schema = readFileSync('prisma/schema.prisma', 'utf8')
  const m = schema.match(new RegExp(`enum ${nome} \\{([^}]*)\\}`))
  assert.ok(m, `enum ${nome} nao encontrado no schema`)
  return m![1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('///'))
}

/* ========================================================================= *
 * MODELO OPERACIONAL — o bug relatado
 * ========================================================================= */

test('TODO valor de ModeloOperacional tem rotulo nao vazio', () => {
  const faltando: string[] = []
  for (const v of valoresDoEnum('ModeloOperacional')) {
    const rotulo = (MODELO_OPERACIONAL_LABELS as Record<string, string>)[v]
    if (typeof rotulo !== 'string' || rotulo.trim() === '') faltando.push(v)
  }
  assert.deepEqual(
    faltando, [],
    `sem rotulo (renderiza em branco na UI): ${faltando.join(', ')}`,
  )
})

test('os TRES modelos existem, com a grafia da marca', () => {
  // A especificacao e literal: API, BaaS, White label.
  assert.equal(MODELO_OPERACIONAL_LABELS.API, 'API')
  assert.equal(MODELO_OPERACIONAL_LABELS.BAAS, 'BaaS')
  assert.equal(MODELO_OPERACIONAL_LABELS.WHITE_LABEL, 'White Label')
})

test('o rotulo de BaaS NAO e a grafia do banco', () => {
  // "BAAS" e como o enum do Postgres guarda; nunca o que o usuario le.
  assert.notEqual(MODELO_OPERACIONAL_LABELS.BAAS, 'BAAS')
  assert.notEqual(MODELO_OPERACIONAL_LABELS.BAAS, 'Baas')
})

test('o enum tem EXATAMENTE os tres valores — nenhum duplicado', () => {
  const vs = valoresDoEnum('ModeloOperacional')
  assert.deepEqual([...vs].sort(), ['API', 'BAAS', 'WHITE_LABEL'])
  assert.equal(new Set(vs).size, vs.length, 'valor duplicado no enum')
})

/* ========================================================================= *
 * O MESMO RISCO NOS OUTROS MAPAS
 * ========================================================================= */

test('TODO valor de ClienteStatus tem rotulo', () => {
  // A tela oferece apenas ATIVO e INATIVO, mas o enum tem legados gravados em
  // linhas antigas (ha 2 clientes em PROSPECCAO em producao). Sem rotulo, a
  // badge desses clientes sairia vazia — o mesmo defeito, noutro campo.
  const faltando = valoresDoEnum('ClienteStatus').filter(
    (v) => !(CLIENTE_STATUS_LABELS as Record<string, string>)[v],
  )
  assert.deepEqual(faltando, [], `status sem rotulo: ${faltando.join(', ')}`)
})

test('TODO valor de Segmento tem rotulo em SEGMENTO_CRM_LABELS', () => {
  // Este e o mapa que as telas usam de fato, com `?? valor` de retaguarda.
  // 17 clientes em producao usam CRYPTO_EXCHANGES, GATEWAY_PAGAMENTOS e
  // REMESSA_FX — se o mapa nao os cobrisse, a tela mostraria o valor cru do
  // enum em vez do nome.
  const faltando = valoresDoEnum('Segmento').filter(
    (v) => !(SEGMENTO_CRM_LABELS as Record<string, string>)[v],
  )
  assert.deepEqual(faltando, [], `segmento sem rotulo: ${faltando.join(', ')}`)
})

/* ========================================================================= *
 * O TIPO É A PRIMEIRA REDE
 * ========================================================================= */

test('os mapas de rotulo sao tipados pelo ENUM, nao por string', () => {
  /**
   * `Record<string, string>` aceita qualquer chave e nao exige nenhuma: um
   * valor de enum sem rotulo compilava, passava no lint e passava nos testes.
   * `Record<ModeloOperacional, string>` torna a omissao erro de COMPILACAO,
   * que e onde esse esquecimento deve aparecer.
   */
  const u = readFileSync('lib/utils.ts', 'utf8')
  assert.ok(
    u.includes('MODELO_OPERACIONAL_LABELS: Record<ModeloOperacional, string>'),
    'o mapa de modelo operacional voltou a ser Record<string, string>',
  )
  assert.ok(
    u.includes('CLIENTE_STATUS_LABELS: Record<ClienteStatus, string>'),
    'o mapa de status voltou a ser Record<string, string>',
  )
})

test('as interfaces de Cliente usam o ENUM, nao string solta', () => {
  // Era `modeloOperacional: string`, e por isso indexar o mapa compilava
  // mesmo com o mapa incompleto.
  for (const f of [
    'app/dashboard/carteira/CarteiraClient.tsx',
    'app/dashboard/carteira/[id]/ClienteDetailClient.tsx',
  ]) {
    const t = readFileSync(f, 'utf8')
    assert.ok(
      t.includes('modeloOperacional: ModeloOperacional'),
      `${f} voltou a tipar modeloOperacional como string`,
    )
    assert.ok(t.includes('status: ClienteStatus'), `${f} voltou a tipar status como string`)
  }
})

/* ========================================================================= *
 * O SELECT OFERECE OS TRÊS
 * ========================================================================= */

test('o select de Modelo Operacional percorre os TRES valores', () => {
  const C = readFileSync('app/dashboard/carteira/CarteiraClient.tsx', 'utf8')
  assert.ok(
    C.includes("const MODELOS = ['API', 'BAAS', 'WHITE_LABEL'] as const"),
    'a lista do select mudou',
  )
  // E cada um renderiza o rotulo do mapa — que agora existe para os tres.
  assert.ok(C.includes('{MODELO_OPERACIONAL_LABELS[m]}'))
})
