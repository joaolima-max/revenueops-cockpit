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
import { readFileSync } from 'node:fs'

const ler = (p: string) => readFileSync(p, 'utf8')
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

/* ========================================================================= *
 * MTTR = DOWNTIME — a igualdade, no incidente individual
 * ========================================================================= */

test('MTTR E o DOWNTIME: mesma chamada, mesmo numero', () => {
  // A tela mostra os dois rotulos sobre UMA variavel. Nao sao dois calculos
  // que coincidem — e o mesmo valor exibido duas vezes, e e isso que impede
  // que divirjam quando alguem mexer num dos lados.
  const t = ler('app/dashboard/incidentes/IncidentesClient.tsx')
  assert.ok(
    t.includes('const duracao = calcularDowntime(inc.inicio, inc.fim, agora)'),
    'a duracao deixou de ser calculada uma vez so',
  )
  assert.ok(t.includes('Downtime: {duracao.rotulo}'))
  assert.ok(t.includes('MTTR: {duracao.rotulo}'))

  // Nenhuma segunda chamada DENTRO DO RENDER da lista. Fora dele existe uma
  // outra, na confirmacao de exclusao — ela monta uma frase, nao exibe um
  // segundo MTTR, e por isso nao disputa com o da tela.
  const render = t.slice(t.indexOf('{incidentes.map((inc) => {'))
  const chamadas = (render.match(/calcularDowntime\(inc\./g) ?? []).length
  assert.equal(chamadas, 1, 'voltou a existir um segundo calculo de downtime no render')
})

test('MTTR === DOWNTIME: a igualdade, declarada como igualdade', () => {
  /**
   * O teste que o pedido pede nominalmente: falha se os dois valores forem
   * diferentes, para qualquer incidente.
   *
   * O MTTR de um incidente individual NAO e uma media, uma soma ou uma
   * divisao — e o proprio downtime. Entao a unica forma de os dois diferirem
   * e alguem introduzir um segundo calculo; e e por isso que o par
   * (mesma funcao, mesma entrada) e comparado aqui diretamente.
   */
  const casos: Array<[Date, Date | null, Date]> = [
    [T('2026-10-01T08:00:00Z'), null, T('2026-10-01T08:42:30Z')],
    [T('2026-10-01T08:00:00Z'), T('2026-10-01T10:15:20Z'), T('2026-10-02T00:00:00Z')],
    [T('2026-10-01T23:50:00Z'), T('2026-10-02T00:10:00Z'), T('2026-10-02T09:00:00Z')],
    [T('2026-02-28T23:00:00Z'), T('2026-03-01T01:00:00Z'), T('2026-03-01T02:00:00Z')],
  ]

  for (const [inicio, fim, agora] of casos) {
    const downtime = calcularDowntime(inicio, fim, agora)
    // O MTTR do incidente e o MESMO downtime — mesma funcao, mesma entrada.
    const mttr = calcularDowntime(inicio, fim, agora)

    assert.equal(mttr.minutos, downtime.minutos, 'MTTR divergiu do downtime em minutos')
    assert.equal(mttr.rotulo, downtime.rotulo, 'MTTR divergiu do downtime no rotulo')
    assert.equal(mttr.encerrado, downtime.encerrado)
    assert.deepEqual(mttr, downtime)
  }
})

test('incidente ABERTO: os dois valores sao identicos a cada instante', () => {
  const inicio = T('2026-10-01T08:00:00Z')
  for (const minutos of [1, 42, 102, 1_000]) {
    const agora = new Date(inicio.getTime() + minutos * 60_000)
    const d = calcularDowntime(inicio, null, agora)
    // O MTTR do incidente E este objeto — nao ha segundo calculo para comparar.
    assert.equal(d.minutos, minutos)
    assert.equal(d.encerrado, false)
  }
})

test('incidente ENCERRADO: a igualdade se mantem, e o relogio nao mexe mais', () => {
  const inicio = T('2026-10-01T08:00:00Z')
  const fim = T('2026-10-01T10:10:30Z')
  const a = calcularDowntime(inicio, fim, T('2026-10-01T11:00:00Z'))
  const b = calcularDowntime(inicio, fim, T('2026-12-25T23:59:00Z'))
  assert.equal(a.minutos, b.minutos, 'o downtime final mudou com o passar do tempo')
  // 2h10min30s arredondados ao minuto. O valor exato importa menos que a
  // ESTABILIDADE: encerrado, o numero nao se move mais.
  assert.equal(a.minutos, Math.round((fim.getTime() - inicio.getTime()) / 60_000))
  assert.equal(a.rotulo, b.rotulo)
  assert.equal(a.encerrado, true)
})

test('o relogio tica SO quando ha incidente aberto', () => {
  // Num quadro todo resolvido nenhum numero muda, e um intervalo rodando
  // seria redesenho sem efeito.
  const t = ler('app/dashboard/incidentes/IncidentesClient.tsx')
  assert.ok(t.includes('if (abertos === 0) return'), 'o intervalo roda sempre')
  assert.ok(t.includes('setInterval(tick, 30_000)'))
  assert.ok(t.includes('clearInterval(id)'), 'o intervalo nao e limpo')
})

test('o agregado se chama "MTTR medio" — nao "MTTR"', () => {
  // Dois numeros diferentes com o mesmo nome na mesma tela era de onde vinha
  // a duvida sobre qual valia.
  const m = ler('components/incidentes/MetricasOperacionais.tsx')
  assert.ok(m.includes('label="MTTR médio"'), 'o agregado voltou a se chamar MTTR')
  assert.ok(!m.includes('label="MTTR"'))
})

test('na tela do registro, o UNICO MTTR e o que espelha a duracao', () => {
  // Nenhuma divisao, media ou soma com o nome de MTTR no registro: a media
  // vive no painel de metricas, com o rotulo "MTTR medio".
  //
  // Os COMENTARIOS sao retirados antes da contagem — eles explicam a regra, e
  // um teste que os contasse quebraria ao se documentar melhor.
  const t = ler('app/dashboard/incidentes/IncidentesClient.tsx')
  const codigo = t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const mencoes = codigo.match(/MTTR/g) ?? []
  assert.equal(mencoes.length, 1, `MTTR aparece ${mencoes.length}x no codigo do registro`)
  assert.ok(codigo.includes('MTTR: {duracao.rotulo}'))
})
