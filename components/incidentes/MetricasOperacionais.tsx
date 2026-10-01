import { PanelHeader } from '@/components/ui/Panel'
import Panel from '@/components/ui/Panel'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { figuraContagem } from '@/lib/format-financeiro'
import { CRITICIDADES, formatarDuracao, type Criticidade } from '@/lib/incidentes'

/* Severidade crescente nos tokens semânticos — responde ao tema. */
const COR_CRITICIDADE: Record<string, string> = {
  BAIXA: 'bg-subtle', MEDIA: 'bg-warn', ALTA: 'bg-alert', CRITICA: 'bg-neg',
}

export interface MetricasDTO {
  total: number
  abertos: number
  encerrados: number
  /** Soma do downtime dos ENCERRADOS, em minutos. */
  downtimeTotal: number
  /**
   * MTTR — a média do downtime de TODOS os incidentes, abertos incluídos.
   *
   * É literalmente o downtime: um incidente isolado tem MTTR igual à própria
   * duração. Enquanto há incidente aberto, o número cresce junto com ele.
   */
  mttr: number | null
  /** Há incidente aberto? Então o MTTR está correndo, e a tela diz isso. */
  mttrEmCurso: boolean
  porCriticidade: Array<{ criticidade: Criticidade; total: number }>
  meses: Array<{ rotulo: string; total: number; downtime: number }>
}

/**
 * MÉTRICAS OPERACIONAIS — o topo da tela de Incidentes.
 *
 * Deixou de ser um menu próprio. As métricas são DERIVADAS dos incidentes:
 * tê-las numa tela separada obrigava a abrir duas telas para ler o mesmo fato,
 * e a comparar de memória o número do painel com a linha do registro.
 *
 * MTTR É O DOWNTIME. Não existe segundo cálculo: o downtime de um incidente é
 * (fim − início), derivado por `calcularDowntime`, e o MTTR do conjunto é a
 * média desses mesmos números. Um incidente isolado tem MTTR igual ao próprio
 * downtime, e todas as telas mostram o mesmo valor.
 *
 * ACUMULADO conta só os encerrados — somar uma duração que ainda cresce faria
 * o total do mês mudar a cada refresh. O MTTR conta TODOS: ele É o downtime, e
 * um incidente aberto há seis horas já custou seis horas. Tirá-lo da média
 * faria o MTTR parecer melhor exatamente quando a operação está pior.
 */
export default function MetricasOperacionais({ m }: { m: MetricasDTO }) {
  if (m.total === 0) {
    return (
      <section className="space-y-4">
        <PanelHeader
          title="Métricas operacionais"
          sub="Indicadores derivados dos incidentes registrados."
        />
        <Panel padded={false}>
          <EmptyState
            title="Nenhum incidente registrado"
            description="Os indicadores desta seção são calculados a partir dos incidentes. Registre o primeiro abaixo."
          />
        </Panel>
      </section>
    )
  }

  const maxCrit = Math.max(...m.porCriticidade.map((p) => p.total), 1)
  const maxMes = Math.max(...m.meses.map((x) => x.total), 1)

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Métricas operacionais"
        sub="Indicadores derivados dos incidentes. O downtime é sempre (encerramento − início); o MTTR é a média dele."
      />

      <HairlineGrid cols={4}>
        <StatTile label="Incidentes" figura={figuraContagem(m.total)} primary
          note={`${m.encerrados} encerrados`} />
        <StatTile label="Em aberto" figura={figuraContagem(m.abertos)}
          note={m.abertos > 0 ? 'Requer acompanhamento' : 'Nenhum pendente'} />
        <StatTile label="Downtime acumulado" figura={null}
          note={`${m.encerrados} encerrados`}
          valorTexto={formatarDuracao(m.downtimeTotal)} />
        <StatTile label="MTTR" figura={null}
          note={m.mttrEmCurso
            ? 'Média do downtime · correndo, há incidente aberto'
            : 'Média do downtime dos incidentes'}
          valorTexto={m.mttr === null ? '—' : formatarDuracao(m.mttr)} />
      </HairlineGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Por criticidade" sub="Distribuição dos incidentes registrados." />
          <div className="mt-5 space-y-3">
            {m.porCriticidade.map((p) => (
              <div key={p.criticidade}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="t-label text-subtle">{p.criticidade}</span>
                  <span className="t-sm text-muted tabular-nums">{p.total}</span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-[width] duration-[380ms] ease-bp ${COR_CRITICIDADE[p.criticidade]}`}
                    style={{ width: `${(p.total / maxCrit) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Volume nos últimos 6 meses" sub="Incidentes abertos por mês e downtime acumulado." />
          <div className="mt-5 flex items-end gap-2 h-32">
            {m.meses.map((x, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full bg-accent/70 rounded-t transition-[height] duration-[380ms] ease-bp"
                  style={{ height: `${Math.max((x.total / maxMes) * 100, x.total > 0 ? 6 : 2)}%` }}
                  title={`${x.total} incidente(s) · ${formatarDuracao(x.downtime)} de downtime`} />
                <span className="t-mono text-subtle tabular-nums">{x.total}</span>
                <span className="t-label text-subtle capitalize">{x.rotulo}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  )
}

export { CRITICIDADES }
