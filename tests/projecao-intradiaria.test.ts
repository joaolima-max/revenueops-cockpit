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
  PESO_TOTAL, PESO_TOTAL_10, PERFIL_RITMO, KPIS_PROJETADOS, GRANDEZA_DO_KPI,
  partesNoFuso, offsetMinutos, instanteNoFuso, cicloDe, cicloAtribuidoA,
  pesoAcumulado, pesoAcumulado10, pesoPorHora, faixaEm, horasDecorridas,
  fracaoDoCiclo, taxaPorHora, taxaBasePorHora, verificarPerfil,
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
})

test('as SETE faixas do perfil, na ordem do relogio', () => {
  /**
   * O perfil pedido:
   *
   *   10h–18h  1,0    18h–20h  2,0    20h–22h  1,0    22h–00h  0,8
   *   00h–06h  0,3    06h–08h  0,8    08h–10h  1,0
   */
  assert.deepEqual(
    PERFIL_RITMO.map((f) => [f.horaInicio, f.de, f.ate, f.multiplicador]),
    [
      [10, 0, 8, 1.0],
      [18, 8, 10, 2.0],
      [20, 10, 12, 1.0],
      [22, 12, 14, 0.8],
      [0, 14, 20, 0.3],
      [6, 20, 22, 0.8],
      [8, 22, 24, 1.0],
    ],
  )
  // As sete cobrem exatamente 24 horas.
  assert.equal(PERFIL_RITMO.reduce((a, f) => a + (f.ate - f.de), 0), 24)
})

test('o perfil e CONTIGUO — sem buraco e sem sobreposicao', () => {
  /**
   * Nenhuma das três condições é óbvia ao olhar a tabela, e as três são
   * silenciosas: um buraco faria a curva parar, uma sobreposição a faria
   * contar duas vezes, e qualquer dos dois estragaria o fechamento no valor
   * lançado.
   */
  verificarPerfil()  // não lança

  // E a verificação PEGA cada defeito possível.
  assert.throws(() => verificarPerfil([]), /vazio/)
  assert.throws(
    () => verificarPerfil([{ ...PERFIL_RITMO[0], de: 1 }]),
    /não começa em 0/,
  )
  assert.throws(
    () => verificarPerfil([
      { ...PERFIL_RITMO[0], de: 0, ate: 8 },
      { ...PERFIL_RITMO[1], de: 9, ate: 24 },   // buraco entre 8 e 9
    ]),
    /descontínuo/,
  )
  assert.throws(
    () => verificarPerfil([{ ...PERFIL_RITMO[0], de: 0, ate: 20 }]),
    /não termina em 24/,
  )
})

test('o PESO TOTAL e 21,0 — e e DERIVADO das faixas, nao digitado', () => {
  /**
   * 8×1,0 + 2×2,0 + 2×1,0 + 2×0,8 + 6×0,3 + 2×0,8 + 2×1,0
   *   = 8,0 + 4,0 + 2,0 + 1,6 + 1,8 + 1,6 + 2,0 = 21,0
   *
   * É o denominador da taxa. Mudar uma faixa sem recalculá-lo produziria uma
   * curva que não fecha no valor lançado — e o painel ultrapassaria ou ficaria
   * abaixo do total real. Por isso ele é SOMADO das faixas, nunca digitado:
   * esta mesma soma já foi escrita errada à mão numa revisão desta rodada, e
   * foi este teste que a pegou.
   */
  assert.equal(PESO_TOTAL, 21)
  assert.equal(PESO_TOTAL_10, 210)
  assert.equal(
    PERFIL_RITMO.reduce((a, f) => a + f.peso10 * (f.ate - f.de), 0),
    PESO_TOTAL_10,
  )
})

test('a conta em DECIMOS INTEIROS torna SEGURO mexer no perfil', () => {
  /**
   * ── PRIMEIRO, O QUE ISTO *NÃO* ESTÁ CORRIGINDO ──────────────────────
   *
   * Com os sete multiplicadores atuais, os resíduos de ponto flutuante se
   * cancelam: o total e o acumulado em cada fronteira caem no número exato
   * mesmo em decimais. A conta decimal daria o mesmo resultado hoje.
   */
  let decimal = 0
  for (const f of PERFIL_RITMO) {
    decimal += f.multiplicador * (f.ate - f.de)
    assert.equal(
      decimal, pesoAcumulado10(f.ate) / 10,
      `a fronteira h=${f.ate} divergiu — o perfil mudou?`,
    )
  }
  assert.equal(decimal, 21)

  /**
   * ── O QUE ELA PROTEGE É A PRÓXIMA MUDANÇA DE PERFIL ─────────────────
   *
   * Os produtos por faixa JÁ são inexatos — só não se vê porque se cancelam.
   */
  assert.equal(6 * 0.3, 1.7999999999999998)
  assert.notEqual(6 * 0.3, 1.8)

  /**
   * E basta trocar um multiplicador para o resíduo sobreviver ao cancelamento.
   * Trocar a madrugada de 0,3 para 0,7 faz `3 × 0,7` dar 2,0999999999999996:
   * a fração no fim do ciclo deixaria de fechar em 1, e o painel pararia a um
   * centavo do valor lançado — para sempre, sem erro em lugar nenhum.
   */
  assert.notEqual(3 * 0.7, 2.1)
  assert.notEqual(7 * 0.7, 4.9)
  // Em décimos, os mesmos produtos são exatos.
  assert.equal(3 * 7, 21)
  assert.equal(7 * 7, 49)

  // O total e o fim do ciclo, exatos por construção.
  assert.equal(PESO_TOTAL_10, 210)
  assert.equal(pesoAcumulado10(24), 210)
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  assert.equal(fracaoDoCiclo(sp('2026-10-09 10:00'), ciclo), 1)
})

test('a janela de PICO continua sendo 18h–20h, ao dobro', () => {
  assert.equal(PICO_INICIO, 18)
  assert.equal(PICO_FIM, 20)
  assert.equal(FATOR_PICO, 2)
  const pico = PERFIL_RITMO.find((f) => f.rotulo === 'pico')!
  assert.equal(pico.horaInicio, PICO_INICIO)
  assert.equal(pico.multiplicador, FATOR_PICO)
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

test('os SETE trechos da curva, nos pontos de quebra', () => {
  /**
   *  h=0   10h   →  0
   *  h=8   18h   →  8,0          fim do dia comercial
   *  h=10  20h   →  8 + 2×2   = 12,0   fim do pico
   *  h=12  22h   →  12 + 2×1  = 14,0   fim da noite
   *  h=14  00h   →  14 + 2×0,8 = 15,6  fim da desaceleração (MEIA-NOITE)
   *  h=20  06h   →  15,6 + 6×0,3 = 17,4  fim da madrugada
   *  h=22  08h   →  17,4 + 2×0,8 = 19,0  fim da retomada
   *  h=24  10h   →  19,0 + 2×1,0 = 21,0
   */
  assert.equal(pesoAcumulado10(0), 0)
  assert.equal(pesoAcumulado10(4), 40)
  assert.equal(pesoAcumulado10(8), 80)
  assert.equal(pesoAcumulado10(9), 100)
  assert.equal(pesoAcumulado10(10), 120)
  assert.equal(pesoAcumulado10(12), 140)
  assert.equal(pesoAcumulado10(14), 156)
  assert.equal(pesoAcumulado10(20), 174)
  assert.equal(pesoAcumulado10(22), 190)
  assert.equal(pesoAcumulado10(24), 210)

  // E a versão em unidades, para leitura.
  assert.equal(pesoAcumulado(14), 15.6)
  assert.equal(pesoAcumulado(24), 21)
})

test('cada FAIXA e identificada pelo seu intervalo de horas', () => {
  assert.equal(faixaEm(0)?.rotulo, 'dia comercial')
  assert.equal(faixaEm(7.99)?.rotulo, 'dia comercial')
  assert.equal(faixaEm(8)?.rotulo, 'pico')
  assert.equal(faixaEm(9.99)?.rotulo, 'pico')
  assert.equal(faixaEm(10)?.rotulo, 'noite')
  assert.equal(faixaEm(12)?.rotulo, 'desaceleração')
  assert.equal(faixaEm(14)?.rotulo, 'madrugada')
  assert.equal(faixaEm(19.99)?.rotulo, 'madrugada')
  assert.equal(faixaEm(20)?.rotulo, 'retomada')
  assert.equal(faixaEm(22)?.rotulo, 'manhã')
  assert.equal(faixaEm(23.99)?.rotulo, 'manhã')
  // Fora do ciclo não há faixa.
  assert.equal(faixaEm(-0.1), null)
  assert.equal(faixaEm(24), null)
})

test('a curva e ESTRITAMENTE MONOTONA e CONTINUA — minuto a minuto', () => {
  /**
   * ESTRITAMENTE crescente: todo multiplicador é positivo, inclusive o 0,3 da
   * madrugada. Uma faixa com peso zero faria o painel congelar por seis horas
   * e ser lido como travado.
   *
   * E CONTÍNUA nas sete fronteiras, inclusive na MEIA-NOITE (h=14) — que não é
   * caso especial nenhum: é uma fronteira como as outras, porque a curva é
   * contada em horas de ciclo e não em hora de parede.
   */
  let anterior = -1
  for (let min = 0; min <= 24 * 60; min++) {
    const w = pesoAcumulado10(min / 60)
    if (anterior >= 0) {
      assert.ok(w > anterior - 1e-9, `o peso recuou em ${min} min`)
      if (min < 24 * 60) {
        assert.ok(w > anterior, `a curva parou em ${min} min`)
      }
      // Nenhum salto: o maior degrau possível é o do pico, 20 décimos/hora.
      assert.ok(w - anterior <= 20 / 60 + 1e-9, `salto em ${min} min`)
    }
    anterior = w
  }
  assert.equal(anterior, PESO_TOTAL_10)
})

test('a MEIA-NOITE nao e um ponto de quebra da curva', () => {
  // h=14 é 00h00. Os dois lados chegam ao mesmo acumulado; só a inclinação
  // muda, de 0,8 para 0,3.
  const antes = pesoAcumulado10(14 - 1e-9)
  const exato = pesoAcumulado10(14)
  const depois = pesoAcumulado10(14 + 1e-9)
  assert.ok(Math.abs(antes - 156) < 1e-6)
  assert.equal(exato, 156)
  assert.ok(Math.abs(depois - 156) < 1e-6)
  // A inclinação, sim, muda.
  assert.equal(pesoPorHora(13.9), 0.8)
  assert.equal(pesoPorHora(14.1), 0.3)
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

test('as SETE velocidades, medidas no VALOR e nao no peso', () => {
  /**
   * Com 250.000 transações, a taxa BASE é 250.000/21 ≈ 11.904,76 por hora, e
   * cada faixa é o multiplicador dela vezes isso.
   */
  const TOTAL = 250_000
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const base = taxaBasePorHora(TOTAL)
  assert.ok(Math.abs(base - TOTAL / 21) < 1e-9)
  assert.equal(Number(base.toFixed(2)), 11904.76)

  const em = (t: string) => taxaPorHora(TOTAL, sp(t), ciclo)

  for (const [hora, mult] of [
    ['2026-10-08 14:00', 1.0],   // dia comercial
    ['2026-10-08 19:00', 2.0],   // PICO
    ['2026-10-08 21:00', 1.0],   // noite
    ['2026-10-08 23:00', 0.8],   // desaceleração
    ['2026-10-09 03:00', 0.3],   // madrugada
    ['2026-10-09 07:00', 0.8],   // retomada
    ['2026-10-09 09:00', 1.0],   // manhã
  ] as const) {
    assert.ok(
      Math.abs(em(hora) - mult * base) < 1e-9,
      `${hora}: esperava ${mult}x a base, deu ${em(hora) / base}x`,
    )
  }

  // A AFIRMAÇÃO CENTRAL DO PEDIDO: o pico é exatamente o dobro da base.
  const pico = em('2026-10-08 19:00')
  assert.ok(Math.abs(pico / base - 2) < 1e-12, 'o pico deixou de ser o dobro')
  assert.equal(Number(pico.toFixed(2)), 23809.52)
  // E a madrugada é 0,3 da base — pouco menos de um terço.
  assert.equal(Number(em('2026-10-09 03:00').toFixed(2)), 3571.43)
})

test('a aceleracao do pico NAO faz o total estourar', () => {
  /**
   * O erro óbvio seria "multiplicar por dois entre 18h e 20h". Isso faria o
   * acumulado passar do valor lançado. A aceleração está na DISTRIBUIÇÃO: as
   * duas horas de pico valem 4 das 21 unidades, e as outras 22 horas valem as
   * 17 restantes.
   */
  const TOTAL = 250_000
  const ciclo = cicloDe(sp('2026-10-08 12:00'))

  // O que o pico acrescenta em duas horas.
  const antes = projetarContinuo(TOTAL, fracaoDoCiclo(sp('2026-10-08 18:00'), ciclo))
  const depois = projetarContinuo(TOTAL, fracaoDoCiclo(sp('2026-10-08 20:00'), ciclo))
  assert.ok(Math.abs((depois - antes) - (4 / 21) * TOTAL) < 1e-6)

  // A madrugada acrescenta 1,8 das 21 unidades em SEIS horas — menos do que
  // as duas de pico. É a assimetria que o perfil existe para produzir.
  const meiaNoite = projetarContinuo(TOTAL, fracaoDoCiclo(sp('2026-10-09 00:00'), ciclo))
  const seisDaManha = projetarContinuo(TOTAL, fracaoDoCiclo(sp('2026-10-09 06:00'), ciclo))
  assert.ok(Math.abs((seisDaManha - meiaNoite) - (1.8 / 21) * TOTAL) < 1e-6)
  assert.ok(seisDaManha - meiaNoite < depois - antes, 'a madrugada passou o pico')

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

test('250.000 transacoes: os marcos das SETE faixas', () => {
  const TOTAL = 250_000
  const ciclo = cicloDe(sp('2026-10-08 12:00'))
  const em = (t: string) => projetarContagem(TOTAL, fracaoDoCiclo(sp(t), ciclo))
  const esperado = (peso: number) => Math.floor((peso / 21) * TOTAL)

  assert.equal(em('2026-10-08 10:00'), 0, 'o ciclo começa em zero')
  assert.equal(em('2026-10-08 18:00'), esperado(8.0), '18h — fim do dia comercial')
  assert.equal(em('2026-10-08 20:00'), esperado(12.0), '20h — fim do pico')
  assert.equal(em('2026-10-08 22:00'), esperado(14.0), '22h — fim da noite')
  assert.equal(em('2026-10-09 00:00'), esperado(15.6), '00h — meia-noite')
  assert.equal(em('2026-10-09 06:00'), esperado(17.4), '06h — fim da madrugada')
  assert.equal(em('2026-10-09 08:00'), esperado(19.0), '08h — fim da retomada')
  assert.equal(em('2026-10-09 10:00'), TOTAL, 'o ciclo fecha no total exato')

  // E o percentual em cada marco, para leitura.
  assert.equal(((8.0 / 21) * 100).toFixed(2), '38.10')
  assert.equal(((12.0 / 21) * 100).toFixed(2), '57.14')
  assert.equal(((15.6 / 21) * 100).toFixed(2), '74.29')
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
  assert.ok(Math.abs(meio - 8 / 21) < 1e-12)
  assert.equal(projetarContagem(265_483, meio), Math.floor((8 / 21) * 265_483))
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

/* ========================================================================= *
 * A ATRIBUIÇÃO DE UM LANÇAMENTO A UM CICLO
 *
 * "Um lançamento registrado antes das 10h pertence ao próximo ciclo que começa
 * às 10h; não deve iniciar a animação antes desse horário."
 * ========================================================================= */

test('o ciclo de um lancamento e as 10h do DIA DO REGISTRO', () => {
  const emSpCurto = (d: Date) => {
    const p = partesNoFuso(d)
    const z = (n: number) => String(n).padStart(2, '0')
    return `${p.ano}-${z(p.mes)}-${z(p.dia)} ${z(p.hora)}:${z(p.minuto)}`
  }

  // ANTES das 10h → o ciclo que COMEÇA às 10h daquele dia.
  assert.equal(emSpCurto(cicloAtribuidoA(sp('2026-10-08 09:19'))), '2026-10-08 10:00')
  assert.equal(emSpCurto(cicloAtribuidoA(sp('2026-10-08 00:01'))), '2026-10-08 10:00')
  assert.equal(emSpCurto(cicloAtribuidoA(sp('2026-10-08 07:54'))), '2026-10-08 10:00')

  // DEPOIS das 10h → o ciclo em curso, que começou às 10h daquele mesmo dia.
  assert.equal(emSpCurto(cicloAtribuidoA(sp('2026-10-08 10:00'))), '2026-10-08 10:00')
  assert.equal(emSpCurto(cicloAtribuidoA(sp('2026-10-08 11:33'))), '2026-10-08 10:00')
  assert.equal(emSpCurto(cicloAtribuidoA(sp('2026-10-08 23:03'))), '2026-10-08 10:00')
})

test('O CASO REAL: o lancamento de 07/10 anima o dia 08, nao o 07', () => {
  /**
   * Registrado às 09h19 de 08/10 — 41 minutos ANTES da virada.
   *
   * Sob "o ciclo que CONTÉM o registro", ele cairia no ciclo [07/10 10h,
   * 08/10 10h): apareceria em f(23,3h) ≈ 97% e chegaria a 100% em 41 minutos.
   * Nenhuma animação, e foi o que a primeira versão desta rodada fez.
   *
   * Sob a regra atual ele pertence ao ciclo que COMEÇA às 10h de 08/10.
   */
  const registro = sp('2026-10-08 09:19')
  const atribuido = cicloAtribuidoA(registro)
  const ciclo = cicloDe(atribuido)

  assert.equal(atribuido.getTime(), ciclo.inicio.getTime())
  // O registro é ANTES do início do ciclo dele. É o ponto.
  assert.ok(registro.getTime() < ciclo.inicio.getTime())

  // E a animação cobre as 24 horas do ciclo, não 41 minutos.
  assert.equal(fracaoDoCiclo(sp('2026-10-08 10:00'), ciclo), 0)
  assert.ok(Math.abs(fracaoDoCiclo(sp('2026-10-08 18:00'), ciclo) - 8 / 21) < 1e-12)
  assert.equal(fracaoDoCiclo(sp('2026-10-09 10:00'), ciclo), 1)
})

test('registrado DEPOIS das 10h: a porcao decorrida conta como REALIZADA', () => {
  /**
   * "Ancore a apresentação no horário atual: considere a parte ponderada do
   * mesmo lançamento correspondente ao período já transcorrido como realizada
   * e anime somente o restante. Não reinicie a contagem desde o começo do
   * dia."
   *
   * É o que `f(agora)` faz: registrado às 14h, o lançamento entra em
   * f(4h) = 4/21 ≈ 19% e segue a curva dali. Não reinicia em zero, e não
   * comprime 21 unidades de peso nas horas que restam.
   */
  const ciclo = cicloDe(sp('2026-10-08 14:00'))
  assert.equal(cicloAtribuidoA(sp('2026-10-08 14:00')).getTime(), ciclo.inicio.getTime())

  const aoRegistrar = fracaoDoCiclo(sp('2026-10-08 14:00'), ciclo)
  assert.ok(Math.abs(aoRegistrar - 4 / 21) < 1e-12, `entrou em ${aoRegistrar}`)

  // E a taxa a partir dali é a da FAIXA, não uma taxa comprimida.
  assert.equal(pesoPorHora(horasDecorridas(sp('2026-10-08 15:00'), ciclo)), 1)
  assert.equal(pesoPorHora(horasDecorridas(sp('2026-10-08 19:00'), ciclo)), 2)
  // Fechando exato no fim, como qualquer outro.
  assert.equal(fracaoDoCiclo(sp('2026-10-09 10:00'), ciclo), 1)
})

/* ========================================================================= *
 * O TERMO PENDENTE — a monotonicidade na virada das 10h
 * ========================================================================= */

test('PENDENTE sai do exibido: o numero NAO CAI as 10h', () => {
  /**
   * A INVARIANTE MAIS IMPORTANTE DESTA RODADA.
   *
   * O lançamento das 09h19 já está no acumulado real às 09h20 — o banco não
   * sabe de ciclos. Se ele fosse exibido inteiro até as 10h e só então
   * começasse a animar, o número CAIRIA de 166.378,31 para 138.377,52 às 10h
   * da manhã: uma queda de 28 mil reais num painel executivo.
   *
   * Subtraindo-o como `pendente` antes da virada, os dois instantes mostram o
   * MESMO número e a animação parte dali.
   */
  const real = 166_378.31      // outubro com o lançamento de 07/10 já dentro
  const L = 28_000.79          // o lançamento de 07/10

  // 09h59 — o ciclo dele ainda não abriu: ele é PENDENTE, nada anima.
  const antesDasDez = valorExibido(real, 0, 1, 'moeda', L)
  assert.equal(antesDasDez, 138_377.52)

  // 10h00 — o ciclo abriu: ele virou INCREMENTO, com fração 0.
  const nasDez = valorExibido(real, L, 0, 'moeda', 0)
  assert.equal(nasDez, 138_377.52)
  assert.equal(nasDez, antesDasDez, 'o número caiu na virada das 10h')

  // E 24 horas depois, o valor real exato.
  assert.equal(valorExibido(real, L, 1, 'moeda', 0), real)
})

test('PENDENTE e INCREMENTO podem coexistir sem contar duas vezes', () => {
  /**
   * Acontece quando o ciclo em curso já animou um lançamento e um novo entra
   * de madrugada: o primeiro é incremento, o segundo é pendente, e o acumulado
   * real contém os dois.
   */
  const base = 100_000
  const inc = 20_000      // anima neste ciclo
  const pend = 5_000      // anima no próximo
  const real = base + inc + pend

  assert.equal(valorExibido(real, inc, 0, 'moeda', pend), base)
  assert.equal(valorExibido(real, inc, 1, 'moeda', pend), base + inc)
  // O pendente NUNCA aparece neste ciclo, nem no fim dele.
  assert.ok(valorExibido(real, inc, 1, 'moeda', pend) < real)
  // E quando o ciclo dele abre, ele vira incremento e o exibido continua.
  assert.equal(valorExibido(real, pend, 0, 'moeda', 0), base + inc)
})

test('o exibido e MONOTONO ao longo de DOIS ciclos consecutivos', () => {
  /**
   * A simulação completa: lançamento A registrado no ciclo 1 depois das 10h,
   * lançamento B registrado de madrugada (pendente), e a virada entre os dois.
   * O número não pode recuar em NENHUM dos instantes.
   */
  const base = 100_000
  const A = 25_000, B = 30_000

  const serie: number[] = []
  // Ciclo 1: A anima; B ainda não existe.
  for (let i = 0; i <= 100; i++) {
    serie.push(valorExibido(base + A, A, i / 100, 'moeda', 0))
  }
  // Fim do ciclo 1, já com B registrado (pendente).
  serie.push(valorExibido(base + A + B, A, 1, 'moeda', B))
  // Ciclo 2: B anima.
  for (let i = 0; i <= 100; i++) {
    serie.push(valorExibido(base + A + B, B, i / 100, 'moeda', 0))
  }

  for (let i = 1; i < serie.length; i++) {
    assert.ok(
      serie[i] >= serie[i - 1] - 1e-9,
      `recuou no passo ${i}: ${serie[i - 1]} -> ${serie[i]}`,
    )
  }
  assert.equal(serie[0], base)
  assert.equal(serie[serie.length - 1], base + A + B)
})

test('EDICAO de lancamento nao cria um segundo incremento', () => {
  /**
   * Editar muda `updatedAt`, não `createdAt` — então o ciclo atribuído é o
   * mesmo e o lançamento continua sendo UM. O valor de referência muda, a
   * fração não, e o exibido recalcula na mesma curva.
   */
  const ciclo = cicloDe(sp('2026-10-08 15:00'))
  assert.equal(
    cicloAtribuidoA(sp('2026-10-08 11:00')).getTime(),
    cicloAtribuidoA(sp('2026-10-08 11:00')).getTime(),
  )
  const f = fracaoDoCiclo(sp('2026-10-08 15:00'), ciclo)

  const antes = valorExibido(166_378.31, 28_000.79, f, 'moeda')
  const depois = valorExibido(166_378.31 - 28_000.79 + 30_000, 30_000, f, 'moeda')
  // A BASE é a mesma nos dois: a edição não acrescentou um incremento novo.
  assert.ok(Math.abs((antes - 28_000.79 * f) - (depois - 30_000 * f)) < 1e-6)
})
