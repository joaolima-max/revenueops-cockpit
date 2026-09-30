/**
 * ALÇADAS DE ADMINISTRAÇÃO — volumetria e exclusão de etapa.
 *
 * As regras que estes testes fixam existem porque as duas operações mexem em
 * coisa já apurada: a volumetria muda o mínimo consolidado de meses fechados, e
 * a exclusão de etapa esbarra no histórico de movimentação do pipeline.
 *
 * A UI esconde as ações e a API nega — as duas pontas leem estas funções, e é
 * por isso que elas moram em `lib/` e não dentro da rota.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { podeCriarVolumetria, podeAdministrarVolumetria } from '../lib/volumetria'
import { impedimentoExclusaoEtapa } from '../lib/pipeline'

const PERFIS = ['ADMIN', 'GESTOR', 'OPERACIONAL', 'COMERCIAL'] as const

/* ── Volumetria ──────────────────────────────────────────────────────────── */

test('editar e excluir volumetria é só de ADMIN', () => {
  assert.equal(podeAdministrarVolumetria('ADMIN'), true)
  for (const role of ['GESTOR', 'OPERACIONAL', 'COMERCIAL', '']) {
    assert.equal(podeAdministrarVolumetria(role), false, `${role} não deveria administrar`)
  }
})

test('criar volumetria continua sendo trabalho de turno, menos COMERCIAL', () => {
  for (const role of ['ADMIN', 'GESTOR', 'OPERACIONAL']) {
    assert.equal(podeCriarVolumetria(role), true, `${role} deveria criar`)
  }
  assert.equal(podeCriarVolumetria('COMERCIAL'), false)
})

test('criar é alçada mais ampla que administrar, e não o contrário', () => {
  // Quem administra necessariamente pode criar; o inverso não vale.
  for (const role of PERFIS) {
    if (podeAdministrarVolumetria(role)) {
      assert.equal(podeCriarVolumetria(role), true, `${role} administra mas não cria`)
    }
  }
  assert.ok(PERFIS.some((r) => podeCriarVolumetria(r) && !podeAdministrarVolumetria(r)),
    'as duas alçadas ficaram idênticas — a separação perdeu o sentido')
})

/* ── Exclusão de etapa ───────────────────────────────────────────────────── */

test('etapa nunca usada pode ser excluída', () => {
  assert.equal(impedimentoExclusaoEtapa({ cards: 0, movimentacoes: 0 }), null)
})

test('etapa com card é bloqueada e a mensagem manda inativar', () => {
  const msg = impedimentoExclusaoEtapa({ cards: 3, movimentacoes: 0 })
  assert.ok(msg)
  assert.match(msg!, /3 card/)
  assert.match(msg!, /[Ii]native/)
})

test('etapa sem card mas com histórico é bloqueada — o histórico não se apaga', () => {
  const msg = impedimentoExclusaoEtapa({ cards: 0, movimentacoes: 12 })
  assert.ok(msg)
  assert.match(msg!, /12 registro/)
  assert.match(msg!, /hist[oó]rico/i)
})

test('com card E histórico a mensagem cita os dois', () => {
  const msg = impedimentoExclusaoEtapa({ cards: 2, movimentacoes: 5 })
  assert.ok(msg)
  assert.match(msg!, /2 card/)
  assert.match(msg!, /5 registro/)
})

test('uma dependência sozinha já basta para bloquear', () => {
  assert.notEqual(impedimentoExclusaoEtapa({ cards: 1, movimentacoes: 0 }), null)
  assert.notEqual(impedimentoExclusaoEtapa({ cards: 0, movimentacoes: 1 }), null)
})

test('a mensagem de impedimento nunca oferece apagar movimentação', () => {
  // Uma regressão possível seria "remova o histórico para excluir".
  for (const dep of [{ cards: 1, movimentacoes: 0 }, { cards: 0, movimentacoes: 1 }, { cards: 4, movimentacoes: 9 }]) {
    const msg = impedimentoExclusaoEtapa(dep)!
    assert.ok(!/apagar o hist|remova o hist|excluir o hist/i.test(msg), `mensagem sugere apagar histórico: ${msg}`)
  }
})

/* ── Título do card vem do Lead ──────────────────────────────────────────── */

/**
 * Mesma precedência que `POST /api/deals` aplica: título informado (se não for
 * vazio), senão a empresa do lead, senão o nome do executivo.
 *
 * Existe porque a rota quebrava com 500 quando o corpo vinha sem `title` —
 * `Deal.title` é obrigatório no schema e nada derivava o valor no servidor. A
 * interface mandava certo; a API confiava nela.
 */
function tituloDoCard(
  informado: unknown,
  lead: { name: string; company: string | null },
): string {
  return String(informado ?? '').trim() || lead.company || lead.name
}

test('sem título informado, o card usa a empresa do lead', () => {
  assert.equal(tituloDoCard(undefined, { name: 'Ana', company: 'Acme' }), 'Acme')
  assert.equal(tituloDoCard(null, { name: 'Ana', company: 'Acme' }), 'Acme')
})

test('lead sem empresa cai no nome do executivo', () => {
  assert.equal(tituloDoCard(undefined, { name: 'Ana', company: null }), 'Ana')
})

test('título em branco não vira o título do card', () => {
  assert.equal(tituloDoCard('   ', { name: 'Ana', company: 'Acme' }), 'Acme')
  assert.equal(tituloDoCard('', { name: 'Ana', company: 'Acme' }), 'Acme')
})

test('título informado de verdade é respeitado', () => {
  assert.equal(tituloDoCard('Renovação 2027', { name: 'Ana', company: 'Acme' }), 'Renovação 2027')
})

test('o título nunca sai vazio — Deal.title é obrigatório no schema', () => {
  for (const informado of [undefined, null, '', '   ']) {
    for (const lead of [{ name: 'Ana', company: 'Acme' }, { name: 'Ana', company: null }]) {
      assert.ok(tituloDoCard(informado, lead).length > 0)
    }
  }
})
