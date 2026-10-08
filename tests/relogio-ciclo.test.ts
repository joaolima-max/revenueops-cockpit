/**
 * O RELÓGIO COMPARTILHADO — o laço, o desvio e o instantâneo.
 *
 * ── POR QUE ESTES TESTES EXISTEM ─────────────────────────────────────────
 *
 * Esta é a parte da projeção que não é matemática: é infraestrutura. Os
 * defeitos possíveis são silenciosos e nenhum aparece em `tsc` ou no build:
 *
 *   - um laço que não é cancelado VAZA a cada navegação entre Home e Conselho;
 *   - um laço por consumidor multiplica as re-renderizações por dez;
 *   - um instantâneo que muda a cada leitura faz o React renderizar em laço;
 *   - uma amostragem grossa faz o número SALTAR inteiros — o defeito que esta
 *     rodada conserta.
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
  INTERVALO_FALLBACK_MS, assinar, assinantes, temTimer, medirDesvio,
  desvioAtual, instanteCorrente, semCliente, reiniciarRelogio,
} from '../lib/relogio-ciclo'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const semComentarios = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

test('o passo de retaguarda e de ~16 ms — a cadencia de 60 quadros', () => {
  /**
   * No navegador o laço é `requestAnimationFrame`. No servidor e nos testes
   * não existe rAF, e o laço cai para `setInterval` — com o MESMO passo, para
   * que o comportamento exercitado aqui seja o do navegador.
   *
   * Era 1000 ms, e é essa troca que conserta o salto: a 1 s o número avançava
   * +7 transações de uma vez; a 16 ms avança 0,117.
   */
  assert.equal(INTERVALO_FALLBACK_MS, 16)
})

test('UM laco para N assinantes', () => {
  reiniciarRelogio()
  assert.equal(temTimer(), false)
  assert.equal(assinantes(), 0)

  const cancelar = [assinar(() => {}), assinar(() => {}), assinar(() => {})]
  assert.equal(assinantes(), 3)
  assert.equal(temTimer(), true, 'o laço não foi armado')

  // Dez números na tela continuam sendo um laço só.
  const mais = Array.from({ length: 7 }, () => assinar(() => {}))
  assert.equal(assinantes(), 10)
  assert.equal(temTimer(), true)

  for (const c of [...cancelar, ...mais]) c()
  reiniciarRelogio()
})

test('o laco e CANCELADO quando sai o ULTIMO assinante', () => {
  /**
   * O vazamento clássico: navegar Home → Conselho → Home deixaria um laço por
   * visita, cada um acordando 60 vezes por segundo para sempre.
   */
  reiniciarRelogio()
  const a = assinar(() => {})
  const b = assinar(() => {})
  assert.equal(temTimer(), true)

  a()
  assert.equal(assinantes(), 1)
  assert.equal(temTimer(), true, 'o laço morreu com um assinante ainda vivo')

  b()
  assert.equal(assinantes(), 0)
  assert.equal(temTimer(), false, 'o laço sobreviveu ao último assinante')
})

test('assinar e cancelar MIL vezes nao acumula laco nem ouvinte', () => {
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

test('o aviso CHEGA a todos os assinantes, no mesmo quadro', async () => {
  reiniciarRelogio()
  const recebidos: string[] = []
  const c1 = assinar(() => recebidos.push('a'))
  const c2 = assinar(() => recebidos.push('b'))

  await new Promise((r) => setTimeout(r, INTERVALO_FALLBACK_MS * 4))

  assert.ok(recebidos.includes('a'), 'o primeiro assinante não foi avisado')
  assert.ok(recebidos.includes('b'), 'o segundo assinante não foi avisado')
  // Mesmo quadro: os dois avisos vêm em sequência, sem um quadro entre eles.
  assert.equal(recebidos.indexOf('b'), recebidos.indexOf('a') + 1)

  c1(); c2(); reiniciarRelogio()
})

/* ========================================================================= *
 * O INSTANTÂNEO — estável entre quadros, fino o bastante para não saltar
 * ========================================================================= */

test('o instantaneo e ESTAVEL entre dois quadros', () => {
  /**
   * `useSyncExternalStore` compara o instantâneo com o anterior. Um valor novo
   * a cada leitura seria lido como "mudou" e renderizaria sem parar — o laço
   * infinito clássico.
   *
   * SEM ASSINANTE o laço não está armado, então o carimbo não se move: dez mil
   * leituras devolvem exatamente o mesmo número.
   */
  reiniciarRelogio()
  const primeiro = instanteCorrente()
  for (let i = 0; i < 10_000; i++) {
    assert.equal(instanteCorrente(), primeiro, `instantâneo instável na leitura ${i}`)
  }
})

test('o instantaneo AVANCA a cada quadro, em MILISSEGUNDOS', async () => {
  reiniciarRelogio()
  const c = assinar(() => {})
  const antes = instanteCorrente()
  await new Promise((r) => setTimeout(r, INTERVALO_FALLBACK_MS * 5))
  const depois = instanteCorrente()

  assert.ok(depois > antes, 'o instantâneo não avançou')
  // E avança em MILISSEGUNDOS, não em segundos: o passo é menor que 1 s.
  assert.ok(depois - antes < 1000, `o passo foi de ${depois - antes} ms`)
  c(); reiniciarRelogio()
})

test('o instantaneo NAO e quantizado em segundos — a raiz do salto', () => {
  /**
   * A versão anterior devolvia `Math.floor(ms / 1000)`: um número que só muda
   * uma vez por segundo. Era isso que fazia a tela avançar de um salto o
   * crescimento de um segundo inteiro.
   */
  const fonte = semComentarios(ler('lib/relogio-ciclo.ts'))
  assert.ok(!fonte.includes('/ 1000'), 'o instantâneo voltou a ser quantizado em segundos')
  assert.ok(!fonte.includes('segundoCorrente'), 'o instantâneo em segundos voltou')
  assert.ok(fonte.includes('export function instanteCorrente(): number'))
  // E o valor é um instante de verdade, não um índice de segundo.
  reiniciarRelogio()
  assert.ok(instanteCorrente() > 1_700_000_000_000, 'o instantâneo não está em ms')
})

test('o laco prefere `requestAnimationFrame` e cai para `setInterval`', () => {
  /**
   * rAF é a cadência que o navegador já usa para pintar, e PARA sozinho quando
   * a aba fica oculta — um `setInterval(16)` continuaria acordando a aba de
   * fundo 60 vezes por segundo para recalcular algo que ninguém está vendo.
   */
  const fonte = semComentarios(ler('lib/relogio-ciclo.ts'))
  assert.ok(fonte.includes('requestAnimationFrame(passo)'))
  assert.ok(fonte.includes('cancelAnimationFrame'))
  assert.ok(fonte.includes('setInterval(avisarTodos, INTERVALO_FALLBACK_MS)'))
  // E a escolha é por disponibilidade, não por ambiente adivinhado.
  assert.ok(fonte.includes("typeof requestAnimationFrame === 'function'"))
})

/* ========================================================================= *
 * O DESVIO
 * ========================================================================= */

test('o DESVIO e medido UMA VEZ, e so a primeira medicao vale', () => {
  reiniciarRelogio()
  assert.equal(desvioAtual(), 0)

  medirDesvio(new Date(Date.now() + 3_600_000).toISOString())
  const primeiro = desvioAtual()
  assert.ok(Math.abs(primeiro - 3_600_000) < 2_000, `desvio medido: ${primeiro}`)

  // Uma segunda medição, com outro valor, NÃO sobrescreve.
  medirDesvio(new Date(Date.now() - 7_200_000).toISOString())
  assert.equal(desvioAtual(), primeiro, 'o desvio foi remedido')

  reiniciarRelogio()
})

test('o DESVIO corrige um relogio local errado, JA no primeiro instantaneo', () => {
  /**
   * "O servidor e o navegador possuem horários diferentes."
   *
   * E a correção tem de valer desde o PRIMEIRO instantâneo: se o carimbo
   * guardado antes da medição sobrevivesse, o primeiro quadro desenharia o
   * número do relógio local cru.
   */
  reiniciarRelogio()
  instanteCorrente()                       // carimba com o relógio local
  const instanteServidor = Date.now() + 3 * 3_600_000
  medirDesvio(new Date(instanteServidor).toISOString())

  assert.ok(
    Math.abs(instanteCorrente() - instanteServidor) < 2_000,
    `o primeiro instantâneo após a medição deu ${new Date(instanteCorrente()).toISOString()}`,
  )
  reiniciarRelogio()
})

test('um `agoraServidor` INVALIDO nao estraga o relogio', () => {
  reiniciarRelogio()
  medirDesvio('não é uma data')
  assert.equal(desvioAtual(), 0, 'uma data inválida mexeu no desvio')
  assert.ok(Math.abs(instanteCorrente() - Date.now()) < 2_000)
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

test('o provedor NAO cria laco proprio', () => {
  const sem = semComentarios(ler('components/projecao/ProjecaoProvider.tsx'))
  assert.ok(!sem.includes('setInterval'), 'o provedor voltou a criar o seu laço')
  assert.ok(!sem.includes('setTimeout'), 'o provedor passou a usar setTimeout')
  assert.ok(!sem.includes('requestAnimationFrame'), 'o provedor passou a agendar quadros')
  assert.ok(sem.includes('useSyncExternalStore'))
  assert.ok(sem.includes("from '@/lib/relogio-ciclo'"))
})

test('o provedor NAO assina quando nao ha incremento', () => {
  // 60 quadros por segundo para multiplicar zero é só consumo de bateria.
  const sem = semComentarios(ler('components/projecao/ProjecaoProvider.tsx'))
  assert.ok(sem.includes('if (!ativo) return () => {}'))
})

test('o relogio NAO faz requisicao nem toca o banco', () => {
  const fonte = ler('lib/relogio-ciclo.ts')
  assert.ok(!fonte.includes('fetch('), 'o relógio passou a ir ao servidor')
  assert.ok(!fonte.includes('@/lib/prisma'))
  assert.ok(!fonte.includes('Math.random'))
})
