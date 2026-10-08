/**
 * O CICLO DE PROJEÇÃO — a única consulta que a camada visual precisa.
 *
 * A matemática, o fuso e a curva estão em `lib/projecao-intradiaria.ts`, que é
 * PURO. Aqui fica só a pergunta ao banco: "quais lançamentos entraram no
 * painel neste ciclo?".
 *
 * ── O QUE É "ELEGÍVEL" ──────────────────────────────────────────────────
 *
 * O lançamento pertence ao ciclo que começa às 10h00 do DIA EM QUE ELE FOI
 * REGISTRADO (`createdAt`), no fuso operacional — ver `cicloAtribuidoA`.
 *
 * É `createdAt`, e não a competência (`data`), e a distinção é o centro desta
 * rodada: o lançamento feito hoje às 10h se refere a ONTEM. Se o ciclo fosse
 * escolhido pela competência, o painel animaria um número que já estava
 * visível — e cairia no instante da virada, porque ele já estava somado no
 * acumulado.
 *
 * ── TRÊS SITUAÇÕES, E O QUE A CONSULTA DEVOLVE PARA CADA UMA ────────────
 *
 * ATUAL      registrado hoje, e as 10h já passaram. Pertence ao ciclo em
 *            curso e ANIMA, entrando em `f(agora)` — a porção decorrida da
 *            curva conta como realizada.
 *
 * PENDENTE   registrado hoje ANTES das 10h, e ainda não deu 10h. Pertence ao
 *            ciclo que vai começar; é subtraído do exibido e não anima nada
 *            até lá. Sem isso o número cairia na virada.
 *
 * FECHADO    registrado em qualquer dia anterior. Já foi animado no ciclo
 *            dele; aparece inteiro no acumulado e não é devolvido aqui.
 *
 * ── POR QUE A SOMA, E NÃO UM LANÇAMENTO SÓ ──────────────────────────────
 *
 * Normalmente é um por ciclo, e aí a soma é ele. Mas acontece de verdade
 * entrarem dois — em Production, as competências de 02/10 e 03/10 foram
 * registradas às 23h03 e às 00h01, dentro do mesmo ciclo. Animar só o mais
 * recente faria o outro aparecer de uma vez, que é exactamente o salto que
 * esta rodada existe para eliminar.
 *
 * ── A JANELA DE COMPETÊNCIA É DECIDIDA POR QUEM CHAMA ───────────────────
 *
 * A consulta devolve os lançamentos do ciclo COM a competência de cada um, e
 * quem chama soma o que cabe no seu recorte. A Home soma o mês corrente; o
 * Conselho soma o mês no nível 2 e todos os meses no acumulado do nível 1.
 *
 * Sem esse filtro haveria um defeito silencioso: um lançamento retroativo de
 * fevereiro registrado hoje entraria no incremento e seria subtraído do
 * acumulado de outubro — onde ele nunca esteve. A migration v29 criou 234
 * linhas de fevereiro a setembro com `createdAt` de hoje; é precisamente o
 * caso que este filtro impede de virar número errado.
 */

import { prisma } from '@/lib/prisma'
import { intervaloMes } from '@/lib/periodo'
import {
  cicloDe, cicloAtribuidoA, partesNoFuso, instanteNoFuso,
  type VolumeCiclo, VOLUME_ZERO,
} from '@/lib/projecao-intradiaria'

export interface LancamentoDoCiclo {
  /** Competência, "YYYY-MM-DD". O dia a que o volume se refere. */
  competencia: string
  /** Quando o lançamento foi REGISTRADO, em ISO. É o que define o ciclo. */
  registradoEm: string
  /** Início do ciclo a que ele pertence, em ISO. Ver `cicloAtribuidoA`. */
  cicloEm: string
  volume: VolumeCiclo
}

export interface CicloProjecao {
  /** Início do ciclo (10h do fuso operacional), em ISO. */
  inicio: string
  /** Fim EXCLUSIVO do ciclo (10h do dia seguinte), em ISO. */
  fim: string
  /**
   * O relógio do SERVIDOR no instante da resposta, em ISO.
   *
   * A tela corrige o relógio local por este valor. Sem isso, um navegador com
   * a hora errada calcularia outro ponto da curva — e dois usuários veriam
   * números diferentes para o mesmo instante, que é o oposto do pedido.
   */
  agoraServidor: string
  /**
   * Os lançamentos que ANIMAM neste ciclo, do mais antigo ao mais recente.
   *
   * São os registrados hoje depois das 10h — ou hoje antes das 10h, já com as
   * 10h passadas. Em ambos os casos o ciclo atribuído é o que está em curso.
   */
  lancamentos: LancamentoDoCiclo[]
  /**
   * Os lançamentos já registrados cujo ciclo AINDA NÃO COMEÇOU.
   *
   * Acontece entre 00h e 10h: o lançamento das 09h19 já está no acumulado
   * real, mas o ciclo dele só abre às 10h. Eles saem do exibido e não animam
   * — ver o termo `pendente` de `valorExibido`.
   */
  pendentes: LancamentoDoCiclo[]
}

/**
 * O ciclo vigente e os lançamentos que entraram nele.
 *
 * `agora` é parâmetro para a função ser determinística nos testes — a mesma
 * razão de `janelaDiaria` e `comparacaoMensal` receberem a data.
 */
export async function cicloDeProjecao(agora: Date = new Date()): Promise<CicloProjecao> {
  const ciclo = cicloDe(agora)

  /**
   * A JANELA DA CONSULTA: da MEIA-NOITE do dia do início do ciclo até agora.
   *
   * Por que a meia-noite e não o início do ciclo: um lançamento atribuído ao
   * ciclo que começou às 10h de hoje pode ter sido registrado hoje às 09h19,
   * que é ANTES do início do ciclo. Consultar de `ciclo.inicio` o perderia —
   * e era exatamente o lançamento que não animava.
   *
   * E até agora, não até o fim do ciclo: o fim está no futuro, e `createdAt`
   * nunca está. O limite superior existe só para a consulta ser determinística
   * quando `agora` é injetado nos testes.
   */
  const d = partesNoFuso(ciclo.inicio)
  const inicioDaBusca = instanteNoFuso(d.ano, d.mes, d.dia, 0)

  const linhas = await prisma.lancamentoDiario.findMany({
    where: { createdAt: { gte: inicioDaBusca, lte: agora } },
    select: {
      data: true, createdAt: true,
      tpv: true, receitaTarifaria: true, qtdTransacoes: true, qtdMed: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const convertido = linhas.map((l) => ({
    competencia: l.data.toISOString().slice(0, 10),
    registradoEm: l.createdAt.toISOString(),
    cicloEm: cicloAtribuidoA(l.createdAt).toISOString(),
    volume: {
      tpv: l.tpv,
      receita: l.receitaTarifaria,
      transacoes: l.qtdTransacoes,
      med: l.qtdMed,
    },
  }))

  const inicioIso = ciclo.inicio.toISOString()

  return {
    inicio: inicioIso,
    fim: ciclo.fim.toISOString(),
    agoraServidor: agora.toISOString(),
    // ATRIBUÍDO AO CICLO EM CURSO: anima.
    lancamentos: convertido.filter((l) => l.cicloEm === inicioIso),
    // ATRIBUÍDO A UM CICLO FUTURO: fica de fora do exibido, sem animar.
    //
    // Comparação de instantes e não de strings: as duas vêm de
    // `toISOString()`, mas depender do formato para ordenar seria frágil.
    pendentes: convertido.filter(
      (l) => Date.parse(l.cicloEm) > ciclo.inicio.getTime(),
    ),
  }
}

/**
 * O filtro de competência de um recorte. `undefined` = sem recorte.
 *
 * Comparação de strings "YYYY-MM-DD", que é ordenação cronológica.
 */
function dentroDoPeriodo(periodo?: string): (competencia: string) => boolean {
  if (!periodo) return () => true
  const { inicio, fim } = intervaloMes(periodo)
  const de = inicio.toISOString().slice(0, 10)
  const ate = fim.toISOString().slice(0, 10)
  return (c) => c >= de && c < ate
}

/** Soma o volume de uma lista de lançamentos, dentro de um recorte. */
function somarVolume(
  lancamentos: readonly LancamentoDoCiclo[], periodo?: string,
): VolumeCiclo {
  const dentro = dentroDoPeriodo(periodo)
  return lancamentos.reduce<VolumeCiclo>((a, l) => {
    if (!dentro(l.competencia)) return a
    return {
      tpv: a.tpv + l.volume.tpv,
      receita: a.receita + l.volume.receita,
      transacoes: a.transacoes + l.volume.transacoes,
      med: a.med + l.volume.med,
    }
  }, { ...VOLUME_ZERO })
}

/**
 * O INCREMENTO que ANIMA neste ciclo, dentro de um recorte de competência.
 *
 * `periodo` ausente = sem recorte, para os acumulados que somam todos os meses
 * lançados (o nível 1 do Conselho).
 *
 * ── POR QUE A SOMA, E NÃO UM LANÇAMENTO SÓ ────────────────────────────
 *
 * Normalmente é um por ciclo, e aí a soma é ele. Mas acontece de verdade
 * entrarem dois — em Production, as competências de 02/10 e 03/10 foram
 * registradas às 23h03 e às 00h01. Animar só o mais recente faria o outro
 * aparecer de uma vez, que é exatamente o salto que esta rodada elimina.
 *
 * ── POR QUE O RECORTE DE COMPETÊNCIA É OBRIGATÓRIO ────────────────────
 *
 * Sem ele haveria um defeito silencioso: um lançamento retroativo de fevereiro
 * registrado hoje entraria no incremento e seria subtraído do acumulado de
 * outubro — onde ele nunca esteve. A migration v29 criou 234 linhas de
 * fevereiro a setembro com `createdAt` de um mesmo dia; é precisamente o caso
 * que este filtro impede de virar número errado.
 *
 * Pura de propósito: a tela recebe o ciclo inteiro e soma o que precisa, sem
 * uma segunda ida ao banco por recorte.
 */
export function incrementoDoCiclo(
  ciclo: CicloProjecao, periodo?: string,
): VolumeCiclo {
  return somarVolume(ciclo.lancamentos, periodo)
}

/**
 * O volume já REGISTRADO cujo ciclo ainda NÃO COMEÇOU.
 *
 * Sai do exibido inteiro, sem animar. É o que impede o número de cair na
 * virada das 10h quando o lançamento foi feito de madrugada ou no começo da
 * manhã — ver o termo `pendente` de `valorExibido`.
 */
export function incrementoPendente(
  ciclo: CicloProjecao, periodo?: string,
): VolumeCiclo {
  return somarVolume(ciclo.pendentes, periodo)
}

/**
 * O lançamento de REFERÊNCIA do ciclo: o mais recentemente registrado.
 *
 * Serve para a tela declarar a origem — "referente a 07/10, lançado às 10h12"
 * — sem alegar integração em tempo real. `null` quando o ciclo ainda não
 * recebeu lançamento.
 */
export function referenciaDoCiclo(
  ciclo: CicloProjecao, periodo?: string,
): LancamentoDoCiclo | null {
  const dentro = dentroDoPeriodo(periodo)
  const elegiveis = ciclo.lancamentos.filter((l) => dentro(l.competencia))
  return elegiveis.length > 0 ? elegiveis[elegiveis.length - 1] : null
}

/**
 * O lançamento PENDENTE mais recente — o que vai animar quando der 10h.
 *
 * Serve para a tela declarar a espera sem prometer nada: "lançamento de 07/10
 * registrado às 09h19; a projeção começa às 10h". `null` quando não há
 * pendente.
 */
export function pendenteDoCiclo(
  ciclo: CicloProjecao, periodo?: string,
): LancamentoDoCiclo | null {
  const dentro = dentroDoPeriodo(periodo)
  const elegiveis = ciclo.pendentes.filter((l) => dentro(l.competencia))
  return elegiveis.length > 0 ? elegiveis[elegiveis.length - 1] : null
}
