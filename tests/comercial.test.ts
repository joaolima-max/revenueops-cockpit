/**
 * VISÃO GERAL DO COMERCIAL.
 *
 * O que estes testes protegem:
 *
 *   1. NENHUM VALOR MONETÁRIO. O valor comercial de um lead não está validado,
 *      e o módulo não tem como produzi-lo nem por acidente.
 *   2. Os cortes LEEM A MESMA LISTA, então os totais fecham: "por segmento" e
 *      "por etapa" não podem discordar sobre a mesma base.
 *   3. Ausência é null, nunca zero — base vazia não tem "0% de conversão".
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  leadsPorSegmento, leadsPorEtapa, segmentoPorEtapa, emAtividadeAssistida,
  geradosNoPeriodo, comparar, taxaConversao, periodoDe, periodoAnterior,
  type LeadBruto,
} from '../lib/comercial'

const D = (iso: string) => new Date(`${iso}T12:00:00Z`)

function lead(p: Partial<LeadBruto> & { id: string }): LeadBruto {
  return {
    segmento: null, criadoEm: D('2026-10-05'),
    etapaId: null, resultado: null, responsavelId: null,
    temAtividadeAberta: false,
    ...p,
  }
}

const ETAPAS = [
  { id: 'e1', nome: 'Prospecção' },
  { id: 'e2', nome: 'Qualificação' },
  { id: 'e3', nome: 'Proposta' },
]

/* ========================================================================= *
 * NENHUM VALOR MONETÁRIO
 * ========================================================================= */

test('o contrato de lead nao tem campo de valor', () => {
  const l = lead({ id: 'a' })
  for (const chave of Object.keys(l)) {
    assert.ok(
      !/valor|value|receita|preco|price|ticket|mrr/i.test(chave),
      `o lead ganhou um campo monetario: ${chave}`,
    )
  }
})

test('nenhuma distribuicao devolve campo monetario', () => {
  const leads = [lead({ id: 'a', segmento: 'SAAS', resultado: 'EM_ANDAMENTO', etapaId: 'e1' })]
  const saidas = [
    ...leadsPorSegmento(leads),
    ...leadsPorEtapa(leads, ETAPAS),
  ]
  for (const f of saidas) {
    for (const chave of Object.keys(f)) {
      assert.ok(
        !/valor|value|receita|preco/i.test(chave),
        `a fatia expos um campo monetario: ${chave}`,
      )
    }
  }
})

/* ========================================================================= *
 * DISTRIBUIÇÃO POR SEGMENTO
 * ========================================================================= */

test('leads sem segmento entram como "Nao informado", nao sao descartados', () => {
  const leads = [
    lead({ id: 'a', segmento: 'SAAS' }),
    lead({ id: 'b', segmento: null }),
    lead({ id: 'c', segmento: null }),
  ]
  const fatias = leadsPorSegmento(leads)

  // O total das fatias tem de ser a base inteira: um grafico que soma menos
  // que a base faz o leitor procurar erro na conta.
  assert.equal(fatias.reduce((a, f) => a + f.total, 0), 3)
  assert.ok(fatias.some((f) => f.label === 'Não informado' && f.total === 2))
})

test('o percentual e sobre a base, e e null quando a base e vazia', () => {
  const fatias = leadsPorSegmento([
    lead({ id: 'a', segmento: 'SAAS' }),
    lead({ id: 'b', segmento: 'SAAS' }),
    lead({ id: 'c', segmento: 'ERP' }),
  ])
  const saas = fatias.find((f) => f.chave === 'SAAS')!
  assert.ok(Math.abs(saas.percentual! - 66.666) < 0.01)

  assert.deepEqual(leadsPorSegmento([]), [])
})

test('o rotulo do segmento vem de fora — o modulo nao conhece a taxonomia', () => {
  const fatias = leadsPorSegmento(
    [lead({ id: 'a', segmento: 'CRYPTO_EXCHANGES' })],
    (s) => (s === 'CRYPTO_EXCHANGES' ? 'Cripto Exchanges' : s),
  )
  assert.equal(fatias[0].label, 'Cripto Exchanges')
})

/* ========================================================================= *
 * DISTRIBUIÇÃO POR ETAPA
 * ========================================================================= */

test('card DECIDIDO sai da contagem por etapa', () => {
  // Um lead ganho na Proposta nao e "um lead em Proposta": e um lead ganho.
  // Conta-lo na etapa inflaria a coluna com trabalho que ja terminou.
  const leads = [
    lead({ id: 'a', etapaId: 'e3', resultado: 'EM_ANDAMENTO' }),
    lead({ id: 'b', etapaId: 'e3', resultado: 'GANHO' }),
    lead({ id: 'c', etapaId: 'e3', resultado: 'PERDIDO' }),
  ]
  const fatias = leadsPorEtapa(leads, ETAPAS)
  assert.equal(fatias.find((f) => f.chave === 'e3')!.total, 1)
})

test('etapa vazia continua no grafico, com zero', () => {
  // Uma etapa que desaparece por nao ter lead esconde exatamente o buraco que
  // o grafico existe para mostrar.
  const fatias = leadsPorEtapa(
    [lead({ id: 'a', etapaId: 'e1', resultado: 'EM_ANDAMENTO' })],
    ETAPAS,
  )
  assert.equal(fatias.length, 3)
  assert.deepEqual(fatias.map((f) => f.total), [1, 0, 0])
})

test('as etapas saem na ORDEM DO FUNIL, nao por volume', () => {
  const fatias = leadsPorEtapa(
    [
      lead({ id: 'a', etapaId: 'e3', resultado: 'EM_ANDAMENTO' }),
      lead({ id: 'b', etapaId: 'e3', resultado: 'EM_ANDAMENTO' }),
      lead({ id: 'c', etapaId: 'e1', resultado: 'EM_ANDAMENTO' }),
    ],
    ETAPAS,
  )
  assert.deepEqual(fatias.map((f) => f.label), ['Prospecção', 'Qualificação', 'Proposta'])
})

test('lead fora do Pipeline nao entra na contagem por etapa', () => {
  const fatias = leadsPorEtapa([lead({ id: 'a' })], ETAPAS)
  assert.deepEqual(fatias.map((f) => f.total), [0, 0, 0])
  assert.deepEqual(fatias.map((f) => f.percentual), [null, null, null])
})

/* ========================================================================= *
 * SEGMENTO × ETAPA
 * ========================================================================= */

test('a matriz cruza segmento com etapa e fecha com a contagem por etapa', () => {
  const leads = [
    lead({ id: 'a', segmento: 'SAAS', etapaId: 'e1', resultado: 'EM_ANDAMENTO' }),
    lead({ id: 'b', segmento: 'SAAS', etapaId: 'e2', resultado: 'EM_ANDAMENTO' }),
    lead({ id: 'c', segmento: 'ERP', etapaId: 'e1', resultado: 'EM_ANDAMENTO' }),
  ]
  const matriz = segmentoPorEtapa(leads, ETAPAS)
  const porEtapa = leadsPorEtapa(leads, ETAPAS)

  // As duas visoes leem a MESMA lista: discordar seria o bug.
  for (let i = 0; i < ETAPAS.length; i++) {
    const daMatriz = matriz.reduce((a, l) => a + l.porEtapa[i], 0)
    assert.equal(daMatriz, porEtapa[i].total, `etapa ${ETAPAS[i].nome} divergiu`)
  }
})

test('segmento sem lead aberto nao vira linha de zeros', () => {
  const matriz = segmentoPorEtapa(
    [lead({ id: 'a', segmento: 'SAAS', etapaId: 'e1', resultado: 'GANHO' })],
    ETAPAS,
  )
  assert.equal(matriz.length, 0)
})

test('a matriz ordena por volume, do maior para o menor', () => {
  const matriz = segmentoPorEtapa(
    [
      lead({ id: 'a', segmento: 'ERP', etapaId: 'e1', resultado: 'EM_ANDAMENTO' }),
      lead({ id: 'b', segmento: 'SAAS', etapaId: 'e1', resultado: 'EM_ANDAMENTO' }),
      lead({ id: 'c', segmento: 'SAAS', etapaId: 'e2', resultado: 'EM_ANDAMENTO' }),
    ],
    ETAPAS,
  )
  assert.equal(matriz[0].segmento, 'SAAS')
  assert.equal(matriz[0].total, 2)
})

/* ========================================================================= *
 * ATIVIDADE ASSISTIDA
 * ========================================================================= */

test('card aberto COM responsavel conta como atividade assistida', () => {
  const a = emAtividadeAssistida([
    lead({ id: 'a', resultado: 'EM_ANDAMENTO', responsavelId: 'u1' }),
  ])
  assert.equal(a.total, 1)
  assert.equal(a.percentual, 100)
})

test('card aberto SEM responsavel nao conta', () => {
  // E justamente o lead que ninguem esta tocando. Conta-lo transformaria o
  // indicador em mais uma contagem de pipeline.
  const a = emAtividadeAssistida([
    lead({ id: 'a', resultado: 'EM_ANDAMENTO', responsavelId: null }),
  ])
  assert.equal(a.total, 0)
})

test('tarefa ou follow-up em aberto conta, mesmo sem card aberto', () => {
  const a = emAtividadeAssistida([
    lead({ id: 'a', resultado: 'GANHO', responsavelId: 'u1', temAtividadeAberta: true }),
  ])
  assert.equal(a.total, 1)
})

test('o denominador e a base INTEIRA, inclusive quem nunca entrou no Pipeline', () => {
  const a = emAtividadeAssistida([
    lead({ id: 'a', resultado: 'EM_ANDAMENTO', responsavelId: 'u1' }),
    lead({ id: 'b' }),
    lead({ id: 'c' }),
    lead({ id: 'd' }),
  ])
  assert.equal(a.total, 1)
  assert.equal(a.percentual, 25)
})

test('base vazia devolve percentual NULL, nunca 0%', () => {
  const a = emAtividadeAssistida([])
  assert.equal(a.total, 0)
  assert.equal(a.percentual, null)
})

/* ========================================================================= *
 * PERÍODO E COMPARATIVOS
 * ========================================================================= */

test('geradosNoPeriodo conta pelo mes de CRIACAO', () => {
  const leads = [
    lead({ id: 'a', criadoEm: D('2026-10-01') }),
    lead({ id: 'b', criadoEm: D('2026-10-31') }),
    lead({ id: 'c', criadoEm: D('2026-09-30') }),
  ]
  assert.equal(geradosNoPeriodo(leads, '2026-10'), 2)
  assert.equal(geradosNoPeriodo(leads, '2026-09'), 1)
})

test('periodoAnterior atravessa a virada do ano', () => {
  assert.equal(periodoAnterior('2026-01'), '2025-12')
  assert.equal(periodoAnterior('2026-10'), '2026-09')
})

test('periodoDe usa UTC, como o resto do sistema', () => {
  assert.equal(periodoDe(new Date('2026-10-01T00:00:00Z')), '2026-10')
  assert.equal(periodoDe(new Date('2026-12-31T23:59:59Z')), '2026-12')
})

test('variacao e NULL quando o mes anterior foi zero — nao 100%, nem infinito', () => {
  // Sair de zero nao e crescimento percentual, e um comeco. A tela mostra os
  // dois numeros e deixa o leitor concluir.
  const c = comparar(10, 0)
  assert.equal(c.variacao, null)
  assert.equal(c.atual, 10)
  assert.equal(c.anterior, 0)
})

test('variacao percentual normal, nos dois sentidos', () => {
  assert.equal(comparar(150, 100).variacao, 50)
  assert.equal(comparar(50, 100).variacao, -50)
  assert.equal(comparar(100, 100).variacao, 0)
})

test('conversao e sobre os DECIDIDOS — pipeline cheio nao e punido', () => {
  // Incluir os abertos no denominador faria cinquenta leads novos derrubarem
  // a conversao sem nenhuma perda ter acontecido.
  assert.equal(taxaConversao(3, 1), 75)
  assert.equal(taxaConversao(0, 0), null, 'nada decidido nao e 0% de conversao')
  assert.equal(taxaConversao(0, 4), 0)
})
