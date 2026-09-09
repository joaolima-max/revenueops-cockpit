/**
 * LINGUAGEM ÚNICA DOS GRÁFICOS — só apresentação.
 *
 * Um accent, três intensidades. A leitura acontece por hierarquia visual,
 * não por matiz: série atual em cheio, comparação em traço fantasma, grade
 * quase invisível. Nada aqui inventa dado ou série.
 */

export type Tema = 'dark' | 'light'

export interface Paleta {
  grid: string
  axis: string
  s1: string
  s2: string
  s3: string
  tipBg: string
  tipBorder: string
  cursor: string
  fg: string
  muted: string
}

const DARK: Paleta = {
  grid: 'rgba(255,255,255,0.055)',
  axis: 'rgba(255,255,255,0.34)',
  s1: '#2F6BFF',
  s2: '#6B8CFF',
  s3: 'rgba(255,255,255,0.22)',
  tipBg: '#0B0D10',
  tipBorder: 'rgba(255,255,255,0.16)',
  cursor: 'rgba(255,255,255,0.05)',
  fg: '#FFFFFF',
  muted: 'rgba(255,255,255,0.56)',
}

const LIGHT: Paleta = {
  grid: 'rgba(11,13,16,0.07)',
  axis: 'rgba(11,13,16,0.42)',
  s1: '#2F6BFF',
  s2: '#7C9BFF',
  s3: 'rgba(11,13,16,0.20)',
  tipBg: '#FFFFFF',
  tipBorder: '#CBD1DA',
  cursor: 'rgba(11,13,16,0.04)',
  fg: '#0B0D10',
  muted: '#5C626B',
}

export function paleta(tema: Tema): Paleta {
  return tema === 'light' ? LIGHT : DARK
}

/** Semântica — exclusiva de atingimento e severidade, resolvida por tema.
 *  Os mesmos valores dos tokens --color-pos/warn/alert/neg: recharts precisa
 *  de string concreta, então o mapa espelha o CSS em vez de divergir dele. */
const SIGNAL_DARK = { pos: '#22D049', warn: '#E0A62B', alert: '#FF8F3C', neg: '#FF7A80' } as const
const SIGNAL_LIGHT = { pos: '#0E9F2A', warn: '#A9750A', alert: '#C2560C', neg: '#D0323F' } as const

export function signal(tema: Tema) {
  return tema === 'light' ? SIGNAL_LIGHT : SIGNAL_DARK
}

/** @deprecated use `signal(tema)` — mantido para o tema escuro. */
export const SIGNAL = SIGNAL_DARK

/* ---------- props derivadas do tema -------------------------------------- */

export function gridProps(p: Paleta) {
  // Só horizontal, sem tracejado: a grade orienta, não decora.
  return { stroke: p.grid, strokeDasharray: '0', vertical: false } as const
}

export function axisProps(p: Paleta) {
  return {
    tick: { fill: p.axis, fontSize: 11 },
    axisLine: false,
    tickLine: false,
    tickMargin: 10,
    minTickGap: 8,
  } as const
}

export function legendProps(p: Paleta) {
  return {
    wrapperStyle: { color: p.muted, fontSize: 11, paddingTop: 14 },
    iconType: 'plainline' as const,
    iconSize: 12,
  }
}

/** Cursor do tooltip: faixa discreta em barras, linha fina em séries contínuas. */
export function cursorBarra(p: Paleta) {
  return { fill: p.cursor }
}
export function cursorLinha(p: Paleta) {
  return { stroke: p.axis, strokeWidth: 1, strokeDasharray: '3 3' }
}

export const BAR = { maxBarSize: 26, radius: [3, 3, 0, 0] as [number, number, number, number] }

export function LINE(p: Paleta) {
  return {
    strokeWidth: 2,
    dot: false,
    // Ponto selecionado ganha halo: destaque sem poluir a linha inteira.
    activeDot: { r: 4, strokeWidth: 3, stroke: p.tipBg, fill: p.s1 },
  }
}

/** Uma série só existe se houver ao menos um valor finito diferente de zero. */
export function hasSeries<T extends Record<string, unknown>>(rows: T[], ...keys: (keyof T)[]): boolean {
  return rows.some((r) => keys.some((k) => {
    const v = r[k]
    return typeof v === 'number' && Number.isFinite(v) && v !== 0
  }))
}

/** Uma série é constante? (ex.: MRR repetido em 12 meses não é tendência) */
export function isFlat<T extends Record<string, unknown>>(rows: T[], key: keyof T): boolean {
  const vals: number[] = []
  for (const r of rows) {
    const v = r[key]
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v)
  }
  if (vals.length < 2) return true
  return vals.every((v) => v === vals[0])
}
