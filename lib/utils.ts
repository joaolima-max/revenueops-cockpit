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

/* ==========================================================================
   MAPAS DE COR DE STATUS
   Todos apontam para tokens do design system (pos / warn / alert / neg /
   accent / neutro), então respondem à troca de tema sem classe condicional.
   Regra do sistema: cor comunica ESTADO, nunca categoria — segmento e modelo
   operacional ficam neutros, o rótulo já os identifica.
   ========================================================================== */

const NEUTRO = 'bg-[var(--bp-hover)] text-muted'
const ACCENT = 'bg-accent/10 text-accent-soft'
const POS = 'bg-pos/10 text-pos'
const WARN = 'bg-warn/10 text-warn'
const ALERT = 'bg-alert/10 text-alert'
const NEG = 'bg-neg/10 text-neg'

export const LEAD_STATUS_COLORS: Record<string, string> = {
  NOVO: NEUTRO,
  QUALIFICADO: ACCENT,
  PROPOSTA: WARN,
  NEGOCIACAO: ALERT,
  GANHO: POS,
  PERDIDO: NEG,
}

export const DEAL_STAGE_COLORS: Record<string, string> = {
  PROSPECCAO: NEUTRO,
  QUALIFICACAO: ACCENT,
  PROPOSTA: WARN,
  NEGOCIACAO: ALERT,
  FECHAMENTO: ACCENT,
  GANHO: POS,
  PERDIDO: NEG,
}

export const CLIENTE_STATUS_COLORS: Record<string, string> = {
  ATIVO: POS,
  INATIVO: NEUTRO,
  PROSPECCAO: ACCENT,
  ENCERRADO: NEG,
}

/* Modelo operacional e segmento são CATEGORIA, não estado: tom neutro. */
export const MODELO_OPERACIONAL_COLORS: Record<string, string> = {
  API: NEUTRO,
  WHITE_LABEL: NEUTRO,
}

export const SEGMENTO_COLORS: Record<string, string> = {
  IGAMING: NEUTRO,
  ECOMMERCE: NEUTRO,
  SAAS: NEUTRO,
  ERP: NEUTRO,
  TELECOM: NEUTRO,
  CRIPTOMOEDAS: NEUTRO,
  VAREJO: NEUTRO,
  OUTROS: NEUTRO,
}

export const SCORE_RISCO_COLORS: Record<string, string> = {
  BAIXO: POS,
  MEDIO: WARN,
  ALTO: ALERT,
  CRITICO: NEG,
}

export const TAREFA_STATUS_COLORS: Record<string, string> = {
  PENDENTE: WARN,
  EM_ANDAMENTO: ACCENT,
  CONCLUIDA: POS,
  CANCELADA: NEUTRO,
}

export const TAREFA_PRIORIDADE_COLORS: Record<string, string> = {
  BAIXA: NEUTRO,
  MEDIA: ACCENT,
  ALTA: WARN,
  CRITICA: NEG,
}

export const INCIDENTE_CRITICIDADE_COLORS: Record<string, string> = {
  BAIXA: POS,
  MEDIA: WARN,
  ALTA: ALERT,
  CRITICA: NEG,
}

export const PEDIDO_STATUS_COLORS: Record<string, string> = {
  PENDENTE: WARN,
  FATURADO: ACCENT,
  PAGO: POS,
  CANCELADO: NEG,
}
