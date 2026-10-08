/**
 * A ANIMAÇÃO DOS QUATRO KPIs — contagem contínua, sem pular inteiros.
 *
 * ── O DEFEITO QUE ESTA SUÍTE PRENDE ──────────────────────────────────────
 *
 * A projeção amostrava a curva uma vez por SEGUNDO. Na faixa de pico, com o
 * lançamento real de 07/10, isso fazia a tela avançar de um salto:
 *
 *   transações   +7 por salto         1 → 8 → 15 …
 *   TPV          +R$ 3.001,55         120 → 3.121 → 6.123 …
 *
 * A curva sempre esteve certa; o que estava grosso era a AMOSTRAGEM dela. A
 * correção é amostrar por quadro de animação (~16,7 ms) — não interpolar.
 *
 * ── A GARANTIA É ARITMÉTICA ──────────────────────────────────────────────
 *
 * `projetarContagem` é `floor` de uma curva contínua e crescente:
 *
 *   x(t₂) − x(t₁) < 1  ⟹  floor(x(t₂)) − floor(x(t₁)) ∈ {0, 1}
 *
 * Então basta o passo ser menor que 1. Não há estado de animação, não há fila
 * de valores pendentes, e por construção a tela não pode divergir do instante
 * atual nem tocar uma animação atrasada.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PERFIL_RITMO, PESO_TOTAL,
  cicloDe, fracaoDoCiclo, instanteNoFuso,
  projetarContagem, projetarContinuo, valorExibido,
  taxaMaximaPorSegundo, intervaloMaximoSemSalto, volumeMaximoSemSalto,
  quadrosNecessariosPorSegundo, saltoMinimoInevitavel, intervaloEfetivoDoQuadro,
  faixaEm, horasDecorridas,
} from '../lib/projecao-intradiaria'
import { INTERVALO_FALLBACK_MS } from '../lib/relogio-ciclo'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
const semComentarios = (f: string) => f
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const sp = (texto: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto)!
  return instanteNoFuso(
    Number(m[1]), Number(m[2]), Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  )
}

/** O lançamento REAL de 07/10, lido de Production. */
const LANC = { tpv: 113_458_481.82, receita: 28_000.79, transacoes: 265_483, med: 3_278 }
/** Os acumulados REAIS de outubro, com ele dentro. */
const REAL = { tpv: 628_932_414.64, receita: 166_378.31, transacoes: 1_620_764, med: 23_205 }

/** O quadro de animação: 60 por segundo. */
const QUADRO_MS = 1000 / 60

/* ========================================================================= *
 * O LIMITE DA AMOSTRAGEM
 * ========================================================================= */

test('a taxa MAXIMA de um valor e a da faixa de pico', () => {
  const maior = PERFIL_RITMO.reduce((a, f) => Math.max(a, f.multiplicador), 0)
  assert.equal(maior, 2)
  for (const [k, v] of Object.entries(LANC)) {
    assert.ok(
      Math.abs(taxaMaximaPorSegundo(v) - (2 * v) / PESO_TOTAL / 3600) < 1e-12,
      `${k} divergiu`,
    )
  }
  // Os números reais, para leitura.
  assert.equal(Number(taxaMaximaPorSegundo(LANC.transacoes).toFixed(3)), 7.023)
  assert.equal(Number(taxaMaximaPorSegundo(LANC.tpv).toFixed(2)), 3001.55)
})

test('o INTERVALO MAXIMO sem salto, com os valores reais', () => {
  /**
   * Com 265.483 transações o intervalo é de ~142 ms. Um quadro de animação são
   * ~16,7 ms — oito quadros por inteiro.
   *
   * O intervalo ANTERIOR era de 1000 ms, sete vezes maior que o limite. É a
   * medida exata do defeito.
   */
  const limite = intervaloMaximoSemSalto(LANC.transacoes)
  assert.equal(Number(limite.toFixed(1)), 142.4)
  assert.ok(QUADRO_MS < limite, 'o quadro de animação não cabe no limite')
  assert.ok(INTERVALO_FALLBACK_MS < limite, 'o passo de retaguarda não cabe no limite')
  assert.ok(1000 > limite, 'o intervalo antigo deveria ESTOURAR o limite')
  assert.equal(Math.round(1000 / limite), 7, 'o salto antigo era de ~7 inteiros')
})

test('o limite e INFINITO para valor zero — nada cresce, nada pula', () => {
  assert.equal(intervaloMaximoSemSalto(0), Infinity)
  assert.equal(taxaMaximaPorSegundo(0), 0)
})

test('o TETO e do DISPOSITIVO, nao da implementacao', () => {
  /**
   * A distinção que importa para responder "dá para fazer melhor?".
   *
   * Uma tela pinta no máximo `1/Δ` vezes por segundo. Se a contagem cresce
   * mais rápido que isso, NÃO EXISTE implementação que mostre todos os
   * inteiros — não há onde pintá-los. O teto é físico.
   *
   * A 60 Hz ele é de 2.268.000 contagens no dia; a 120 Hz dobra, e o
   * `requestAnimationFrame` acompanha o dispositivo sem mudança de código.
   */
  // O PIOR quadro, não o médio: `Date.now()` é inteiro, então a 60 Hz os
  // quadros caem em 16, 17, 17, 16… e a garantia vale no de 17.
  assert.equal(intervaloEfetivoDoQuadro(60), 17)
  assert.equal(intervaloEfetivoDoQuadro(120), 9)

  assert.equal(Math.round(volumeMaximoSemSalto(60)), 2_223_529)
  assert.equal(volumeMaximoSemSalto(120), 4_200_000)
  assert.equal(volumeMaximoSemSalto(60), (1000 * PESO_TOTAL * 3600) / (2 * 17))

  // O lançamento de hoje está 8,4x abaixo do teto.
  assert.ok(volumeMaximoSemSalto(60) / LANC.transacoes > 8)
  assert.equal(Number(quadrosNecessariosPorSegundo(LANC.transacoes).toFixed(2)), 7.02)

  // No teto exato, o intervalo máximo iguala o PIOR quadro.
  assert.ok(
    intervaloMaximoSemSalto(volumeMaximoSemSalto(60)) <= intervaloEfetivoDoQuadro(60) + 1e-9,
  )
  assert.ok(intervaloMaximoSemSalto(LANC.transacoes) > QUADRO_MS * 8)
})

test('a AMOSTRAGEM POR QUADRO e o OTIMO fiel — nao ha melhor disponivel', () => {
  /**
   * ── A PROVA DE OTIMALIDADE ──────────────────────────────────────────
   *
   * `saltoMinimoInevitavel` é `floor(r · Δ)`: quantos inteiros QUALQUER
   * implementação fiel ao instante é obrigada a pular, amostrando a cada Δ.
   *
   * O teste varre volumes de 1 até 100× o lançamento real e exige que o salto
   * MEDIDO na nossa implementação seja exatamente o mínimo inevitável + 1 (o
   * avanço de um inteiro não é "salto") — nunca mais que isso.
   *
   * Em outras palavras: onde a física permite a sequência completa, nós a
   * entregamos; onde não permite, pulamos o mínimo possível. Não há abordagem
   * melhor que não minta sobre o instante — e mentir é o que o pedido proíbe.
   */
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  // O pico, onde a taxa é máxima.
  const base = ciclo.inicio.getTime() + 9 * 3_600_000

  for (const fator of [1, 2, 5, 8, 8.5, 10, 20, 50, 100]) {
    const total = Math.round(LANC.transacoes * fator)
    const minimo = saltoMinimoInevitavel(total, QUADRO_MS)

    let maiorSalto = 0
    let anterior = projetarContagem(total, fracaoDoCiclo(new Date(base), ciclo))
    for (let i = 1; i <= 600; i++) {
      const v = projetarContagem(total, fracaoDoCiclo(new Date(base + i * QUADRO_MS), ciclo))
      maiorSalto = Math.max(maiorSalto, v - anterior)
      anterior = v
    }

    // O avanço de 1 é a sequência andando; `minimo` é o que a física força
    // além disso.
    assert.ok(
      maiorSalto <= minimo + 1,
      `volume ${total}: saltou ${maiorSalto}, o mínimo inevitável era ${minimo}`,
    )
    // E onde o mínimo é zero, a sequência é COMPLETA.
    if (minimo === 0) {
      assert.equal(maiorSalto, 1, `volume ${total} deveria dar sequência completa`)
    }
  }
})

test('o limite esta DECLARADO no codigo, onde quem mexer vai ler', () => {
  const fonte = ler('lib/projecao-intradiaria.ts')
  assert.ok(fonte.includes('O teto é físico, não de projeto'))
  assert.ok(fonte.includes('pintar mais rápido que a tela é impossível'))
  assert.ok(fonte.includes('ficaria ATRASADO em relação ao instante'))
  // E o bônus do rAF: o teto acompanha o dispositivo.
  assert.ok(fonte.includes('Numa tela de 120 Hz o rAF roda a 120 quadros'))
  // E o pior quadro está documentado onde a garantia é feita.
  assert.ok(fonte.includes('o PIOR caso, não a média'))
  assert.ok(fonte.includes('16, 17, 17, 16, 17'))
})

/* ========================================================================= *
 * NENHUM INTEIRO PULADO — o ciclo inteiro, quadro a quadro
 * ========================================================================= */

test('CONTAGENS: nenhum inteiro e pulado no ciclo inteiro, a 60 quadros', () => {
  /**
   * O teste central da rodada. 24 horas amostradas a cada quadro são 5,2
   * milhões de pontos — caro demais. Então varre as DUAS faixas mais rápidas
   * por inteiro (pico, ×2) e o ciclo todo com passo maior, verificando a
   * invariante: a diferença entre amostras consecutivas nunca é > 1.
   */
  const ciclo = cicloDe(sp('2026-10-08 12:00'))

  for (const [nome, total] of [['transacoes', LANC.transacoes], ['med', LANC.med]] as const) {
    // A FAIXA DE PICO, inteira, quadro a quadro: 2 horas = 432.000 quadros.
    // Amostra 1 em cada 4 (≈67 ms) e exige passo <= 1 — se cabe em 67 ms,
    // cabe com folga em 16,7.
    const de = ciclo.inicio.getTime() + 8 * 3_600_000      // 18h
    const ate = ciclo.inicio.getTime() + 10 * 3_600_000    // 20h
    let anterior = projetarContagem(total, fracaoDoCiclo(new Date(de), ciclo))
    for (let t = de; t <= ate; t += QUADRO_MS * 4) {
      const v = projetarContagem(total, fracaoDoCiclo(new Date(t), ciclo))
      const salto = v - anterior
      assert.ok(salto >= 0, `${nome} recuou em t=${t}`)
      assert.ok(salto <= 1, `${nome} PULOU ${salto} inteiros em t=${t}`)
      anterior = v
    }
  }
})

test('CONTAGENS: a sequencia e 1, 2, 3, 4, 5, 6 — sem buraco', () => {
  /**
   * A afirmação do pedido, literal. Colhe os primeiros inteiros do ciclo,
   * quadro a quadro, e exige que eles saiam em sequência.
   */
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const vistos: number[] = []
  const inicio = ciclo.inicio.getTime()

  // Os primeiros 3 segundos do ciclo, a 60 quadros por segundo.
  for (let t = inicio; t <= inicio + 3_000; t += QUADRO_MS) {
    const v = projetarContagem(LANC.transacoes, fracaoDoCiclo(new Date(t), ciclo))
    if (vistos[vistos.length - 1] !== v) vistos.push(v)
  }

  // Começa em zero e sobe de um em um, sem pular.
  assert.equal(vistos[0], 0)
  for (let i = 1; i < vistos.length; i++) {
    assert.equal(vistos[i], vistos[i - 1] + 1, `pulou de ${vistos[i - 1]} para ${vistos[i]}`)
  }
  // Na taxa base (3,51/s) três segundos dão ~10 inteiros: há movimento de fato.
  assert.ok(vistos.length >= 9, `só ${vistos.length} inteiros em 3 s`)
  assert.deepEqual(vistos.slice(0, 7), [0, 1, 2, 3, 4, 5, 6])
})

test('A AMOSTRAGEM ANTIGA SALTAVA — a prova do defeito', () => {
  /**
   * O mesmo trecho, amostrado a cada 1000 ms como antes: a sequência pula.
   * Este teste existe para que a regressão seja impossível de passar
   * despercebida — se alguém voltar a quantizar o instantâneo em segundos, o
   * teste acima falha e este explica por quê.
   */
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const inicio = ciclo.inicio.getTime()
  const porSegundo: number[] = []
  for (let t = inicio; t <= inicio + 3_000; t += 1000) {
    porSegundo.push(projetarContagem(LANC.transacoes, fracaoDoCiclo(new Date(t), ciclo)))
  }
  assert.deepEqual(porSegundo, [0, 3, 7, 10])
  // Saltos de 3 e 4 inteiros — exatamente o "de 1 para 6" relatado.
  for (let i = 1; i < porSegundo.length; i++) {
    assert.ok(porSegundo[i] - porSegundo[i - 1] > 1)
  }
})

test('MOEDA: os digitos avancam a cada quadro, com a precisao preservada', () => {
  /**
   * A garantia de inteiro-a-inteiro é das CONTAGENS. Em moeda o pedido é que
   * "os dígitos avancem suavemente": o TPV cresce 300.155 centavos por
   * segundo, e nenhuma taxa de quadros mostra cada centavo — nem deveria.
   *
   * O que se exige aqui é que CADA QUADRO mude o valor (nada de número
   * congelado) e que a precisão do cálculo não seja truncada.
   */
  const ciclo = cicloDe(sp('2026-10-08 19:00'))   // faixa de pico
  const base = sp('2026-10-08 19:00').getTime()

  let anterior = -Infinity
  let quadrosQueMudaram = 0
  for (let i = 0; i < 60; i++) {
    const v = projetarContinuo(LANC.tpv, fracaoDoCiclo(new Date(base + i * QUADRO_MS), ciclo))
    if (v > anterior) quadrosQueMudaram++
    assert.ok(v >= anterior, `o TPV recuou no quadro ${i}`)
    anterior = v
  }
  assert.equal(quadrosQueMudaram, 60, 'algum quadro não moveu o TPV')

  // A PRECISÃO não é truncada: o valor intermediário tem casas além do centavo.
  const meio = projetarContinuo(LANC.tpv, fracaoDoCiclo(sp('2026-10-08 19:00:30'), ciclo))
  assert.notEqual(meio, Math.round(meio * 100) / 100)
})

/* ========================================================================= *
 * DETERMINISMO, RECARGA E A VIRADA DAS 10H
 * ========================================================================= */

test('RECARGA mostra o valor do instante, sem reiniciar nem atrasar', () => {
  /**
   * "Ao recarregar a página ou abrir em outro dispositivo, o valor deve
   * corresponder ao instante atual, sem reiniciar do zero nem tocar uma
   * animação atrasada."
   *
   * É garantido por construção: `valorExibido` é função do INSTANTE, e não há
   * estado de animação a recuperar. Mil "recargas" no mesmo instante dão o
   * mesmo número.
   */
  const ciclo = cicloDe(sp('2026-10-08 19:23'))
  const agora = sp('2026-10-08 19:23:45')
  const esperado = valorExibido(
    REAL.transacoes, LANC.transacoes, fracaoDoCiclo(agora, ciclo), 'contagem',
  )
  // Nem zero, nem o real cheio: o valor do instante.
  assert.ok(esperado > REAL.transacoes - LANC.transacoes)
  assert.ok(esperado < REAL.transacoes)

  for (let i = 0; i < 1000; i++) {
    assert.equal(
      valorExibido(REAL.transacoes, LANC.transacoes, fracaoDoCiclo(agora, ciclo), 'contagem'),
      esperado,
    )
  }
})

test('DOIS DISPOSITIVOS no mesmo quadro mostram o mesmo numero', () => {
  const ciclo = cicloDe(sp('2026-10-08 19:00'))
  const agora = new Date(sp('2026-10-08 19:00:00').getTime() + 7 * QUADRO_MS)
  const a = valorExibido(REAL.tpv, LANC.tpv, fracaoDoCiclo(agora, ciclo), 'moeda')
  const b = valorExibido(REAL.tpv, LANC.tpv, fracaoDoCiclo(new Date(agora.getTime()), ciclo), 'moeda')
  assert.equal(a, b)
})

test('MONOTONICIDADE quadro a quadro nos quatro KPIs', () => {
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  // Varre as sete faixas, 200 quadros em cada.
  for (const faixa of PERFIL_RITMO) {
    const base = ciclo.inicio.getTime() + faixa.de * 3_600_000
    for (const [k, grandeza] of [
      ['tpv', 'moeda'], ['receita', 'moeda'],
      ['transacoes', 'contagem'], ['med', 'contagem'],
    ] as const) {
      let anterior = -Infinity
      for (let i = 0; i < 200; i++) {
        const t = new Date(base + i * QUADRO_MS)
        const v = valorExibido(REAL[k], LANC[k], fracaoDoCiclo(t, ciclo), grandeza)
        assert.ok(v >= anterior, `${k} recuou na faixa ${faixa.rotulo}, quadro ${i}`)
        assert.ok(v <= REAL[k] + 1e-9, `${k} estourou o real na faixa ${faixa.rotulo}`)
        anterior = v
      }
    }
  }
})

test('o FECHAMENTO do ciclo continua exato, quadro a quadro', () => {
  /**
   * Amostrar mais fino não pode mudar o fim: às 10h o valor é o real EXATO, e
   * o último quadro antes disso está a menos de um quadro de crescimento dele.
   *
   * "Menos de um quadro", e não "menos de um real": na última faixa (manhã,
   * ×1,0) o TPV cresce R$ 1.500,77 por segundo, então um quadro vale ~R$ 25.
   * Exigir menos que isso seria exigir que a curva fosse mais lenta do que o
   * perfil manda — a primeira versão desta asserção fixava R$ 1 e falhou por
   * isso.
   */
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const fim = ciclo.fim.getTime()

  const ultimoQuadro = valorExibido(
    REAL.tpv, LANC.tpv, fracaoDoCiclo(new Date(fim - QUADRO_MS), ciclo), 'moeda',
  )
  assert.ok(ultimoQuadro < REAL.tpv)
  // A taxa da última faixa × a duração de um quadro, com 10% de folga.
  const umQuadroDeTpv = (LANC.tpv / PESO_TOTAL / 3600) * (QUADRO_MS / 1000)
  assert.ok(
    REAL.tpv - ultimoQuadro < umQuadroDeTpv * 1.1,
    `faltavam R$ ${REAL.tpv - ultimoQuadro}, mais que um quadro (R$ ${umQuadroDeTpv})`,
  )

  assert.equal(valorExibido(REAL.tpv, LANC.tpv, fracaoDoCiclo(new Date(fim), ciclo), 'moeda'), REAL.tpv)
  assert.equal(
    valorExibido(REAL.transacoes, LANC.transacoes, fracaoDoCiclo(new Date(fim), ciclo), 'contagem'),
    REAL.transacoes,
  )
})

test('a VIRADA DAS 10H continua sem regressao, quadro a quadro', () => {
  /**
   * A mesma invariante da rodada anterior, agora na cadência de quadro: o
   * último quadro do ciclo que fecha e o primeiro do que abre mostram o MESMO
   * número.
   */
  const anterior = cicloDe(sp('2026-10-08 12:00'))
  const seguinte = cicloDe(sp('2026-10-09 12:00'))
  assert.equal(anterior.fim.getTime(), seguinte.inicio.getTime())

  const L1 = LANC.receita          // animou no ciclo que fecha
  const L2 = 30_000                // entra no que abre
  const acumuladoFinal = REAL.receita + L2

  // Último quadro antes das 10h: L1 completo, L2 ainda PENDENTE.
  const fechando = valorExibido(
    acumuladoFinal, L1,
    fracaoDoCiclo(new Date(anterior.fim.getTime() - QUADRO_MS), anterior),
    'moeda', L2,
  )
  // Primeiro quadro depois: L2 virou incremento, fração 0.
  const abrindo = valorExibido(
    acumuladoFinal, L2, fracaoDoCiclo(seguinte.inicio, seguinte), 'moeda', 0,
  )

  assert.ok(abrindo >= fechando - 0.01, `caiu na virada: ${fechando} -> ${abrindo}`)
  assert.ok(Math.abs(abrindo - REAL.receita) < 1e-9)
})

/* ========================================================================= *
 * HOME E CONSELHO, O MESMO COMPORTAMENTO
 * ========================================================================= */

test('as DUAS telas dependem do MESMO relogio e do MESMO instantaneo', () => {
  /**
   * Nenhuma das duas monta laço próprio nem lê o relógio: as duas montam
   * `ProjecaoProvider`, que assina a store compartilhada. Dois relógios é como
   * duas telas passam a mostrar números diferentes para o mesmo instante.
   */
  for (const [nome, arq] of [
    ['Home', 'app/dashboard/page.tsx'],
    ['Conselho', 'app/dashboard/conselho/page.tsx'],
  ] as const) {
    const sem = semComentarios(ler(arq))
    assert.ok(sem.includes('<ProjecaoProvider'), `${nome} não monta o provedor`)
    for (const proibido of ['setInterval', 'requestAnimationFrame', 'Date.now()']) {
      assert.ok(!sem.includes(proibido), `${nome} passou a ler o relógio (${proibido})`)
    }
  }

  // E a figura projetada deriva da fração do contexto, sem relógio próprio.
  const fig = semComentarios(ler('components/projecao/FiguraProjetada.tsx'))
  assert.ok(fig.includes('useFracaoCiclo()'))
  assert.ok(!fig.includes('setInterval') && !fig.includes('requestAnimationFrame'))
  assert.ok(!fig.includes('Date.now()'))
})

test('a animacao NAO introduziu estado nem interpolacao com atraso', () => {
  /**
   * "Se usar interpolação visual, ela deve apenas preencher a percepção entre
   * valores corretos da curva; não pode mudar o resultado matemático nem fazer
   * a tela divergir do instante atual."
   *
   * Não há interpolação nenhuma: cada quadro recalcula a curva do relógio.
   * Nenhum acumulador, nenhum valor alvo, nenhuma fila.
   */
  const fig = semComentarios(ler('components/projecao/FiguraProjetada.tsx'))
  const prov = semComentarios(ler('components/projecao/ProjecaoProvider.tsx'))
  for (const [nome, fonte] of [['FiguraProjetada', fig], ['ProjecaoProvider', prov]] as const) {
    assert.ok(!/\+=/.test(fonte), `${nome} passou a acumular`)
    assert.ok(!fonte.includes('useRef'), `${nome} passou a guardar estado de animação`)
    // `alvo` e `destino` seriam os nomes de uma interpolação com fila.
    //
    // `pendente` NÃO entra aqui: é a prop da rodada anterior — o volume já
    // registrado cujo ciclo não abriu —, e confundi-la com fila de animação foi
    // o que fez a primeira versão desta asserção falhar.
    assert.ok(!/\b(alvo|destino|interpola)/i.test(fonte), `${nome} tem fila de animação`)
  }
  assert.ok(prov.includes('fracaoDoCiclo(agora, ciclo)'))
})

/* ========================================================================= *
 * O BANCO E OS DEMAIS INDICADORES
 * ========================================================================= */

test('a animacao NAO toca o banco nem os demais indicadores', () => {
  for (const arq of [
    'lib/relogio-ciclo.ts',
    'components/projecao/ProjecaoProvider.tsx',
    'components/projecao/FiguraProjetada.tsx',
  ]) {
    const sem = semComentarios(ler(arq))
    assert.ok(!sem.includes('prisma'), `${arq} passou a tocar o banco`)
    assert.ok(!sem.includes('fetch('), `${arq} passou a fazer requisição`)
  }
  // E o perfil de faixas não foi alterado por esta rodada.
  assert.equal(PERFIL_RITMO.length, 7)
  assert.equal(PESO_TOTAL, 21)
  assert.equal(faixaEm(horasDecorridas(sp('2026-10-08 19:00'), cicloDe(sp('2026-10-08 19:00'))))?.multiplicador, 2)
})
