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
  RECEITA_TARIFARIA: 'Receita Tarifária', SALDO_EM_CONTA: 'Saldo em Conta', MEDS: 'MEDs',
  RECEITA: 'Receita', TPV: 'TPV', MRR: 'MRR', FLOATING: 'Floating',
  CLIENTES_ATIVOS: 'Clientes Ativos', NOVOS_CLIENTES: 'Novos Clientes',
  RETENCAO: 'Retenção (%)', TRANSACOES: 'Transações',
}

export const SEGMENTO_LABELS: Record<string, string> = {
  IGAMING: 'iGaming', ECOMMERCE: 'E-commerce', SAAS: 'SaaS', ERP: 'ERP',
  TELECOM: 'Telecom', CRIPTOMOEDAS: 'Criptomoedas', VAREJO: 'Varejo', OUTROS: 'Outros',
}

export const OPERACAO_LABELS: Record<string, string> = {
  CASH_IN: 'Cash In', CASH_OUT: 'Cash Out', BAAS: 'BaaS', WHITE_LABEL: 'White Label',
}

export const SCORE_RISCO_LABELS: Record<string, string> = {
  BAIXO: 'Baixo', MEDIO: 'Médio', ALTO: 'Alto', CRITICO: 'Crítico',
}

export const TAREFA_STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em Andamento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada',
}

export const TAREFA_PRIORIDADE_LABELS: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', CRITICA: 'Crítica',
}

export const INCIDENTE_CRITICIDADE_LABELS: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', CRITICA: 'Crítica',
}

export const PEDIDO_STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente', FATURADO: 'Faturado', PAGO: 'Pago', CANCELADO: 'Cancelado',
}

export const LEAD_STATUS_COLORS: Record<string, string> = {
  NOVO: 'bg-sky-500/10 text-sky-400',
  QUALIFICADO: 'bg-violet-500/10 text-violet-400',
  PROPOSTA: 'bg-amber-500/10 text-amber-400',
  NEGOCIACAO: 'bg-orange-500/10 text-orange-400',
  GANHO: 'bg-emerald-500/10 text-emerald-400',
  PERDIDO: 'bg-red-500/10 text-red-400',
}

export const DEAL_STAGE_COLORS: Record<string, string> = {
  PROSPECCAO: 'bg-gray-500/10 text-gray-400',
  QUALIFICACAO: 'bg-sky-500/10 text-sky-400',
  PROPOSTA: 'bg-amber-500/10 text-amber-400',
  NEGOCIACAO: 'bg-orange-500/10 text-orange-400',
  FECHAMENTO: 'bg-violet-500/10 text-violet-400',
  GANHO: 'bg-emerald-500/10 text-emerald-400',
  PERDIDO: 'bg-red-500/10 text-red-400',
}

export const CLIENTE_STATUS_COLORS: Record<string, string> = {
  ATIVO: 'bg-emerald-500/10 text-emerald-400',
  INATIVO: 'bg-gray-500/10 text-gray-400',
  PROSPECCAO: 'bg-sky-500/10 text-sky-400',
  ENCERRADO: 'bg-red-500/10 text-red-400',
}

export const MODELO_OPERACIONAL_COLORS: Record<string, string> = {
  API: 'bg-sky-500/10 text-sky-400',
  WHITE_LABEL: 'bg-violet-500/10 text-violet-400',
}

export const SEGMENTO_COLORS: Record<string, string> = {
  IGAMING: 'bg-purple-500/10 text-purple-400',
  ECOMMERCE: 'bg-sky-500/10 text-sky-400',
  SAAS: 'bg-emerald-500/10 text-emerald-400',
  ERP: 'bg-blue-500/10 text-blue-400',
  TELECOM: 'bg-cyan-500/10 text-cyan-400',
  CRIPTOMOEDAS: 'bg-amber-500/10 text-amber-400',
  VAREJO: 'bg-orange-500/10 text-orange-400',
  OUTROS: 'bg-gray-500/10 text-gray-400',
}

export const SCORE_RISCO_COLORS: Record<string, string> = {
  BAIXO: 'bg-emerald-500/10 text-emerald-400',
  MEDIO: 'bg-amber-500/10 text-amber-400',
  ALTO: 'bg-orange-500/10 text-orange-400',
  CRITICO: 'bg-red-500/10 text-red-400',
}

export const TAREFA_STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'bg-amber-500/10 text-amber-400',
  EM_ANDAMENTO: 'bg-sky-500/10 text-sky-400',
  CONCLUIDA: 'bg-emerald-500/10 text-emerald-400',
  CANCELADA: 'bg-gray-500/10 text-gray-400',
}

export const TAREFA_PRIORIDADE_COLORS: Record<string, string> = {
  BAIXA: 'bg-gray-500/10 text-gray-400',
  MEDIA: 'bg-sky-500/10 text-sky-400',
  ALTA: 'bg-amber-500/10 text-amber-400',
  CRITICA: 'bg-red-500/10 text-red-400',
}

export const INCIDENTE_CRITICIDADE_COLORS: Record<string, string> = {
  BAIXA: 'bg-emerald-500/10 text-emerald-400',
  MEDIA: 'bg-amber-500/10 text-amber-400',
  ALTA: 'bg-orange-500/10 text-orange-400',
  CRITICA: 'bg-red-500/10 text-red-400',
}

export const PEDIDO_STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'bg-amber-500/10 text-amber-400',
  FATURADO: 'bg-sky-500/10 text-sky-400',
  PAGO: 'bg-emerald-500/10 text-emerald-400',
  CANCELADO: 'bg-red-500/10 text-red-400',
}
