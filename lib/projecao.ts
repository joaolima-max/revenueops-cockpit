/**
 * O CICLO DE PROJEÇÃO — a única consulta que a camada visual precisa.
 *
 * A matemática, o fuso e a curva estão em `lib/projecao-intradiaria.ts`, que é
 * PURO. Aqui fica só a pergunta ao banco: "quais lançamentos entraram no
 * painel neste ciclo?".
 *
 * ── O QUE É "ELEGÍVEL" ──────────────────────────────────────────────────
 *
 * O lançamento do ciclo é aquele cujo REGISTRO (`createdAt`) caiu dentro da
 * janela 10h→10h vigente.
 *
 * É `createdAt`, e não a competência (`data`), e a distinção é o centro desta
 * rodada: o lançamento feito hoje às 10h se refere a ONTEM. Se o ciclo fosse
 * escolhido pela competência, o painel animaria um número que já estava
 * visível — e cairia no instante da virada, porque ele já estava somado no
 * acumulado.
 *
 * Com `createdAt`, o incremento do ciclo é por definição o volume que o
 * acumulado AINDA NÃO mostrava quando o ciclo começou. É isso que faz o
 * número só subir (ver `valorExibido`).
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
  cicloDe, type VolumeCiclo, VOLUME_ZERO,
} from '@/lib/projecao-intradiaria'

export interface LancamentoDoCiclo {
  /** Competência, "YYYY-MM-DD". O dia a que o volume se refere. */
  competencia: string
  /** Quando o lançamento foi REGISTRADO, em ISO. É o que define o ciclo. */
  registradoEm: string
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
  /** Os lançamentos registrados neste ciclo, do mais antigo ao mais recente. */
  lancamentos: LancamentoDoCiclo[]
}

/**
 * O ciclo vigente e os lançamentos que entraram nele.
 *
 * `agora` é parâmetro para a função ser determinística nos testes — a mesma
 * razão de `janelaDiaria` e `comparacaoMensal` receberem a data.
 */
export async function cicloDeProjecao(agora: Date = new Date()): Promise<CicloProjecao> {
  const ciclo = cicloDe(agora)

  const linhas = await prisma.lancamentoDiario.findMany({
    where: { createdAt: { gte: ciclo.inicio, lt: ciclo.fim } },
    select: {
      data: true, createdAt: true,
      tpv: true, receitaTarifaria: true, qtdTransacoes: true, qtdMed: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return {
    inicio: ciclo.inicio.toISOString(),
    fim: ciclo.fim.toISOString(),
    agoraServidor: agora.toISOString(),
    lancamentos: linhas.map((l) => ({
      competencia: l.data.toISOString().slice(0, 10),
      registradoEm: l.createdAt.toISOString(),
      volume: {
        tpv: l.tpv,
        receita: l.receitaTarifaria,
        transacoes: l.qtdTransacoes,
        med: l.qtdMed,
      },
    })),
  }
}

/**
 * O INCREMENTO do ciclo dentro de um recorte de competência.
 *
 * `periodo` ausente = sem recorte, para os acumulados que somam todos os meses
 * lançados (o nível 1 do Conselho).
 *
 * Pura de propósito: a tela recebe o ciclo inteiro e soma o que precisa, sem
 * uma segunda ida ao banco por recorte.
 */
export function incrementoDoCiclo(
  ciclo: CicloProjecao, periodo?: string,
): VolumeCiclo {
  const dentro = periodo
    ? (() => {
      const { inicio, fim } = intervaloMes(periodo)
      const de = inicio.toISOString().slice(0, 10)
      const ate = fim.toISOString().slice(0, 10)
      // Comparação de strings "YYYY-MM-DD" é ordenação cronológica.
      return (c: string) => c >= de && c < ate
    })()
    : () => true

  return ciclo.lancamentos.reduce<VolumeCiclo>((a, l) => {
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
 * O lançamento de REFERÊNCIA do ciclo: o mais recentemente registrado.
 *
 * Serve para a tela declarar a origem — "referente a 07/10, lançado às 10h12"
 * — sem alegar integração em tempo real. `null` quando o ciclo ainda não
 * recebeu lançamento.
 */
export function referenciaDoCiclo(
  ciclo: CicloProjecao, periodo?: string,
): LancamentoDoCiclo | null {
  const elegiveis = periodo
    ? ciclo.lancamentos.filter((l) => {
      const { inicio, fim } = intervaloMes(periodo)
      const c = l.competencia
      return c >= inicio.toISOString().slice(0, 10) && c < fim.toISOString().slice(0, 10)
    })
    : ciclo.lancamentos
  return elegiveis.length > 0 ? elegiveis[elegiveis.length - 1] : null
}
