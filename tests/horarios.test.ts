/**
 * HORÁRIOS GLOBAIS DA TOPBAR.
 *
 * O que estes testes protegem é a decisão de NÃO fixar offsets: cada praça é
 * formatada com o `timeZone` real da IANA, então horário de verão e mudanças
 * de fuso são resolvidos pelo runtime. Um offset numérico gravado no código
 * estaria errado duas vezes por ano em Madri e em Nova York.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRACAS } from '../components/dashboard/RelogiosGlobais'

test('as quatro praças da especificação, com os fusos reais da IANA', () => {
  assert.deepEqual(
    PRACAS.map((p) => [p.regiao, p.cidade, p.tz]),
    [
      ['LATAM', 'São Paulo', 'America/Sao_Paulo'],
      ['AMÉRICA', 'New York', 'America/New_York'],
      ['ÁSIA', 'Hong Kong', 'Asia/Hong_Kong'],
      ['EUROPA', 'Madrid', 'Europe/Madrid'],
    ],
  )
})

test('todo fuso é aceito pelo Intl — nenhum nome inventado', () => {
  for (const p of PRACAS) {
    assert.doesNotThrow(
      () => new Intl.DateTimeFormat('pt-BR', { timeZone: p.tz }),
      `fuso inválido: ${p.tz}`,
    )
  }
})

test('cada praça rende um horário no formato HH:MM', () => {
  const instante = new Date('2026-07-15T12:00:00Z')
  for (const p of PRACAS) {
    const hora = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: p.tz,
    }).format(instante)
    assert.match(hora, /^\d{2}:\d{2}$/, `${p.cidade} devolveu "${hora}"`)
  }
})

test('os fusos de fato divergem entre si no mesmo instante', () => {
  // Se dois deles coincidissem sempre, algum estaria apontando para o lugar
  // errado. Hong Kong e São Paulo nunca estão na mesma hora.
  const instante = new Date('2026-07-15T12:00:00Z')
  const horas = PRACAS.map((p) =>
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: p.tz })
      .format(instante),
  )
  assert.equal(new Set(horas).size, 4, `horas repetidas: ${horas.join(', ')}`)
})

test('o horário de verão é resolvido pelo runtime, não por offset fixo', () => {
  // Nova York em janeiro (EST, UTC-5) e em julho (EDT, UTC-4) às 12:00 UTC.
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', hour12: false, timeZone: 'America/New_York',
  })
  const inverno = fmt.format(new Date('2026-01-15T12:00:00Z'))
  const verao = fmt.format(new Date('2026-07-15T12:00:00Z'))
  assert.notEqual(inverno, verao, 'o offset de Nova York muda entre as estações')
})

test('a sigla compacta do mobile é curta e única', () => {
  const siglas = PRACAS.map((p) => p.curto)
  assert.equal(new Set(siglas).size, PRACAS.length, 'siglas repetidas confundem no mobile')
  for (const s of siglas) assert.ok(s.length <= 3, `sigla longa demais: ${s}`)
})
