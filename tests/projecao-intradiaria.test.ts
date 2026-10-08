/**
 * PROJEÇÃO INTRADIÁRIA — a curva ponderada dos quatro KPIs de volume.
 *
 * ── O QUE ESTES TESTES PRENDEM ───────────────────────────────────────────
 *
 * Três invariantes, e elas são a razão de o módulo existir:
 *
 *   1. A soma fecha. O acumulado chega EXATAMENTE no valor lançado às 10h do
 *      dia seguinte — nunca antes, nunca acima.
 *   2. O pico é o dobro. Entre 18h e 20h a taxa instantânea é exatamente 2×
 *      a normal, e isso NÃO faz o total estourar.
 *   3. É determinístico. Mesmo instante, mesmo valor, mesmo resultado — em
 *      qualquer máquina, em qualquer fuso de sistema.
 *
 * Tudo aqui é PURO: calendário e aritmética, sem banco e sem relógio (o
 * instante é sempre parâmetro).
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FUSO_OPERACIONAL, HORA_INICIO_CICLO, PICO_INICIO, PICO_FIM, FATOR_PICO,
  PESO_TOTAL, KPIS_PROJETADOS, GRANDEZA_DO_KPI,
  partesNoFuso, offsetMinutos, instanteNoFuso, cicloDe,
  pesoAcumulado, pesoPorHora, horasDecorridas, fracaoDoCiclo, taxaPorHora,
  projetarContinuo, projetarContagem, valorExibido,
} from '../lib/projecao-intradiaria'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

/** Um instante a partir de um horário de parede em São Paulo. */
const sp = (texto: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto)
  if (!m) throw new Error(`horário inválido: ${texto}`)
  return instanteNoFuso(
    Number(m[1]), Number(m[2]), Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  )
}

/** O horário de parede em São Paulo, para a leitura das afirmações. */
const emSp = (d: Date) => {
  const p = partesNoFuso(d)
  const z = (n: number) => String(n).padStart(2, '0')
  return `${p.ano}-${z(p.mes)}-${z(p.dia)} ${z(p.hora)}:${z(p.minuto)}`
}

/* ========================================================================= *
 * A CONFIGURAÇÃO
 * ========================================================================= */

test('a configuracao do ciclo e a do pedido', () => {
  assert.equal(FUSO_OPERACIONAL, 'America/Sao_Paulo')
  assert.equal(HORA_INICIO_CICLO, 10)
  assert.equal(PICO_INICIO, 18)
  assert.equal(PICO_FIM, 20)
  assert.equal(FATOR_PICO, 2)
})

test('o PESO TOTAL e 26 — 8x1 + 2x2 + 14x1', () => {
  /**
   * Este número é o denominador da taxa. Mudar a janela de pico sem recalculá-lo
   * produziria uma curva que não fecha no valor lançado — e o painel
   * ultrapassaria ou ficaria abaixo do total real.
   */
  assert.equal(PESO_TOTAL, 26)
  assert.equal(8 * 1 + 2 * FATOR_PICO + 14 * 1, PESO_TOTAL)
})

test('os QUATRO KPIs projetados, e so eles', () => {
  assert.deepEqual([...KPIS_PROJETADOS], ['tpv', 'receita', 'transacoes', 'med'])
  assert.equal(GRANDEZA_DO_KPI.tpv, 'moeda')
  assert.equal(GRANDEZA_DO_KPI.receita, 'moeda')
  assert.equal(GRANDEZA_DO_KPI.transacoes, 'contagem')
  assert.equal(GRANDEZA_DO_KPI.med, 'contagem')
})

/* ========================================================================= *
 * O FUSO — America/Sao_Paulo, nunca UTC
 * ========================================================================= */

test('o fuso e lido de America/Sao_Paulo, nao do relogio do sistema', () => {
  // 08/10/2026 13:00 UTC = 10:00 em São Paulo (UTC−3).
  const p = partesNoFuso(new Date('2026-10-08T13:00:00Z'))
  assert.equal(p.ano, 2026)
  assert.equal(p.mes, 10)
  assert.equal(p.dia, 8)
  assert.equal(p.hora, 10)
  assert.equal(offsetMinutos(new Date('2026-10-08T13:00:00Z')), -180)
})

test('a conversao horario-de-parede -> instante e exata, e a volta fecha', () => {
  const i = sp('2026-10-08 10:00')
  assert.equal(i.toISOString(), '2026-10-08T13:00:00.000Z')
  assert.equal(emSp(i), '2026-10-08 10:00')

  // A VIRADA DO DIA em São Paulo é 03:00 UTC.
  assert.equal(sp('2026-10-08 00:00').toISOString(), '2026-10-08T03:00:00.000Z')
  assert.equal(emSp(sp('2026-10-08 23:59')), '2026-10-08 23:59')
})

test('o fuso continua certo numa data com horario de verao historico', () => {
  /**
   * O Brasil tinha horário de verão até 2019: em 15/01/2018 São Paulo estava
   * em UTC−2, não UTC−3. Fixar "−3" na mão daria uma hora de erro aqui — e
   * daria de novo se a regra voltasse.
   */
  assert.equal(offsetMinutos(new Date('2018-01-15T12:00:00Z')), -120)
  assert.equal(offsetMinutos(new Date('2018-07-15T12:00:00Z')), -180)
  // E a conversão inversa acompanha.
  assert.equal(sp('2018-01-15 10:00').toISOString(), '2018-01-15T12:00:00.000Z')
})

/* ========================================================================= *
 * O CICLO
 * ========================================================================= */

test('o ciclo vai das 10h as 10h, em horario de Sao Paulo', () => {
  const c = cicloDe(sp('2026-10-08 14:30'))
  assert.equal(emSp(c.inicio), '2026-10-08 10:00')
  assert.equal(emSp(c.fim), '2026-10-09 10:00')
  // 24 horas exatas, sem horário de verão no caminho.
  assert.equal((c.fim.getTime() - c.inicio.getTime()) / 3_600_000, 24)
})

test('antes das 10h o instante pertence ao ciclo que comecou ONTEM', () => {
  // É o que faz a madrugada continuar sendo "o ciclo de ontem" — que é como a
  // operação a lê.
  for (const t of ['2026-10-08 09:59', '2026-10-08 00:01', '2026-10-08 03:00']) {
    const c = cicloDe(sp(t))
    assert.equal(emSp(c.inicio), '2026-10-07 10:00', `falhou em ${t}`)
    assert.equal(emSp(c.fim), '2026-10-08 10:00')
  }
})

test('as 10h00 em ponto JA e o ciclo novo', () => {
  const c = cicloDe(sp('2026-10-08 10:00'))
  assert.equal(emSp(c.inicio), '2026-10-08 10:00')
  // E um segundo antes, ainda é o anterior.
  assert.equal(emSp(cicloDe(sp('2026-10-08 09:59:59')).inicio), '2026-10-07 10:00')
})

test('o ciclo ATRAVESSA A MEIA-NOITE sem se partir', () => {
  /**
   * O caso de borda que um ciclo ancorado no dia de calendário erraria: 23h59
   * e 00h01 são o MESMO ciclo, e a fração tem de ser contínua na virada.
   */
  const antes = sp('2026-10-08 23:59:59')
  const depois = sp('2026-10-09 00:00:00')

  const cAntes = cicloDe(antes)
  const cDepois = cicloDe(depois)
  assert.equal(cAntes.inicio.getTime(), cDepois.inicio.getTime())
  assert.equal(emSp(cAntes.inicio), '2026-10-08 10:00')

  const f1 = fracaoDoCiclo(antes, cAntes)
  const f2 = fracaoDoCiclo(depois, cDepois)
  assert.ok(f2 > f1, 'a fração recuou na virada do dia')
  assert.ok(f2 - f1 < 1e-4, 'a fração deu um salto na virada do dia')
})

test('o ciclo atravessa a virada do MES e do ANO', () => {
  const c = cicloDe(sp('2026-12-31 23:00'))
  assert.equal(emSp(c.inicio), '2026-12-31 10:00')
  assert.equal(emSp(c.fim), '2027-01-01 10:00')

  const m = cicloDe(sp('2026-11-01 02:00'))
  assert.equal(emSp(m.inicio), '2026-10-31 10:00')
  assert.equal(emSp(m.fim), '2026-11-01 10:00')
})

/* ========================================================================= *
 * A CURVA — peso acumulado
 * ========================================================================= */

test('o peso acumulado e 0 no inicio e 26 no fim', () => {
  assert.equal(pesoAcumulado(0), 0)
  assert.equal(pesoAcumulado(24), PESO_TOTAL)
  // Fora do ciclo, satura — nunca extrapola.
  assert.equal(pesoAcumulado(-5), 0)
  assert.equal(pesoAcumulado(99), PESO_TOTAL)
})

test('os tres trechos da curva, nos pontos de quebra', () => {
  //  h=0  (10h)  →  0
  //  h=8  (18h)  →  8          fim do trecho normal
  //  h=10 (20h)  →  8 + 2×2 = 12   fim do pico
  //  h=24 (10h)  →  12 + 14 = 26
  assert.equal(pesoAcumulado(0), 0)
  assert.equal(pesoAcumulado(4), 4)
  assert.equal(pesoAcumulado(8), 8)
  assert.equal(pesoAcumulado(9), 10)
  assert.equal(pesoAcumulado(10), 12)
  assert.equal(pesoAcumulado(17), 19)
  assert.equal(pesoAcumulado(24), 26)
})

test('a curva e MONOTONA e CONTINUA — minuto a minuto do ciclo inteiro', () => {
  let anterior = -1
  for (let min = 0; min <= 24 * 60; min++) {
    const w = pesoAcumulado(min / 60)
    assert.ok(w >= anterior, `o peso recuou em ${min} min`)
    // Nenhum salto: o maior degrau possível é o do pico, 2 unidades por hora.
    if (anterior >= 0) assert.ok(w - anterior <= 2 / 60 + 1e-9, `salto em ${min} min`)
    anterior = w
  }
  assert.equal(anterior, PESO_TOTAL)
})

/* ========================================================================= *
 * O PICO — exatamente o dobro, nos horários do pedido
 * ========================================================================= */

test('17h59, 18h00, 19h00, 20h00 e 20h01 — a taxa instantanea', () => {
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const taxa = (t: string) => pesoPorHora(horasDecorridas(sp(t), ciclo))

  assert.equal(taxa('2026-10-08 17:59'), 1, '17h59 deveria ser taxa normal')
  assert.equal(taxa('2026-10-08 18:00'), FATOR_PICO, '18h00 deveria ser pico')
  assert.equal(taxa('2026-10-08 19:00'), FATOR_PICO, '19h00 deveria ser pico')
  // 20h00 FECHA o pico: o intervalo é [18h, 20h), e às 20h a taxa já voltou.
  assert.equal(taxa('2026-10-08 20:00'), 1, '20h00 deveria ter voltado ao normal')
  assert.equal(taxa('2026-10-08 20:01'), 1, '20h01 deveria ser taxa normal')
})

test('entre 18h e 20h a velocidade e DUAS VEZES a normal — medida no valor', () => {
  /**
   * A afirmação do pedido, verificada sobre o VALOR e não sobre o peso: com
   * 250.000 transações, a taxa normal é 250.000/26 ≈ 9.615,38 por hora e a de
   * pico é o dobro, 19.230,77.
   */
  const TOTAL = 250_000
  const ciclo = cicloDe(sp('2026-10-08 12:00'))

  const normal = taxaPorHora(TOTAL, sp('2026-10-08 14:00'), ciclo)
  const pico = taxaPorHora(TOTAL, sp('2026-10-08 19:00'), ciclo)

  assert.ok(Math.abs(normal - TOTAL / 26) < 1e-9)
  assert.ok(Math.abs(pico - (2 * TOTAL) / 26) < 1e-9)
  assert.ok(Math.abs(pico / normal - 2) < 1e-12, 'o pico deixou de ser o dobro')

  // Os números do pedido, com duas casas.
  assert.equal(Number(normal.toFixed(2)), 9615.38)
  assert.equal(Number(pico.toFixed(2)), 19230.77)
})

test('a aceleracao do pico NAO faz o total estourar', () => {
  /**
   * O erro óbvio seria "multiplicar por dois entre 18h e 20h". Isso faria o
   * acumulado passar do valor lançado. A aceleração está na DISTRIBUIÇÃO: as
   * duas horas de pico valem 4 das 26 unidades, e as outras 22 horas valem as
   * 22 restantes.
   */
  const TOTAL = 250_000
  const ciclo = cicloDe(sp('2026-10-08 12:00'))

  // O que o pico acrescenta em duas horas, contra o que acrescentaria normal.
  const antes = projetarContinuo(TOTAL, fracaoDoCiclo(sp('2026-10-08 18:00'), ciclo))
  const depois = projetarContinuo(TOTAL, fracaoDoCiclo(sp('2026-10-08 20:00'), ciclo))
  const noPico = depois - antes
  assert.ok(Math.abs(noPico - (4 / 26) * TOTAL) < 1e-6)

  // E o fim do ciclo continua exato.
  assert.equal(projetarContinuo(TOTAL, fracaoDoCiclo(sp('2026-10-09 10:00'), ciclo)), TOTAL)
})

/* ========================================================================= *
 * A DISTRIBUIÇÃO — 250.000 transações, o exemplo do pedido
 * ========================================================================= */

test('250.000 transacoes: a distribuicao hora a hora fecha no total', () => {
  const TOTAL = 250_000
  const ciclo = cicloDe(sp('2026-10-08 12:00'))

  // Soma das 24 fatias horárias, cada uma medida como a diferença da curva.
  let soma = 0
  for (let h = 0; h < 24; h++) {
    const de = fracaoDoCiclo(new Date(ciclo.inicio.getTime() + h * 3_600_000), ciclo)
    const ate = fracaoDoCiclo(new Date(ciclo.inicio.getTime() + (h + 1) * 3_600_000), ciclo)
    soma += (ate - de) * TOTAL
  }
  assert.ok(Math.abs(soma - TOTAL) < 1e-6, `a soma das 24 horas deu ${soma}`)
})

test('250.000 transacoes: os marcos do ciclo', () => {
  const TOTAL = 250_000
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const em = (t: string) => projetarContagem(TOTAL, fracaoDoCiclo(sp(t), ciclo))

  assert.equal(em('2026-10-08 10:00'), 0, 'o ciclo começa em zero')
  // 8 horas normais = 8/26 do total.
  assert.equal(em('2026-10-08 18:00'), Math.floor((8 / 26) * TOTAL))
  // Mais 2 horas de pico = 12/26.
  assert.equal(em('2026-10-08 20:00'), Math.floor((12 / 26) * TOTAL))
  assert.equal(em('2026-10-09 10:00'), TOTAL, 'o ciclo fecha no total exato')
})

/* ========================================================================= *
 * OS LIMITES
 * ========================================================================= */

test('a fracao fica SEMPRE em [0, 1]', () => {
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  for (const t of [
    '2026-10-07 10:00', '2026-10-08 09:00', '2026-10-08 10:00',
    '2026-10-08 23:59', '2026-10-09 09:59', '2026-10-09 10:00',
    '2026-10-12 15:00',
  ]) {
    const f = fracaoDoCiclo(sp(t), ciclo)
    assert.ok(f >= 0 && f <= 1, `${t} deu fração ${f}`)
  }
  assert.equal(fracaoDoCiclo(sp('2026-10-08 10:00'), ciclo), 0)
  assert.equal(fracaoDoCiclo(sp('2026-10-09 10:00'), ciclo), 1)
  // Depois do fim do ciclo, satura em 1 — nunca passa do valor real.
  assert.equal(fracaoDoCiclo(sp('2026-10-20 15:00'), ciclo), 1)
})

test('o acumulado NUNCA passa do valor de referencia, minuto a minuto', () => {
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  for (const TOTAL of [250_000, 113_458_481.82, 28_000.79, 3_278]) {
    let anterior = -Infinity
    for (let min = 0; min <= 24 * 60; min++) {
      const agora = new Date(ciclo.inicio.getTime() + min * 60_000)
      const v = projetarContinuo(TOTAL, fracaoDoCiclo(agora, ciclo))
      assert.ok(v <= TOTAL + 1e-9, `${TOTAL} estourou em ${min} min: ${v}`)
      assert.ok(v >= 0, `${TOTAL} ficou negativo em ${min} min: ${v}`)
      assert.ok(v >= anterior - 1e-9, `${TOTAL} recuou em ${min} min`)
      anterior = v
    }
    assert.ok(Math.abs(anterior - TOTAL) < 1e-6, `${TOTAL} não fechou`)
  }
})

/* ========================================================================= *
 * OS TIPOS DE KPI
 * ========================================================================= */

test('CONTAGEM nunca mostra fracao de transacao nem de MED', () => {
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  for (const total of [265_483, 3_278, 7, 1]) {
    for (let min = 0; min <= 24 * 60; min += 7) {
      const v = projetarContagem(total, fracaoDoCiclo(
        new Date(ciclo.inicio.getTime() + min * 60_000), ciclo,
      ))
      assert.equal(v, Math.trunc(v), `${total} deu fração em ${min} min`)
      assert.ok(v <= total)
    }
  }
})

test('CONTAGEM trunca para baixo — nunca arredonda para cima', () => {
  // Arredondar para cima exibiria 173 quando só 172,6 "aconteceram", e por um
  // instante o acumulado passaria do real.
  assert.equal(projetarContagem(100, 0.999), 99)
  assert.equal(projetarContagem(100, 1), 100)
  assert.equal(projetarContagem(1, 0.99), 0)
})

test('MOEDA mantem a precisao do calculo — o arredondamento e da formatacao', () => {
  // "O arredondamento visual de quantidades inteiras não pode alterar a
  // precisão do cálculo subjacente."
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const v = projetarContinuo(113_458_481.82, fracaoDoCiclo(sp('2026-10-08 14:30'), ciclo))
  assert.notEqual(v, Math.floor(v), 'a projeção monetária foi truncada no cálculo')
  assert.ok(v > 0 && v < 113_458_481.82)
})

test('os quatro KPIs com os valores REAIS de 07/10 em Production', () => {
  /**
   * TPV R$ 113.458.481,82 · receita R$ 28.000,79 · 265.483 transações ·
   * 3.278 MEDs. Os quatro fecham no valor exato ao fim do ciclo.
   */
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const fim = fracaoDoCiclo(sp('2026-10-09 10:00'), ciclo)

  assert.equal(projetarContinuo(113_458_481.82, fim), 113_458_481.82)
  assert.equal(projetarContinuo(28_000.79, fim), 28_000.79)
  assert.equal(projetarContagem(265_483, fim), 265_483)
  assert.equal(projetarContagem(3_278, fim), 3_278)

  // E no meio do caminho, cada um na sua fração.
  const meio = fracaoDoCiclo(sp('2026-10-08 18:00'), ciclo)
  assert.ok(Math.abs(meio - 8 / 26) < 1e-12)
  assert.equal(projetarContagem(265_483, meio), Math.floor((8 / 26) * 265_483))
})

/* ========================================================================= *
 * O VALOR EXIBIDO — acumulado + fatia do ciclo
 * ========================================================================= */

test('o exibido e o acumulado CONSOLIDADO mais a fatia do ciclo', () => {
  /**
   * O defeito que esta conta evita: `real × fracao` transformaria o acumulado
   * do MÊS numa animação diária, e no dia 20 o painel mostraria 1/26 do mês
   * às 11h da manhã.
   */
  const real = 166_378.31       // outubro até 07/10
  const incremento = 28_000.79  // o lançamento de 07/10, registrado neste ciclo
  const base = real - incremento

  assert.equal(valorExibido(real, incremento, 0, 'moeda'), base)
  assert.equal(valorExibido(real, incremento, 1, 'moeda'), real)
  const meio = valorExibido(real, incremento, 0.5, 'moeda')
  assert.ok(meio > base && meio < real)
})

test('o exibido NUNCA CAI na virada do ciclo', () => {
  /**
   * A INVARIANTE MAIS IMPORTANTE DO PEDIDO, e a razão de o incremento ser
   * escolhido por `createdAt` e não por competência.
   *
   * Às 10h o ciclo vira e a fração volta a 0 — mas o incremento do novo ciclo
   * também sai do acumulado, então o exibido continua exatamente onde o ciclo
   * anterior o deixou. Um painel executivo que recua 250 mil transações às
   * 10h da manhã seria lido como falha.
   */
  const acumuladoAntes = 166_378.31
  const incAntes = 28_000.79

  // Fim do ciclo anterior: a fração chegou a 1.
  const fimAnterior = valorExibido(acumuladoAntes, incAntes, 1, 'moeda')
  assert.equal(fimAnterior, acumuladoAntes)

  // Ciclo novo: o lançamento seguinte entrou, o acumulado cresceu, e a fração
  // zerou. O exibido tem de ser o MESMO do instante anterior.
  const incNovo = 30_000
  const acumuladoDepois = acumuladoAntes + incNovo
  const inicioNovo = valorExibido(acumuladoDepois, incNovo, 0, 'moeda')
  assert.equal(inicioNovo, fimAnterior, 'o número caiu na virada do ciclo')
})

test('o exibido de CONTAGEM e sempre inteiro', () => {
  for (const f of [0, 0.137, 0.5, 0.9999, 1]) {
    const v = valorExibido(1_355_281, 265_483, f, 'contagem')
    assert.equal(v, Math.trunc(v), `fração ${f} produziu valor não inteiro`)
  }
  assert.equal(valorExibido(1_355_281, 265_483, 1, 'contagem'), 1_355_281)
})

/* ========================================================================= *
 * DETERMINISMO
 * ========================================================================= */

test('MESMO instante, MESMO valor, MESMO resultado — 500 repeticoes', () => {
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const agora = sp('2026-10-08 16:37:11')
  const esperado = valorExibido(166_378.31, 28_000.79, fracaoDoCiclo(agora, ciclo), 'moeda')
  for (let i = 0; i < 500; i++) {
    assert.equal(
      valorExibido(166_378.31, 28_000.79, fracaoDoCiclo(agora, ciclo), 'moeda'),
      esperado,
    )
  }
})

test('o modulo NAO usa Math.random nem le o relogio por dentro', () => {
  /**
   * "Não utilizar Math.random(). Não depender do número de vezes que o
   * componente é renderizado."
   *
   * O instante é SEMPRE parâmetro. Uma leitura de `Date.now()` ou `new Date()`
   * dentro do módulo tornaria a função não determinística — e dois usuários
   * veriam números diferentes para o mesmo segundo.
   */
  // SEM COMENTÁRIOS: o cabeçalho do módulo CITA `Math.random()` para dizer
  // que não o usa, e um teste que varre o fonte cru proibiria a documentação.
  const fonte = ler('lib/projecao-intradiaria.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.ok(!fonte.includes('Math.random'), 'o módulo passou a sortear números')
  assert.ok(!/\bDate\.now\(\)/.test(fonte), 'o módulo passou a ler o relógio')
  assert.ok(!/new Date\(\)/.test(fonte), 'o módulo passou a ler o relógio')
  // E não toca o banco: é a camada de apresentação.
  assert.ok(!fonte.includes("@/lib/prisma"), 'o módulo puro passou a depender do banco')
})

/* ========================================================================= *
 * CASOS DE BORDA
 * ========================================================================= */

test('SEM LANCAMENTO: incremento zero mostra o acumulado real, parado', () => {
  // "Mantenha o último valor válido... Não inventar um novo volume."
  for (const f of [0, 0.3, 1]) {
    assert.equal(valorExibido(166_378.31, 0, f, 'moeda'), 166_378.31)
    assert.equal(valorExibido(1_355_281, 0, f, 'contagem'), 1_355_281)
  }
})

test('LANCAMENTO ZERO: nao ha o que animar, e nada quebra', () => {
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  assert.equal(projetarContinuo(0, fracaoDoCiclo(sp('2026-10-08 19:00'), ciclo)), 0)
  assert.equal(projetarContagem(0, 0.5), 0)
  assert.equal(valorExibido(500, 0, 0.5, 'moeda'), 500)
})

test('LANCAMENTO NEGATIVO caminha ATE o valor, sem passar dele', () => {
  /**
   * O modelo permite negativo em `Float`. Com valor negativo a projeção vai de
   * 0 até o valor — monotonicamente — e `|valor × f| <= |valor|` garante que
   * ela nunca o ultrapassa.
   */
  assert.equal(projetarContinuo(-1000, 0), 0)
  assert.equal(projetarContinuo(-1000, 0.5), -500)
  assert.equal(projetarContinuo(-1000, 1), -1000)
  // A contagem trunca PARA ZERO, não para baixo: −0,6 vira 0, não −1.
  assert.equal(projetarContagem(-10, 0.06), 0)
  assert.equal(projetarContagem(-10, 1), -10)
})

test('LANCAMENTO EDITADO: a fracao nao muda, o valor sim', () => {
  /**
   * Editar um lançamento muda `updatedAt`, não `createdAt` — então o ciclo é o
   * mesmo e a fração é a mesma. O número salta para a nova referência e segue
   * a curva a partir dali. Deterministicamente.
   */
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const f = fracaoDoCiclo(sp('2026-10-08 15:00'), ciclo)

  const antes = valorExibido(166_378.31, 28_000.79, f, 'moeda')
  // Corrigido para 30.000,00: o acumulado real também muda.
  const depois = valorExibido(166_378.31 - 28_000.79 + 30_000, 30_000, f, 'moeda')

  assert.ok(depois > antes)
  // E os dois fecham no respectivo total.
  assert.equal(valorExibido(166_378.31, 28_000.79, 1, 'moeda'), 166_378.31)
})

test('VARIOS LANCAMENTOS no mesmo ciclo: a soma e o incremento', () => {
  /**
   * Aconteceu em Production: as competências de 02/10 e 03/10 foram
   * registradas às 23h03 e às 00h01, dentro do mesmo ciclo. Animar só a mais
   * recente faria a outra aparecer de uma vez — o salto que esta rodada
   * existe para eliminar.
   */
  const a = 30_045.89, b = 20_788.32
  const real = 100_000 + a + b
  assert.equal(valorExibido(real, a + b, 0, 'moeda'), 100_000)
  assert.equal(valorExibido(real, a + b, 1, 'moeda'), real)
})

test('DOIS DISPOSITIVOS no mesmo instante veem o mesmo numero', () => {
  // A função é pura e o instante é parâmetro: não há como divergirem. O que
  // sincroniza os relógios é o desvio medido contra o servidor, no provedor.
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const agora = new Date('2026-10-08T19:23:45.678Z')
  const dispositivoA = valorExibido(166_378.31, 28_000.79, fracaoDoCiclo(agora, ciclo), 'moeda')
  const dispositivoB = valorExibido(166_378.31, 28_000.79, fracaoDoCiclo(new Date(agora.getTime()), ciclo), 'moeda')
  assert.equal(dispositivoA, dispositivoB)
})
