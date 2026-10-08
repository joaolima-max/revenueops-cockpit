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
 * ── A QUAL CICLO UM LANÇAMENTO PERTENCE ─────────────────────────────────
 *
 * Ao ciclo que começa às 10h00 do DIA EM QUE ELE FOI REGISTRADO.
 *
 * É o que resolve o caso real: o lançamento de 07/10 foi registrado às 09h19
 * de 08/10 — 41 minutos ANTES da virada. Sob a regra "o ciclo que contém o
 * registro", ele cairia no ciclo que estava acabando e chegaria a 100% quase
 * de imediato, sem animação nenhuma. Sob esta regra, ele pertence ao ciclo que
 * começa às 10h de 08/10 e anima o dia inteiro.
 *
 * Um lançamento registrado DEPOIS das 10h pertence ao ciclo em curso, e a
 * porção já decorrida da curva conta como REALIZADA: ele aparece em `f(agora)`
 * e segue dali. Não se reinicia a contagem — ver `valorExibido`.
 *
 * ── E ENQUANTO O CICLO DELE NÃO COMEÇA, ELE FICA DE FORA ────────────────
 *
 * Um lançamento registrado às 09h19 já está no acumulado real às 09h20. Se ele
 * fosse exibido inteiro até as 10h e só então começasse a animar, o número
 * CAIRIA na virada. Então, enquanto o ciclo dele não começa, ele é subtraído
 * do exibido — é o `pendente` de `valorExibido`.
 *
 * O fuso NÃO é derivado do relógio de quem abre a tela: é fixo e lido com
 * `Intl`, que conhece as regras do fuso (inclusive as históricas, de quando o
 * Brasil tinha horário de verão). Fixar "UTC−3" na mão daria o número errado
 * para qualquer data anterior a 2019 e quebraria de novo se o horário de
 * verão voltasse.
 *
 * ── A DISTRIBUIÇÃO PONDERADA ────────────────────────────────────────────
 *
 * O crescimento não é uniforme: ele segue o RITMO DA OPERAÇÃO ao longo do dia,
 * com pico no começo da noite e quase parada na madrugada.
 *
 *   10h–18h    8 horas × 1,0  =  8,0      dia comercial
 *   18h–20h    2 horas × 2,0  =  4,0      PICO
 *   20h–22h    2 horas × 1,0  =  2,0      noite
 *   22h–00h    2 horas × 0,8  =  1,6      desaceleração
 *   00h–06h    6 horas × 0,3  =  1,8      madrugada
 *   06h–08h    2 horas × 0,8  =  1,6      retomada
 *   08h–10h    2 horas × 1,0  =  2,0      manhã
 *                               ────
 *                         total 21,0 unidades de peso
 *
 *   taxa base         = valor / 21        por hora
 *   taxa de pico      = 2 × valor / 21    por hora  (o dobro da base)
 *   taxa de madrugada = 0,3 × valor / 21  por hora
 *
 * E isso não pode ser "multiplicar por dois no pico" — o total estouraria o
 * valor lançado. A aceleração e a desaceleração entram na DISTRIBUIÇÃO: a soma
 * das 24 horas ponderadas é 21/21 = 1, então o acumulado fecha EXATAMENTE no
 * valor lançado às 10h do dia seguinte. Nunca antes, nunca acima.
 *
 * ── OS PESOS SÃO CONTADOS EM DÉCIMOS, E ISSO É DELIBERADO ───────────────
 *
 * `0,8` e `0,3` não têm representação binária exata: `6 × 0,3` dá
 * 1,7999999999999998, não 1,8.
 *
 * SEJAMOS PRECISOS SOBRE O QUE ISSO CUSTA HOJE: nada. Com estes sete
 * multiplicadores os resíduos se cancelam, e tanto o total quanto o acumulado
 * em cada fronteira caem no número exato mesmo em ponto flutuante. A conta
 * decimal daria o mesmo resultado.
 *
 * A razão dos décimos é a PRÓXIMA mudança de perfil, não esta. Trocar a
 * madrugada de 0,3 para 0,7 faz `3 × 0,7` virar 2,0999999999999996 — e a
 * fração no fim do ciclo deixa de fechar em 1. O painel pararia a um centavo
 * do valor lançado, para sempre, e o defeito não apareceria em teste nenhum
 * que não medisse a última casa.
 *
 * Em décimos inteiros (10, 20, 10, 8, 3, 8, 10) o total é 210 e o acumulado é
 * exato para QUALQUER multiplicador de uma casa decimal. É o que torna mexer
 * no perfil uma operação segura. Os decimais existem para leitura; a conta é
 * inteira.
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

const HORAS_DO_CICLO = 24
const HORA_MS = 3_600_000

/**
 * O PERFIL DE VELOCIDADE do ciclo — as sete faixas, na ordem do relógio.
 *
 * `ate` é a hora de parede em que a faixa TERMINA, contada a partir das 10h e
 * podendo passar da meia-noite (22h → 24, 00h → 24, 06h → 30). Contar em
 * "horas desde o início do ciclo" em vez de hora de parede é o que faz a
 * madrugada não precisar de caso especial: 00h–06h é simplesmente [14, 20).
 *
 * `peso10` é o multiplicador em DÉCIMOS. Ver o cabeçalho para por que a conta
 * é inteira: `6 × 0,3` em ponto flutuante não fecha o ciclo em 1.
 */
export interface FaixaRitmo {
  /** Hora de parede em que a faixa começa, no fuso operacional. */
  horaInicio: number
  /** Horas decorridas do ciclo em que a faixa começa (0 = 10h). */
  de: number
  /** Horas decorridas do ciclo em que a faixa termina (exclusivo). */
  ate: number
  /** O multiplicador, para leitura. */
  multiplicador: number
  /** O multiplicador em décimos — é com ele que a conta é feita. */
  peso10: number
  /** Para a tela poder nomear a faixa. */
  rotulo: string
}

/**
 * AS SETE FAIXAS. Conjunto FECHADO e contíguo: cobrem as 24 horas sem buraco
 * e sem sobreposição, e `verificarPerfil` prende isso.
 */
export const PERFIL_RITMO: readonly FaixaRitmo[] = [
  { horaInicio: 10, de: 0,  ate: 8,  multiplicador: 1.0, peso10: 10, rotulo: 'dia comercial' },
  { horaInicio: 18, de: 8,  ate: 10, multiplicador: 2.0, peso10: 20, rotulo: 'pico' },
  { horaInicio: 20, de: 10, ate: 12, multiplicador: 1.0, peso10: 10, rotulo: 'noite' },
  { horaInicio: 22, de: 12, ate: 14, multiplicador: 0.8, peso10: 8,  rotulo: 'desaceleração' },
  { horaInicio: 0,  de: 14, ate: 20, multiplicador: 0.3, peso10: 3,  rotulo: 'madrugada' },
  { horaInicio: 6,  de: 20, ate: 22, multiplicador: 0.8, peso10: 8,  rotulo: 'retomada' },
  { horaInicio: 8,  de: 22, ate: 24, multiplicador: 1.0, peso10: 10, rotulo: 'manhã' },
]

/** A faixa de PICO, nomeada para a tela e para os testes. */
export const PICO_INICIO = 18
export const PICO_FIM = 20
export const FATOR_PICO = 2

/**
 * O peso total do ciclo, em DÉCIMOS: 210.
 *
 * Derivado das faixas, não digitado. Mudar uma faixa sem recalcular o total
 * produziria uma curva que não fecha no valor lançado — e o painel
 * ultrapassaria ou ficaria abaixo do número real.
 */
export const PESO_TOTAL_10 = PERFIL_RITMO.reduce(
  (a, f) => a + f.peso10 * (f.ate - f.de), 0,
)

/** O peso total em unidades de peso: 21,0. Só para leitura e para a tela. */
export const PESO_TOTAL = PESO_TOTAL_10 / 10

/**
 * O perfil é íntegro?
 *
 * Três condições, e nenhuma delas é óbvia ao olhar a tabela: as faixas têm de
 * ser CONTÍGUAS (sem buraco, sem sobreposição), começar em 0 e terminar em 24.
 * Um buraco faria a curva parar; uma sobreposição a faria contar duas vezes; e
 * qualquer dos dois estragaria o fechamento no valor real.
 *
 * Exportada para o teste poder exercitá-la, e chamada em tempo de módulo para
 * que um perfil quebrado não chegue à tela.
 */
export function verificarPerfil(faixas: readonly FaixaRitmo[] = PERFIL_RITMO): void {
  if (faixas.length === 0) throw new Error('perfil de ritmo vazio')
  if (faixas[0].de !== 0) throw new Error('o perfil não começa em 0')
  for (let i = 1; i < faixas.length; i++) {
    if (faixas[i].de !== faixas[i - 1].ate) {
      throw new Error(
        `perfil descontínuo entre ${faixas[i - 1].rotulo} e ${faixas[i].rotulo}`,
      )
    }
  }
  if (faixas[faixas.length - 1].ate !== HORAS_DO_CICLO) {
    throw new Error('o perfil não termina em 24 horas')
  }
}

verificarPerfil()

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

/**
 * A QUAL CICLO um lançamento pertence — o início do ciclo dele.
 *
 * Ao ciclo que começa às 10h00 do DIA EM QUE ELE FOI REGISTRADO, no fuso
 * operacional. Nada mais: nem a competência, nem o ciclo que contém o
 * registro.
 *
 * ── O CASO REAL QUE ESTA REGRA RESOLVE ────────────────────────────────
 *
 * O lançamento referente a 07/10 foi registrado às 09h19 de 08/10 — 41
 * minutos ANTES da virada. Sob "o ciclo que contém o registro", ele cairia no
 * ciclo que estava acabando: apareceria em f(23,3h) ≈ 97% e chegaria a 100%
 * em 41 minutos. Nenhuma animação.
 *
 * Com esta regra ele pertence ao ciclo que COMEÇA às 10h de 08/10, e anima as
 * 24 horas seguintes. É o que o pedido descreve: "um lançamento registrado
 * antes das 10h pertence ao próximo ciclo que começa às 10h".
 *
 * ── E DEPOIS DAS 10H? ─────────────────────────────────────────────────
 *
 * Registrado às 11h, pertence ao ciclo que começou às 10h daquele mesmo dia —
 * o que está em curso. A porção já decorrida conta como REALIZADA (ver
 * `valorExibido`), então ele entra em `f(agora)` e segue a curva dali. Os
 * dois casos saem da mesma linha de código, porque os dois são "as 10h do dia
 * do registro".
 */
export function cicloAtribuidoA(registradoEm: Date): Date {
  const l = partesNoFuso(registradoEm)
  return instanteNoFuso(l.ano, l.mes, l.dia, HORA_INICIO_CICLO)
}

/* ========================================================================= *
 * A CURVA
 * ========================================================================= */

/**
 * O peso ACUMULADO desde o início do ciclo, em DÉCIMOS (0 a 210).
 *
 * `h` são horas decorridas desde as 10h, em fração. A curva é contínua e
 * monótona: sete trechos lineares, cada um com a inclinação da sua faixa.
 *
 *   h ∈ [0,  8)   10h–18h   ×1,0
 *   h ∈ [8,  10)  18h–20h   ×2,0   PICO
 *   h ∈ [10, 12)  20h–22h   ×1,0
 *   h ∈ [12, 14)  22h–00h   ×0,8
 *   h ∈ [14, 20)  00h–06h   ×0,3   madrugada
 *   h ∈ [20, 22)  06h–08h   ×0,8
 *   h ∈ [22, 24]  08h–10h   ×1,0
 *
 * W(24) = 210 = PESO_TOTAL_10, que é o que faz a fração fechar em 1.
 *
 * ── A CONTINUIDADE É POR CONSTRUÇÃO, NÃO POR SORTE ────────────────────
 *
 * O acumulado de cada faixa parte do acumulado das anteriores e cresce
 * linearmente dentro dela. Nas fronteiras os dois lados chegam ao mesmo
 * número, então não há salto — nem às 18h, nem às 22h, nem à MEIA-NOITE, que
 * é apenas a fronteira h=14 como qualquer outra. A inclinação muda; o valor,
 * não.
 *
 * E é MONÓTONA porque todo `peso10` é positivo: mesmo na madrugada, com 0,3, o
 * acumulado continua subindo. Uma faixa com peso zero faria o painel congelar
 * por seis horas e ser lido como travado.
 */
export function pesoAcumulado10(h: number): number {
  if (h <= 0) return 0
  if (h >= HORAS_DO_CICLO) return PESO_TOTAL_10

  let acumulado = 0
  for (const f of PERFIL_RITMO) {
    if (h >= f.ate) {
      acumulado += f.peso10 * (f.ate - f.de)
      continue
    }
    // Dentro desta faixa: o que já passou dela, na inclinação dela.
    return acumulado + f.peso10 * (h - f.de)
  }
  return PESO_TOTAL_10
}

/**
 * O peso acumulado em unidades de peso (0 a 21,0).
 *
 * Só para leitura e para os testes: a fração usa a versão em décimos, porque é
 * ela que fecha exatamente.
 */
export function pesoAcumulado(h: number): number {
  return pesoAcumulado10(h) / 10
}

/** A faixa de ritmo vigente em `h` horas de ciclo. `null` fora do ciclo. */
export function faixaEm(h: number): FaixaRitmo | null {
  if (h < 0 || h >= HORAS_DO_CICLO) return null
  return PERFIL_RITMO.find((f) => h >= f.de && h < f.ate) ?? null
}

/**
 * A taxa INSTANTÂNEA, em unidades de peso por hora: o multiplicador da faixa.
 *
 * Existe para os testes poderem afirmar "no pico a velocidade é exatamente o
 * dobro da base" e "na madrugada é 0,3" sobre a DERIVADA, e não sobre uma
 * diferença aproximada.
 */
export function pesoPorHora(h: number): number {
  return faixaEm(h)?.multiplicador ?? 0
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
  // EM DÉCIMOS, e por isso exata nas pontas: `pesoAcumulado10(24)` é
  // literalmente `PESO_TOTAL_10`, então a divisão dá 1 sem resíduo. Com os
  // multiplicadores decimais em ponto flutuante, `6 × 0,3` deixaria a fração
  // final em 0,9999999999999998 — e o painel pararia a um centavo do valor
  // lançado.
  const f = pesoAcumulado10(horasDecorridas(agora, ciclo)) / PESO_TOTAL_10
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

/** A taxa BASE, por hora: o que vale uma faixa de multiplicador 1,0. */
export function taxaBasePorHora(valor: number): number {
  return valor / PESO_TOTAL
}

/**
 * A TAXA MÁXIMA de um valor ao longo do ciclo, por segundo.
 *
 * É a taxa da faixa mais rápida — o pico, ×2. Serve para responder a uma
 * pergunta de APRESENTAÇÃO, não de cálculo: de quanto em quanto tempo a tela
 * precisa reamostrar a curva para não pular um inteiro?
 */
export function taxaMaximaPorSegundo(valor: number): number {
  const maior = PERFIL_RITMO.reduce((a, f) => Math.max(a, f.multiplicador), 0)
  return Math.abs(valor) * maior / PESO_TOTAL / 3600
}

/**
 * O INTERVALO MÁXIMO de amostragem que garante nenhum inteiro pulado, em ms.
 *
 * ── A GARANTIA É ARITMÉTICA, NÃO VISUAL ────────────────────────────────
 *
 * `projetarContagem` é `floor` de uma curva contínua e crescente. Se entre
 * duas amostras o valor subjacente cresce MENOS de 1, o `floor` só pode
 * repetir ou avançar exatamente 1 — nunca dois:
 *
 *   x(t₂) − x(t₁) < 1  ⟹  floor(x(t₂)) − floor(x(t₁)) ∈ {0, 1}
 *
 * Então não há interpolação a fazer: basta amostrar mais fino que este
 * intervalo. Com o lançamento real de 07/10 (265.483 transações) ele é de
 * ~142 ms, e um quadro de animação são ~16,7 ms — oito quadros por inteiro.
 *
 * `Infinity` para valor zero: nada cresce, nada pula.
 */
export function intervaloMaximoSemSalto(valor: number): number {
  const porSegundo = taxaMaximaPorSegundo(valor)
  return porSegundo === 0 ? Infinity : 1000 / porSegundo
}

/**
 * Quantos quadros por segundo seriam necessários para não pular nenhum inteiro.
 *
 * É só a taxa máxima, dita na unidade em que a decisão é tomada. Com o
 * lançamento real de 07/10 são 7,02 — e a tela tem 60.
 */
export function quadrosNecessariosPorSegundo(valor: number): number {
  return taxaMaximaPorSegundo(valor)
}

/**
 * O intervalo EFETIVO de um quadro, em ms — o PIOR caso, não a média.
 *
 * ── POR QUE NÃO É SIMPLESMENTE 1000/fps ────────────────────────────────
 *
 * `Date.now()` devolve milissegundo INTEIRO, e é dele que a amostragem vem.
 * A 60 Hz os quadros não caem a cada 16,667 ms: caem em 16, 17, 17, 16, 17,
 * 17… — a sequência de inteiros mais próxima.
 *
 * A garantia de não pular inteiro tem de valer no PIOR quadro, não no médio.
 * Arredondar para cima é a diferença entre uma garantia e uma estimativa — e
 * foi exatamente o que o teste de otimalidade pegou numa primeira versão
 * desta função, que usava 16,667 e por isso prometia sequência completa num
 * volume em que o quadro de 17 ms já saltava dois.
 */
export function intervaloEfetivoDoQuadro(quadrosPorSegundo: number): number {
  return Math.ceil(1000 / quadrosPorSegundo)
}

/**
 * O VOLUME DIÁRIO acima do qual uma taxa de quadros não dá mais conta.
 *
 * A 60 quadros por segundo (pior quadro de 17 ms): ~2.223.529 de contagem no
 * dia. Hoje o lançamento é de 265.483 — margem de 8,4×.
 *
 * A 120 Hz (pior quadro de 9 ms) o teto é de 4.200.000, e o
 * `requestAnimationFrame` acompanha o dispositivo sem mudança de código.
 */
export function volumeMaximoSemSalto(quadrosPorSegundo: number): number {
  const maior = PERFIL_RITMO.reduce((a, f) => Math.max(a, f.multiplicador), 0)
  const intervalo = intervaloEfetivoDoQuadro(quadrosPorSegundo)
  return (1000 * PESO_TOTAL * 3600) / (maior * intervalo)
}

/**
 * O MÍNIMO de inteiros que QUALQUER implementação fiel ao instante pularia,
 * amostrando a cada `intervaloMs`.
 *
 * ── POR QUE ESTA FUNÇÃO EXISTE ─────────────────────────────────────────
 *
 * Para separar duas coisas que são fáceis de confundir: um limite da NOSSA
 * implementação e um limite do DISPOSITIVO.
 *
 * Uma tela pinta no máximo `1/Δ` vezes por segundo. Se a contagem cresce mais
 * rápido que isso, não existe implementação que mostre todos os inteiros — não
 * há onde pintá-los. O teto é físico, não de projeto:
 *
 *   inteiros por segundo que a tela pode mostrar  =  1/Δ
 *   inteiros por segundo que a curva produz       =  r
 *   r ≤ 1/Δ  ⟹  sequência completa
 *   r > 1/Δ  ⟹  impossível, em qualquer implementação fiel
 *
 * Devolve `floor(r · Δ)` — zero enquanto o quadro dá conta, e exatamente o
 * número de inteiros que a física obriga a saltar acima disso.
 *
 * ── E É POR ISSO QUE A AMOSTRAGEM POR QUADRO É O ÓTIMO ─────────────────
 *
 * Nossa implementação amostra a curva uma vez por quadro de pintura, então ela
 * mostra TODOS os inteiros que o dispositivo é capaz de mostrar. Não há
 * abordagem melhor disponível:
 *
 *   - pintar mais rápido que a tela é impossível;
 *   - um contador que ande um inteiro por quadro independentemente do relógio
 *     mostraria mais números, mas ficaria ATRASADO em relação ao instante —
 *     dois dispositivos deixariam de concordar, recarregar a página daria
 *     outro valor, e o ciclo não fecharia às 10h no número lançado.
 *
 * O pedido proíbe explicitamente a segunda. Então o ótimo fiel é este, e
 * `tests/projecao-animacao.test.ts` prova que a implementação o alcança.
 *
 * ── UM BÔNUS DE `requestAnimationFrame` ────────────────────────────────
 *
 * O teto acompanha o DISPOSITIVO. Numa tela de 120 Hz o rAF roda a 120 quadros
 * por segundo e o teto dobra, sem nenhuma mudança de código — é o que um
 * `setInterval(16)` fixo não daria.
 */
export function saltoMinimoInevitavel(valor: number, intervaloMs: number): number {
  const porSegundo = taxaMaximaPorSegundo(valor)
  // O PIOR quadro: `Date.now()` é inteiro, então um intervalo de 16,667 ms
  // cai em quadros de 16 e de 17. Ver `intervaloEfetivoDoQuadro`.
  return Math.floor((porSegundo * Math.ceil(intervaloMs)) / 1000)
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
 *
 * ── O TERMO `pendente`, E POR QUE ELE É NECESSÁRIO ──────────────────
 *
 *   exibido(t) = (real − incremento − pendente) + incremento × f(t)
 *
 * `pendente` é o volume JÁ REGISTRADO cujo ciclo ainda NÃO COMEÇOU — o
 * lançamento das 09h19 enquanto o relógio ainda não bateu 10h.
 *
 * Ele já está no acumulado real (o banco não sabe de ciclos), e sem este
 * termo o número cairia na virada: às 09h59 o painel mostraria o acumulado
 * COM ele, e às 10h00 passaria a mostrar o acumulado SEM ele, para começar a
 * animá-lo. Uma queda de 28 mil reais às 10h da manhã.
 *
 * Subtraindo-o antes, o exibido às 09h59 e às 10h00 é o MESMO número, e a
 * animação parte dali. É a mesma razão do termo `incremento`, uma hora antes.
 */
export function valorExibido(
  real: number,
  incremento: number,
  fracao: number,
  grandeza: 'moeda' | 'contagem',
  /**
   * O volume já REGISTRADO cujo ciclo ainda não começou.
   *
   * Sai do exibido inteiro, sem animar nada. Ver o cabeçalho desta função
   * para por que ele existe.
   */
  pendente = 0,
): number {
  const base = real - incremento - pendente
  const fatia = grandeza === 'contagem'
    ? projetarContagem(incremento, fracao)
    : projetarContinuo(incremento, fracao)
  return base + fatia
}
