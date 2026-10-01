export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import {
  CRITICIDADES, calcularDowntime,
  podeAdministrarIncidente, podeRegistrarIncidente,
} from '@/lib/incidentes'
import MetricasOperacionais, { type MetricasDTO } from '@/components/incidentes/MetricasOperacionais'
import IncidentesClient from './IncidentesClient'

/**
 * INCIDENTES — métricas em cima, registro embaixo.
 *
 * "Métricas Operacionais" deixou de ser um menu. Os indicadores são DERIVADOS
 * dos incidentes, e tê-los numa tela separada obrigava a abrir duas telas para
 * ler o mesmo fato — e a comparar de memória o número do painel com a linha do
 * registro. Agora a leitura e a operação estão na mesma página, nessa ordem.
 *
 * O cálculo acontece AQUI, no servidor, a partir dos mesmos incidentes que a
 * lista mostra. Não há segunda consulta nem segunda regra: o downtime sai de
 * `calcularDowntime`, exatamente como na lista.
 */
function calcularMetricas(
  incidentes: Array<{ inicio: Date; fim: Date | null; criticidade: string }>,
  hoje: Date,
): MetricasDTO {
  const abertos = incidentes.filter((i) => !i.fim)
  const encerrados = incidentes.filter((i) => i.fim)

  // ACUMULADO: só os ENCERRADOS. A duração de um incidente aberto ainda está
  // crescendo, e somá-la faria o total do mês mudar a cada refresh — um número
  // que ninguém consegue conferir contra nada.
  const downtimeTotal = encerrados.reduce((s, i) => s + calcularDowntime(i.inicio, i.fim).minutos, 0)

  /**
   * MTTR É O DOWNTIME — a média dos MESMOS números, abertos incluídos.
   *
   * O downtime de um incidente é (fim − início), e enquanto ele está aberto o
   * `fim` é agora: a duração cresce, e o MTTR cresce com ela. É o
   * comportamento pedido, e é também o honesto — um incidente aberto há seis
   * horas já custou seis horas, e tirá-lo da média faria o MTTR parecer melhor
   * exatamente quando a operação está pior.
   *
   * Não existe segundo cálculo: `calcularDowntime` é a única fonte, a mesma da
   * lista abaixo. Um incidente isolado tem MTTR igual ao próprio downtime.
   */
  const downtimeDeTodos = incidentes.reduce(
    (s, i) => s + calcularDowntime(i.inicio, i.fim).minutos, 0,
  )

  const meses = Array.from({ length: 6 }, (_, k) => {
    const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (5 - k), 1))
    const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1))
    const doMes = incidentes.filter((i) => i.inicio >= inicio && i.inicio < fim)
    return {
      rotulo: inicio.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }),
      total: doMes.length,
      downtime: doMes
        .filter((i) => i.fim)
        .reduce((s, i) => s + calcularDowntime(i.inicio, i.fim).minutos, 0),
    }
  })

  return {
    total: incidentes.length,
    abertos: abertos.length,
    encerrados: encerrados.length,
    downtimeTotal,
    // Média sobre TODOS: com incidente aberto, o MTTR acompanha a duração que
    // continua correndo.
    mttr: incidentes.length > 0 ? downtimeDeTodos / incidentes.length : null,
    mttrEmCurso: abertos.length > 0,
    porCriticidade: CRITICIDADES.map((c) => ({
      criticidade: c,
      total: incidentes.filter((i) => i.criticidade === c).length,
    })),
    meses,
  }
}

export default async function IncidentesPage() {
  const session = await getSession()
  const role = session?.role ?? ''

  // UMA consulta serve as duas áreas da tela. As métricas são derivadas desta
  // mesma lista — por isso não podem divergir dela.
  const todos = await prisma.incidente.findMany({ orderBy: { inicio: 'desc' } })

  const metricas = calcularMetricas(todos, new Date())

  return (
    <div className="space-y-10">
      <MetricasOperacionais m={metricas} />

      <IncidentesClient
        initial={JSON.parse(JSON.stringify(todos.slice(0, 50)))}
        podeRegistrar={podeRegistrarIncidente(role)}
        podeAdministrar={podeAdministrarIncidente(role)}
      />
    </div>
  )
}
