/**
 * PROJEÇÃO INTRADIÁRIA — a camada de APRESENTAÇÃO dos quatro KPIs de volume.
 *
 * ── O QUE ISTO É, E O QUE NÃO É ─────────────────────────────────────────
 *
 * Os dados operacionais da Bass Pago são lançados À MÃO, uma vez por dia,
 * referentes ao dia anterior. A plataforma NÃO recebe eventos transacionais em
 * tempo real, e nada neste arquivo finge o contrário.
 *
 * O que ele faz é distribuir um volume JÁ LANÇADO ao longo do ciclo
 * operacional, para que o painel pare de saltar do nada para o total integral
 * no instante em que o lançamento é salvo. É um impostômetro: o número cresce
 * continuamente porque o total é conhecido, não porque algo está chegando.
 *
 * ── A SEPARAÇÃO DE CAMADAS É A REGRA MAIS IMPORTANTE AQUI ───────────────
 *
 * O banco guarda SÓ o lançamento real. Nada neste módulo escreve, agenda ou
 * materializa nada. A projeção é uma função PURA do instante e do valor
 * lançado — e é por isso que ela pode ser calculada no servidor, no
 * navegador, em dois dispositivos ao mesmo tempo, e dar o mesmo resultado.
 *
 * Previsão, relatórios, Metas, CP / CR, auditoria e qualquer outro módulo
 * continuam lendo os valores REAIS. A projeção existe nos quatro KPIs desta
 * lista e em nenhum outro lugar.
 *
 * ── O CICLO ─────────────────────────────────────────────────────────────
 *
 * 10h00 de um dia às 10h00 do dia seguinte, em America/Sao_Paulo.
 *
 * O fuso NÃO é derivado do relógio de quem abre a tela: é fixo e lido com
 * `Intl`, que conhece as regras do fuso (inclusive as históricas, de quando o
 * Brasil tinha horário de verão). Fixar "UTC−3" na mão daria o número errado
 * para qualquer data anterior a 2019 e quebraria de novo se o horário de
 * verão voltasse.
 *
 * ── A DISTRIBUIÇÃO PONDERADA ────────────────────────────────────────────
 *
 * O crescimento não é uniforme: das 18h às 20h ele é DUAS VEZES mais rápido.
 * E isso não pode ser "multiplicar por dois nesse intervalo" — o total
 * estouraria o valor lançado. A aceleração entra na DISTRIBUIÇÃO:
 *
 *   10h–18h    8 horas × peso 1  =  8
 *   18h–20h    2 horas × peso 2  =  4
 *   20h–10h   14 horas × peso 1  = 14
 *                                 ──
 *                            total 26 unidades de peso
 *
 *   taxa normal  = valor / 26  por hora
 *   taxa de pico = valor / 13  por hora   (exatamente o dobro)
 *
 * A soma das 24 horas ponderadas é 26/26 = 1, então o acumulado fecha
 * EXATAMENTE no valor lançado às 10h do dia seguinte. Nunca antes, nunca
 * acima.
 *
 * ── DETERMINÍSTICO, E A PALAVRA É LITERAL ───────────────────────────────
 *
 * Nenhum `Math.random()`, nenhum incremento por renderização, nenhuma
 * dependência de quando a tela foi aberta. O valor é `f(instante, total)` — e
 * é só isso. Duas abas, dois navegadores e o servidor chegam no mesmo número
 * para o mesmo segundo.
 */

export const FUSO_OPERACIONAL = 'America/Sao_Paulo'

/** A hora, no fuso operacional, em que um ciclo começa e o anterior termina. */
export const HORA_INICIO_CICLO = 10

/** A janela de pico, em horas do fuso operacional. */
export const PICO_INICIO = 18
export const PICO_FIM = 20
export const FATOR_PICO = 2

const HORAS_DO_CICLO = 24
const HORA_MS = 3_600_000

/**
 * O peso total do ciclo: 8×1 + 2×2 + 14×1.
 *
 * Exportado porque é o denominador da taxa, e os testes o prendem: mudar a
 * janela de pico sem mudar este número produziria uma curva que não fecha no
 * valor lançado.
 */
export const PESO_TOTAL =
  (PICO_INICIO - HORA_INICIO_CICLO) * 1
  + (PICO_FIM - PICO_INICIO) * FATOR_PICO
  + (HORAS_DO_CICLO - (PICO_FIM - HORA_INICIO_CICLO)) * 1

/* ========================================================================= *
 * O FUSO
 * ========================================================================= */

export interface PartesLocais {
  ano: number
  mes: number
  dia: number
  hora: number
  minuto: number
  segundo: number
}

const FORMATADOR = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_OPERACIONAL,
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

/** As partes do calendário de um instante, no fuso operacional. */
export function partesNoFuso(d: Date): PartesLocais {
  const p: Record<string, string> = {}
  for (const parte of FORMATADOR.formatToParts(d)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value
  }
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // `hour12: false` pode devolver "24" para a meia-noite em alguns
    // runtimes. 24 e 0 são o mesmo instante; normalizar aqui evita um ciclo
    // que começa no dia errado.
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
  }
}

/**
 * O deslocamento do fuso, em minutos, NO INSTANTE informado.
 *
 * Em minutos e não em horas porque existem fusos de meia hora, e porque é o
 * que a conversão inversa precisa. Positivo a leste de Greenwich.
 */
export function offsetMinutos(d: Date): number {
  const l = partesNoFuso(d)
  const comoUtc = Date.UTC(l.ano, l.mes - 1, l.dia, l.hora, l.minuto, l.segundo)
  // O segundo é truncado nas partes; descontar os milissegundos do instante
  // original mantém a diferença em múltiplos de minuto.
  return Math.round((comoUtc - (d.getTime() - d.getMilliseconds())) / 60_000)
}

/**
 * O INSTANTE (UTC) de um horário de parede no fuso operacional.
 *
 * ── POR QUE DUAS ITERAÇÕES ────────────────────────────────────────────
 *
 * Para saber o deslocamento do fuso é preciso um instante; para achar o
 * instante é preciso o deslocamento. A saída é começar tratando o horário de
 * parede como se fosse UTC, medir o deslocamento ali, corrigir, e medir de
 * novo no instante corrigido.
 *
 * A segunda medição importa só nas viradas de horário de verão — onde o
 * deslocamento do palpite e o do instante real são diferentes. O Brasil não
 * tem horário de verão desde 2019, mas o ciclo é lido também para datas
 * passadas, e a volta da regra não deve exigir mexer aqui.
 */
export function instanteNoFuso(
  ano: number, mes: number, dia: number, hora: number,
  minuto = 0, segundo = 0,
): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo)
  const off1 = offsetMinutos(new Date(palpite))
  const off2 = offsetMinutos(new Date(palpite - off1 * 60_000))
  return new Date(palpite - off2 * 60_000)
}

/* ========================================================================= *
 * O CICLO
 * ========================================================================= */

export interface Ciclo {
  /** Primeiro instante do ciclo: 10h00 do fuso operacional. */
  inicio: Date
  /** Limite superior EXCLUSIVO: 10h00 do dia seguinte. */
  fim: Date
}

/**
 * O ciclo operacional que CONTÉM o instante informado.
 *
 * Antes das 10h, o instante pertence ao ciclo que começou no dia anterior —
 * é o que faz a madrugada continuar sendo "o ciclo de ontem", que é como a
 * operação a lê.
 */
export function cicloDe(agora: Date): Ciclo {
  const l = partesNoFuso(agora)
  const inicio = l.hora >= HORA_INICIO_CICLO
    ? instanteNoFuso(l.ano, l.mes, l.dia, HORA_INICIO_CICLO)
    : // O dia anterior, obtido por aritmética de calendário e não subtraindo
      // 24h do instante: 24h antes de uma virada de horário de verão cai em
      // outra hora de parede.
      (() => {
        const d = new Date(Date.UTC(l.ano, l.mes - 1, l.dia))
        d.setUTCDate(d.getUTCDate() - 1)
        return instanteNoFuso(
          d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), HORA_INICIO_CICLO,
        )
      })()

  const p = partesNoFuso(inicio)
  const seguinte = new Date(Date.UTC(p.ano, p.mes - 1, p.dia))
  seguinte.setUTCDate(seguinte.getUTCDate() + 1)
  const fim = instanteNoFuso(
    seguinte.getUTCFullYear(), seguinte.getUTCMonth() + 1, seguinte.getUTCDate(),
    HORA_INICIO_CICLO,
  )

  return { inicio, fim }
}

/* ========================================================================= *
 * A CURVA
 * ========================================================================= */

/**
 * O peso ACUMULADO desde o início do ciclo, em unidades de peso (0 a 26).
 *
 * `h` são horas decorridas desde as 10h, em fração. A curva é contínua e
 * monótona: três trechos lineares, com a inclinação dobrada no do meio.
 *
 *   h ∈ [0, 8]    10h–18h    peso 1   →  W = h
 *   h ∈ (8, 10]   18h–20h    peso 2   →  W = 8 + 2(h−8)
 *   h ∈ (10, 24]  20h–10h    peso 1   →  W = 12 + (h−10)
 *
 * W(24) = 26 = PESO_TOTAL, que é o que faz a fração fechar em 1.
 */
export function pesoAcumulado(h: number): number {
  if (h <= 0) return 0
  if (h >= HORAS_DO_CICLO) return PESO_TOTAL

  const inicioPico = PICO_INICIO - HORA_INICIO_CICLO   // 8
  const fimPico = PICO_FIM - HORA_INICIO_CICLO         // 10

  if (h <= inicioPico) return h
  if (h <= fimPico) return inicioPico + FATOR_PICO * (h - inicioPico)
  return inicioPico + FATOR_PICO * (fimPico - inicioPico) + (h - fimPico)
}

/**
 * A taxa INSTANTÂNEA, em unidades de peso por hora: 1 fora do pico, 2 dentro.
 *
 * Existe para os testes poderem afirmar "entre 18h e 20h a velocidade é
 * exatamente o dobro" sobre a derivada, e não sobre uma diferença aproximada.
 */
export function pesoPorHora(h: number): number {
  if (h < 0 || h >= HORAS_DO_CICLO) return 0
  const inicioPico = PICO_INICIO - HORA_INICIO_CICLO
  const fimPico = PICO_FIM - HORA_INICIO_CICLO
  return h >= inicioPico && h < fimPico ? FATOR_PICO : 1
}

/** Horas decorridas do ciclo, em fração. Negativo antes do início. */
export function horasDecorridas(agora: Date, ciclo: Ciclo): number {
  return (agora.getTime() - ciclo.inicio.getTime()) / HORA_MS
}

/**
 * A FRAÇÃO do volume do ciclo já acumulada: 0 no início, 1 no fim.
 *
 * É a única função que a tela precisa. Tudo o mais — o fuso, os pesos, o
 * pico — está dentro dela.
 */
export function fracaoDoCiclo(agora: Date, ciclo: Ciclo): number {
  const f = pesoAcumulado(horasDecorridas(agora, ciclo)) / PESO_TOTAL
  return f < 0 ? 0 : f > 1 ? 1 : f
}

/**
 * A taxa de crescimento de um valor, por hora, no instante informado.
 *
 * Só para a tela poder declarar o ritmo e para os testes. O valor exibido
 * nunca é integrado a partir daqui — é sempre `valor × fração`, que não
 * acumula erro.
 */
export function taxaPorHora(valor: number, agora: Date, ciclo: Ciclo): number {
  return (valor / PESO_TOTAL) * pesoPorHora(horasDecorridas(agora, ciclo))
}

/* ========================================================================= *
 * A PROJEÇÃO DE UM VALOR
 * ========================================================================= */

/**
 * O valor projetado de uma grandeza CONTÍNUA (TPV, receita tarifária).
 *
 * Mantém a precisão inteira do cálculo: o arredondamento é da formatação, não
 * daqui. Com `valor` negativo — se o modelo algum dia permitir — a projeção
 * caminha de 0 até o valor, sem passar dele: `|valor × f| ≤ |valor|` para
 * qualquer `f ∈ [0, 1]`.
 */
export function projetarContinuo(valor: number, fracao: number): number {
  if (!Number.isFinite(valor) || !Number.isFinite(fracao)) return 0
  const v = valor * (fracao < 0 ? 0 : fracao > 1 ? 1 : fracao)
  // `-0` NORMALIZADO PARA `0`. Um valor negativo multiplicado por zero dá
  // `-0` em JavaScript, e o formatador o imprimiria como "-R$ 0,00" — um
  // sinal de menos num número que é zero.
  return v === 0 ? 0 : v
}

/**
 * O valor projetado de uma CONTAGEM (transações, MEDs).
 *
 * Trunca para o inteiro, nunca arredonda para cima: meia transação não
 * existe, e exibir 173 quando só 172,6 "aconteceram" ultrapassaria o
 * acumulado real por um instante. Em `f = 1` o truncamento é inócuo, porque
 * o valor lançado já é inteiro.
 *
 * O truncamento é SÓ da apresentação — `fracaoDoCiclo` continua contínua, e é
 * ela que avança. Arredondar a fração travaria o contador.
 */
export function projetarContagem(valor: number, fracao: number): number {
  const bruto = projetarContinuo(valor, fracao)
  // Trunca PARA ZERO nos dois sentidos: `Math.ceil(-0.6)` é −0, e `-0` seria
  // impresso com sinal. A normalização é a mesma de `projetarContinuo`.
  const n = bruto < 0 ? Math.ceil(bruto) : Math.floor(bruto)
  return n === 0 ? 0 : n
}

/** Os quatro KPIs que recebem a projeção. Conjunto FECHADO. */
export const KPIS_PROJETADOS = ['tpv', 'receita', 'transacoes', 'med'] as const
export type KpiProjetado = typeof KPIS_PROJETADOS[number]

/** O tipo de grandeza de cada um — decide truncamento e formatação. */
export const GRANDEZA_DO_KPI: Record<KpiProjetado, 'moeda' | 'contagem'> = {
  tpv: 'moeda',
  receita: 'moeda',
  transacoes: 'contagem',
  med: 'contagem',
}

/** Volume de um ciclo, nos quatro KPIs. */
export interface VolumeCiclo {
  tpv: number
  receita: number
  transacoes: number
  med: number
}

export const VOLUME_ZERO: VolumeCiclo = { tpv: 0, receita: 0, transacoes: 0, med: 0 }

/**
 * O valor a EXIBIR: a parte já consolidada mais a fatia projetada do ciclo.
 *
 *   exibido(t) = (real − incremento) + incremento × f(t)
 *
 * ── POR QUE A CONTA É ESTA, E NÃO `real × f` ──────────────────────────
 *
 * Os KPIs da Home e do Conselho são ACUMULADOS (do mês, ou de todos os meses
 * lançados). Multiplicar o acumulado pela fração transformaria o mês inteiro
 * numa animação diária — e no dia 20 o painel mostraria 1/26 do mês às 11h da
 * manhã, o que é simplesmente falso.
 *
 * O que cresce é só o INCREMENTO do ciclo: o volume que entrou no painel
 * agora. O resto do acumulado é dado fechado e aparece inteiro.
 *
 * ── E É ISSO QUE GARANTE QUE O NÚMERO NUNCA CAI ──────────────────────
 *
 * No instante em que o ciclo vira, `f` volta a 0 — mas o incremento do novo
 * ciclo também sai do acumulado, então o exibido continua exatamente onde o
 * ciclo anterior o deixou. Um painel executivo que recua 250 mil transações
 * às 10h da manhã seria lido como falha, não como animação.
 */
export function valorExibido(
  real: number, incremento: number, fracao: number, grandeza: 'moeda' | 'contagem',
): number {
  const base = real - incremento
  const fatia = grandeza === 'contagem'
    ? projetarContagem(incremento, fracao)
    : projetarContinuo(incremento, fracao)
  return base + fatia
}
