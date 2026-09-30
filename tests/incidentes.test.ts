/**
 * INCIDENTES — downtime derivado e alçada de administração.
 *
 * O que estes testes protegem: o downtime deixou de ser um campo digitado e
 * passou a ser (fim − início). Se alguém reintroduzir a coluna informada, os
 * dois números voltam a poder discordar — e é isso que se está impedindo.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calcularDowntime, formatarDuracao, validarJanela,
  podeAdministrarIncidente, podeRegistrarIncidente, CRITICIDADES,
} from '../lib/incidentes'

const T = (iso: string) => new Date(iso)

/* ── Downtime derivado ───────────────────────────────────────────────────── */

test('downtime de incidente encerrado é fim menos início', () => {
  const d = calcularDowntime(T('2026-09-30T10:00:00Z'), T('2026-09-30T12:30:00Z'))
  assert.equal(d.minutos, 150)
  assert.equal(d.encerrado, true)
  assert.equal(d.rotulo, '2h 30min')
})

test('incidente aberto conta até agora e se declara em andamento', () => {
  const agora = T('2026-09-30T11:00:00Z')
  const d = calcularDowntime(T('2026-09-30T10:15:00Z'), null, agora)
  assert.equal(d.minutos, 45)
  assert.equal(d.encerrado, false)
  assert.equal(d.rotulo, 'em andamento · 45min')
})

test('o mesmo par início/fim dá o mesmo downtime em qualquer tela', () => {
  // A garantia de fonte única: a função não tem estado nem lê nada externo.
  const a = calcularDowntime('2026-09-01T08:00:00Z', '2026-09-01T09:05:00Z')
  const b = calcularDowntime(T('2026-09-01T08:00:00Z'), T('2026-09-01T09:05:00Z'))
  assert.equal(a.minutos, b.minutos)
  assert.equal(a.rotulo, b.rotulo)
})

test('início e fim iguais não é erro: é downtime zero', () => {
  const d = calcularDowntime(T('2026-09-30T10:00:00Z'), T('2026-09-30T10:00:00Z'))
  assert.equal(d.minutos, 0)
  assert.equal(d.rotulo, 'menos de 1min')
})

test('fim anterior ao início não produz downtime negativo', () => {
  const d = calcularDowntime(T('2026-09-30T12:00:00Z'), T('2026-09-30T10:00:00Z'))
  assert.equal(d.minutos, 0)
})

test('data inválida devolve travessão, não NaN na tela', () => {
  const d = calcularDowntime('não é data', null)
  assert.equal(d.minutos, 0)
  assert.equal(d.rotulo, '—')
})

test('downtime longo usa dias e horas', () => {
  const d = calcularDowntime(T('2026-09-01T00:00:00Z'), T('2026-09-03T05:00:00Z'))
  assert.equal(d.minutos, 3180)
  assert.equal(d.rotulo, '2d 5h')
})

/* ── Formatação de duração ───────────────────────────────────────────────── */

test('formatarDuracao cobre minutos, horas e dias', () => {
  assert.equal(formatarDuracao(0), 'menos de 1min')
  assert.equal(formatarDuracao(45), '45min')
  assert.equal(formatarDuracao(60), '1h')
  assert.equal(formatarDuracao(135), '2h 15min')
  assert.equal(formatarDuracao(1440), '1d')
  assert.equal(formatarDuracao(1500), '1d 1h')
})

/* ── Validação da janela ─────────────────────────────────────────────────── */

test('janela sem fim é válida — incidente em aberto', () => {
  assert.equal(validarJanela(T('2026-09-30T10:00:00Z'), null), null)
})

test('encerramento antes do início é recusado', () => {
  const msg = validarJanela(T('2026-09-30T12:00:00Z'), T('2026-09-30T10:00:00Z'))
  assert.equal(msg, 'O encerramento não pode ser anterior ao início.')
})

test('encerramento igual ao início é aceito', () => {
  assert.equal(validarJanela(T('2026-09-30T10:00:00Z'), T('2026-09-30T10:00:00Z')), null)
})

test('datas inválidas são recusadas com mensagem própria', () => {
  assert.equal(validarJanela(new Date('x'), null), 'Data de início inválida.')
  assert.equal(validarJanela(T('2026-09-30T10:00:00Z'), new Date('x')), 'Data de encerramento inválida.')
})

/* ── Alçada ──────────────────────────────────────────────────────────────── */

test('editar e excluir incidente é só de ADMIN', () => {
  assert.equal(podeAdministrarIncidente('ADMIN'), true)
  for (const role of ['GESTOR', 'OPERACIONAL', 'COMERCIAL', '']) {
    assert.equal(podeAdministrarIncidente(role), false, `${role} não deveria administrar`)
  }
})

test('registrar e fechar é de quem opera; COMERCIAL fica fora', () => {
  for (const role of ['ADMIN', 'GESTOR', 'OPERACIONAL']) {
    assert.equal(podeRegistrarIncidente(role), true, `${role} deveria registrar`)
  }
  assert.equal(podeRegistrarIncidente('COMERCIAL'), false)
})

test('a escala de criticidade é a do sistema, com quatro níveis', () => {
  assert.deepEqual([...CRITICIDADES], ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'])
})
