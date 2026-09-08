/**
 * TEMA ÚNICO DOS GRÁFICOS — só apresentação. Nenhuma regra de negócio aqui.
 *
 * Antes havia seis cores de série sem relação com a marca (#6366f1, #10b981,
 * #7c3aed, #0ea5e9, #0369a1, #f59e0b). O site institucional tem UM accent.
 * A leitura passa a ser por intensidade, não por matiz.
 */

/** Série primária → secundária → apoio. Nunca mais que três num gráfico. */
export const SERIES = {
  primary: '#2F6BFF',
  secondary: '#6B8CFF',
  support: 'rgba(255,255,255,0.28)',
} as const

/** Semântica — exclusiva de atingimento e severidade. */
export const SIGNAL = {
  pos: '#07CF22',
  warn: '#E0A62B',
  neg: '#FF7A80',
} as const

export const GRID = 'rgba(255,255,255,0.06)'
export const AXIS_TICK = { fill: 'rgba(255,255,255,0.36)', fontSize: 11 } as const

/** Props comuns de eixo: sem linha de eixo, sem tick mark. */
export const axisProps = {
  tick: AXIS_TICK,
  axisLine: false,
  tickLine: false,
  tickMargin: 8,
} as const

export const gridProps = {
  stroke: GRID,
  strokeDasharray: '0',
  vertical: false,
} as const

export const tooltipProps = {
  cursor: { fill: 'rgba(255,255,255,0.04)' },
  contentStyle: {
    backgroundColor: '#0B0D10',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: '0.75rem',
    fontSize: 12,
    padding: '10px 12px',
    boxShadow: '0 1.5rem 3rem -1.5rem rgba(5,6,8,.55)',
  },
  labelStyle: {
    color: 'rgba(255,255,255,0.36)',
    marginBottom: 6,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
  },
  itemStyle: { color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' as const },
} as const

export const legendProps = {
  wrapperStyle: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 11,
    paddingTop: 12,
  },
  iconType: 'plainline' as const,
  iconSize: 10,
}

export const BAR = { maxBarSize: 28, radius: [2, 2, 0, 0] as [number, number, number, number] }
export const LINE = { strokeWidth: 2, dot: false, activeDot: { r: 4, strokeWidth: 0 } }

/** Uma série só tem o que mostrar se houver ao menos um valor finito != 0. */
export function hasSeries<T extends Record<string, unknown>>(rows: T[], ...keys: (keyof T)[]): boolean {
  return rows.some((r) => keys.some((k) => {
    const v = r[k]
    return typeof v === 'number' && Number.isFinite(v) && v !== 0
  }))
}
