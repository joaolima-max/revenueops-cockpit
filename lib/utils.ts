import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}K`
  return formatCurrency(value)
}

export function formatTPV(value: number): string {
  if (value >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}K`
  return formatCurrency(value)
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}

export function getLast12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function formatMesRef(mesRef: string): string {
  const [year, month] = mesRef.split('-')
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${names[parseInt(month) - 1]}/${year.slice(2)}`
}

export const LEAD_STATUS_LABELS: Record<string, string> = {
  NOVO: 'Novo', QUALIFICADO: 'Qualificado', PROPOSTA: 'Proposta',
  NEGOCIACAO: 'Negociação', GANHO: 'Ganho', PERDIDO: 'Perdido',
}

export const DEAL_STAGE_LABELS: Record<string, string> = {
  PROSPECCAO: 'Prospecção', QUALIFICACAO: 'Qualificação', PROPOSTA: 'Proposta',
  NEGOCIACAO: 'Negociação', FECHAMENTO: 'Fechamento', GANHO: 'Ganho', PERDIDO: 'Perdido',
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador', OPERACIONAL: 'Operacional', COMERCIAL: 'Comercial',
}

export const MODELO_OPERACIONAL_LABELS: Record<string, string> = {
  API: 'API', WHITE_LABEL: 'White Label',
}

export const CLIENTE_STATUS_LABELS: Record<string, string> = {
  ATIVO: 'Ativo', INATIVO: 'Inativo', PROSPECCAO: 'Prospecção', ENCERRADO: 'Encerrado',
}

export const META_TIPO_LABELS: Record<string, string> = {
  RECEITA: 'Receita', TPV: 'TPV', MRR: 'MRR', FLOATING: 'Floating', CLIENTES_ATIVOS: 'Clientes Ativos',
}

export const LEAD_STATUS_COLORS: Record<string, string> = {
  NOVO: 'bg-blue-500/10 text-blue-400',
  QUALIFICADO: 'bg-purple-500/10 text-purple-400',
  PROPOSTA: 'bg-yellow-500/10 text-yellow-400',
  NEGOCIACAO: 'bg-orange-500/10 text-orange-400',
  GANHO: 'bg-emerald-500/10 text-emerald-400',
  PERDIDO: 'bg-red-500/10 text-red-400',
}

export const DEAL_STAGE_COLORS: Record<string, string> = {
  PROSPECCAO: 'bg-gray-500/10 text-gray-400',
  QUALIFICACAO: 'bg-blue-500/10 text-blue-400',
  PROPOSTA: 'bg-yellow-500/10 text-yellow-400',
  NEGOCIACAO: 'bg-orange-500/10 text-orange-400',
  FECHAMENTO: 'bg-purple-500/10 text-purple-400',
  GANHO: 'bg-emerald-500/10 text-emerald-400',
  PERDIDO: 'bg-red-500/10 text-red-400',
}

export const CLIENTE_STATUS_COLORS: Record<string, string> = {
  ATIVO: 'bg-emerald-500/10 text-emerald-400',
  INATIVO: 'bg-gray-500/10 text-gray-400',
  PROSPECCAO: 'bg-blue-500/10 text-blue-400',
  ENCERRADO: 'bg-red-500/10 text-red-400',
}

export const MODELO_OPERACIONAL_COLORS: Record<string, string> = {
  API: 'bg-indigo-500/10 text-indigo-400',
  WHITE_LABEL: 'bg-violet-500/10 text-violet-400',
}
