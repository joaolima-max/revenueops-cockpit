/**
 * O RELÓGIO COMPARTILHADO — o timer, o desvio e o instantâneo.
 *
 * ── POR QUE ESTES TESTES EXISTEM ─────────────────────────────────────────
 *
 * Esta é a parte da projeção que não é matemática: é infraestrutura. Os três
 * defeitos possíveis são silenciosos e nenhum aparece em `tsc` ou no build:
 *
 *   - um timer que não é limpo VAZA a cada navegação entre Home e Conselho;
 *   - um timer por consumidor multiplica as re-renderizações por dez;
 *   - um instantâneo que muda a cada leitura faz o React renderizar em laço.
 *
 * Por isso a store vive fora do componente — em módulo, sem React — e por isso
 * dá para prendê-la sem navegador.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  INTERVALO_MS, assinar, assinantes, temTimer, medirDesvio, desvioAtual,
  segundoCorrente, semCliente, reiniciarRelogio,
} from '../lib/relogio-ciclo'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const semComentarios = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

test('o passo e de UM segundo', () => {
  // Nem curto demais (renderização por renderização), nem longo o bastante
  // para o número parecer travado.
  assert.equal(INTERVALO_MS, 1000)
})

test('UM intervalo para N assinantes', () => {
  reiniciarRelogio()
  assert.equal(temTimer(), false)
  assert.equal(assinantes(), 0)

  const cancelar = [assinar(() => {}), assinar(() => {}), assinar(() => {})]
  assert.equal(assinantes(), 3)
  assert.equal(temTimer(), true, 'o intervalo não foi armado')

  // Dez números na tela continuam sendo um intervalo só.
  const mais = Array.from({ length: 7 }, () => assinar(() => {}))
  assert.equal(assinantes(), 10)
  assert.equal(temTimer(), true)

  for (const c of [...cancelar, ...mais]) c()
  reiniciarRelogio()
})

test('o intervalo e APAGADO quando sai o ULTIMO assinante', () => {
  /**
   * O vazamento clássico: navegar Home → Conselho → Home deixaria um timer por
   * visita, cada um acordando a cada segundo para sempre.
   */
  reiniciarRelogio()
  const a = assinar(() => {})
  const b = assinar(() => {})
  assert.equal(temTimer(), true)

  a()
  assert.equal(assinantes(), 1)
  assert.equal(temTimer(), true, 'o timer morreu com um assinante ainda vivo')

  b()
  assert.equal(assinantes(), 0)
  assert.equal(temTimer(), false, 'o timer sobreviveu ao último assinante')
})

test('assinar e cancelar MIL vezes nao acumula timer nem ouvinte', () => {
  // A simulação de navegar entre as duas telas até cansar.
  reiniciarRelogio()
  for (let i = 0; i < 1000; i++) {
    const c = assinar(() => {})
    c()
  }
  assert.equal(assinantes(), 0)
  assert.equal(temTimer(), false)
})

test('o cancelamento e IDEMPOTENTE — chamar duas vezes nao quebra', () => {
  // O React pode chamar o cancelamento mais de uma vez em modo estrito.
  reiniciarRelogio()
  const a = assinar(() => {})
  const b = assinar(() => {})
  a(); a(); a()
  assert.equal(assinantes(), 1)
  assert.equal(temTimer(), true)
  b(); b()
  assert.equal(assinantes(), 0)
  assert.equal(temTimer(), false)
})

test('o aviso CHEGA a todos os assinantes, no mesmo tick', async () => {
  reiniciarRelogio()
  const recebidos: string[] = []
  const c1 = assinar(() => recebidos.push('a'))
  const c2 = assinar(() => recebidos.push('b'))

  await new Promise((r) => setTimeout(r, INTERVALO_MS + 250))

  assert.ok(recebidos.includes('a'), 'o primeiro assinante não foi avisado')
  assert.ok(recebidos.includes('b'), 'o segundo assinante não foi avisado')
  // Mesmo tick: os dois avisos vêm em sequência, sem um tick entre eles.
  assert.equal(recebidos.indexOf('b'), recebidos.indexOf('a') + 1)

  c1(); c2(); reiniciarRelogio()
})

test('o instantaneo e ESTAVEL dentro do mesmo segundo', () => {
  /**
   * `useSyncExternalStore` compara o instantâneo com o anterior. Um valor novo
   * a cada leitura seria lido como "mudou" e renderizaria sem parar — o laço
   * infinito clássico.
   */
  reiniciarRelogio()
  const a = segundoCorrente()
  for (let i = 0; i < 10_000; i++) {
    const v = segundoCorrente()
    // Pode ter virado o segundo durante o laço; o que não pode é variar
    // dentro do mesmo segundo.
    assert.ok(v === a || v === a + 1, `instantâneo instável: ${a} -> ${v}`)
  }
})

test('o instantaneo AVANCA a cada segundo', async () => {
  reiniciarRelogio()
  const antes = segundoCorrente()
  await new Promise((r) => setTimeout(r, 1100))
  assert.ok(segundoCorrente() > antes, 'o instantâneo não avançou')
})

test('o DESVIO e medido UMA VEZ, e so a primeira medicao vale', () => {
  /**
   * Remedir a cada tick faria o desvio variar com a latência de cada medição,
   * e a curva tremeria.
   */
  reiniciarRelogio()
  assert.equal(desvioAtual(), 0)

  // Um servidor "adiantado" em uma hora.
  medirDesvio(new Date(Date.now() + 3_600_000).toISOString())
  const primeiro = desvioAtual()
  assert.ok(Math.abs(primeiro - 3_600_000) < 2_000, `desvio medido: ${primeiro}`)

  // Uma segunda medição, com outro valor, NÃO sobrescreve.
  medirDesvio(new Date(Date.now() - 7_200_000).toISOString())
  assert.equal(desvioAtual(), primeiro, 'o desvio foi remedido')

  reiniciarRelogio()
})

test('o DESVIO corrige um relogio local errado', () => {
  /**
   * "O servidor e o navegador possuem horários diferentes."
   *
   * Com o relógio local três horas atrasado, o segundo corrente tem de ser o
   * do SERVIDOR — senão dois usuários veriam pontos diferentes da curva.
   */
  reiniciarRelogio()
  const instanteServidor = Date.now() + 3 * 3_600_000
  medirDesvio(new Date(instanteServidor).toISOString())

  const lido = segundoCorrente() * 1000
  assert.ok(
    Math.abs(lido - instanteServidor) < 2_000,
    `o relógio corrigido deu ${new Date(lido).toISOString()}`,
  )
  reiniciarRelogio()
})

test('um `agoraServidor` INVALIDO nao estraga o relogio', () => {
  // Payload corrompido não pode zerar a projeção nem jogar o número para 1970.
  reiniciarRelogio()
  medirDesvio('não é uma data')
  assert.equal(desvioAtual(), 0, 'uma data inválida mexeu no desvio')
  const agora = segundoCorrente() * 1000
  assert.ok(Math.abs(agora - Date.now()) < 2_000)
  reiniciarRelogio()
})

test('no SERVIDOR o instantaneo e `null`', () => {
  // É o que faz a primeira renderização usar o instante do servidor, que é o
  // que está no HTML — sem divergência de hidratação.
  assert.equal(semCliente(), null)
})

/* ========================================================================= *
 * O QUE O PROVEDOR NÃO PODE FAZER
 * ========================================================================= */

test('o provedor NAO cria timer proprio', () => {
  const sem = semComentarios(ler('components/projecao/ProjecaoProvider.tsx'))
  assert.ok(!sem.includes('setInterval'), 'o provedor voltou a criar o seu timer')
  assert.ok(!sem.includes('setTimeout'), 'o provedor passou a usar setTimeout')
  assert.ok(sem.includes('useSyncExternalStore'))
  assert.ok(sem.includes("from '@/lib/relogio-ciclo'"))
})

test('o provedor NAO assina quando nao ha incremento', () => {
  // Um intervalo rodando para multiplicar zero é só consumo de bateria.
  const sem = semComentarios(ler('components/projecao/ProjecaoProvider.tsx'))
  assert.ok(sem.includes('if (!ativo) return () => {}'))
})

test('o relogio NAO faz requisicao nem toca o banco', () => {
  const fonte = ler('lib/relogio-ciclo.ts')
  assert.ok(!fonte.includes('fetch('), 'o relógio passou a ir ao servidor')
  assert.ok(!fonte.includes('@/lib/prisma'))
  assert.ok(!fonte.includes('Math.random'))
})
