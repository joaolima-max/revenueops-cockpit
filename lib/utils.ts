import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}

export const LEAD_STATUS_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  QUALIFICADO: 'Qualificado',
  PROPOSTA: 'Proposta',
  NEGOCIACAO: 'Negociação',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
}

export const DEAL_STAGE_LABELS: Record<string, string> = {
  PROSPECCAO: 'Prospecção',
  QUALIFICACAO: 'Qualificação',
  PROPOSTA: 'Proposta',
  NEGOCIACAO: 'Negociação',
  FECHAMENTO: 'Fechamento',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  OPERACIONAL: 'Operacional',
  COMERCIAL: 'Comercial',
}

export const LEAD_STATUS_COLORS: Record<string, string> = {
  NOVO: 'bg-blue-100 text-blue-800',
  QUALIFICADO: 'bg-purple-100 text-purple-800',
  PROPOSTA: 'bg-yellow-100 text-yellow-800',
  NEGOCIACAO: 'bg-orange-100 text-orange-800',
  GANHO: 'bg-green-100 text-green-800',
  PERDIDO: 'bg-red-100 text-red-800',
}

export const DEAL_STAGE_COLORS: Record<string, string> = {
  PROSPECCAO: 'bg-gray-100 text-gray-800',
  QUALIFICACAO: 'bg-blue-100 text-blue-800',
  PROPOSTA: 'bg-yellow-100 text-yellow-800',
  NEGOCIACAO: 'bg-orange-100 text-orange-800',
  FECHAMENTO: 'bg-purple-100 text-purple-800',
  GANHO: 'bg-green-100 text-green-800',
  PERDIDO: 'bg-red-100 text-red-800',
}
