import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
/**
 * Os TIPOS dos enums, não o cliente.
 *
 * `import type` é apagado na compilação, então isto não arrasta o Prisma
 * Client para o bundle do navegador — e `lib/utils` é importado por telas de
 * cliente. O que vem daqui é só a união de strings, que é justamente o que
 * torna os mapas de rótulo exaustivos.
 */
import type { ModeloOperacional, ClienteStatus } from '@prisma/client'

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
  ADMIN: 'Administrador', GESTOR: 'Gestor', OPERACIONAL: 'Operador', COMERCIAL: 'Comercial',
}

/**
 * SEGMENTO — o mapa que as telas usam, com TODOS os valores do enum.
 *
 * Os quatro últimos são LEGADO: não são oferecidos no cadastro novo (o
 * segmento virou entidade, `SegmentoComercial`), mas o enum ainda os aceita e
 * pode haver linha gravada com eles. Sem rótulo, a tela caía no `?? valor` e
 * mostrava "CRIPTOMOEDAS" em caixa alta no lugar de um nome.
 *
 * O enum é a fonte da verdade, e `tests/rotulos-exaustivos` compara os dois:
 * acrescentar valor ao enum sem rótulo aqui quebra o teste.
 */
export const SEGMENTO_CRM_LABELS: Record<string, string> = {
  CRYPTO_EXCHANGES: 'Crypto / Exchanges / PSAV / P2P / OTC',
  REMESSA_FX: 'Remessa / FX / Crossborder / Pagamentos Internacionais',
  GATEWAY_PAGAMENTOS: 'Gateway de Pagamentos',
  TELECOM: 'Telecom',
  ERP: 'ERP',
  IGAMING: 'iGaming',
  SAAS: 'SaaS',
  BAAS: 'BaaS',
  // ── Legado ──────────────────────────────────────────────────────────────
  ECOMMERCE: 'E-commerce',
  CRIPTOMOEDAS: 'Criptomoedas',
  VAREJO: 'Varejo',
  OUTROS: 'Outros',
}

export const CANAL_LABELS: Record<string, string> = {
  OUTBOUND: 'Outbound', INDICACAO: 'Indicação', INBOUND: 'Inbound',
  EVENTOS: 'Eventos', OUTRO: 'Outro',
}

export const DOCUMENTO_CATEGORIA_LABELS: Record<string, string> = {
  CONTRATO: 'Contrato', KYC_KYB: 'KYC/KYB', CERTIFICADO: 'Certificado',
  COMPROVANTE: 'Comprovante', COMERCIAL: 'Comercial', FINANCEIRO: 'Financeiro',
  OUTROS: 'Outros',
}

export const PENDENCIA_MOTIVO_LABELS: Record<string, string> = {
  ATUALIZACAO_CADASTRAL: 'Atualização cadastral',
  EXPLICACAO_MOVIMENTACAO: 'Explicação da movimentação',
  EXPLICACAO_DENUNCIA: 'Explicação sobre denúncia',
  REGULARIZACAO_DOCUMENTO: 'Regularização do CNPJ / CPF',
  OUTRO: 'Outro',
}

export const PENDENCIA_STATUS_LABELS: Record<string, string> = {
  ABERTA: 'Aberta', EM_ANALISE: 'Em análise', AGUARDANDO_CLIENTE: 'Aguardando cliente',
  RESOLVIDA: 'Resolvida', CANCELADA: 'Cancelada',
}

export const AUTOMACAO_GATILHO_LABELS: Record<string, string> = {
  CARD_CRIADO: 'Card criado',
  ETAPA_CONCLUIDA: 'Etapa concluída',
  CARD_TRANSFERIDO: 'Card transferido',
  FORMULARIO_ENVIADO: 'Formulário enviado',
}

export const AUTOMACAO_ACAO_LABELS: Record<string, string> = {
  TRANSFERIR_FUNIL: 'Transferir para outro funil',
  NOTIFICAR: 'Notificar usuário',
  CRIAR_TAREFA: 'Criar tarefa',
  ABRIR_PENDENCIA: 'Abrir pendência de compliance',
}

export function formatDateTime(d: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d))
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * MODELO OPERACIONAL — rótulo de CADA valor do enum, sem exceção.
 *
 * ── O BUG QUE ISTO CORRIGE ──────────────────────────────────────────────
 *
 * `BAAS` não estava aqui. O enum do banco sempre teve os três valores, e o
 * `<select>` sempre mandou o valor certo (`value={m}`), mas o TEXTO da opção
 * vinha deste mapa — e `MODELO_OPERACIONAL_LABELS['BAAS']` era `undefined`.
 * React renderiza `undefined` como nada, então a opção existia, estava
 * selecionável e era INVISÍVEL: um item em branco no meio da lista.
 *
 * O efeito apareceu em cinco lugares (filtro, formulário de criação, edição
 * no detalhe, badge da tabela e badge do detalhe) e nos dados: a carteira
 * tinha 29 clientes API, 4 White Label e ZERO BaaS — ninguém conseguiu
 * cadastrar o que não dava para ver.
 *
 * ── POR QUE O TIPO MUDOU ────────────────────────────────────────────────
 *
 * Era `Record<string, string>`, que aceita qualquer chave e não exige
 * nenhuma. Um valor de enum sem rótulo compilava, passava no lint e passava
 * nos testes — que verificavam a LISTA de valores, nunca a existência do
 * rótulo de cada um.
 *
 * `Record<ModeloOperacional, string>` torna a omissão um ERRO DE COMPILAÇÃO:
 * acrescentar um valor ao enum sem rótulo passa a quebrar o build, que é onde
 * esse tipo de esquecimento deve aparecer.
 *
 * O rótulo é "BaaS" — a grafia da marca. Nunca "BAAS", que é só como o enum
 * do Postgres guarda.
 */
export const MODELO_OPERACIONAL_LABELS: Record<ModeloOperacional, string> = {
  API: 'API',
  BAAS: 'BaaS',
  WHITE_LABEL: 'White Label',
}

/**
 * STATUS DO CLIENTE — todos os valores do enum, pelo mesmo motivo.
 *
 * A tela oferece apenas ATIVO e INATIVO, como manda a especificação. Os
 * outros três são LEGADO: existem no enum e podem estar gravados em linhas
 * antigas (há 2 clientes em PROSPECCAO em produção). Sem rótulo, a badge
 * desses clientes sairia vazia na tabela — o mesmo defeito do modelo
 * operacional, num campo diferente.
 */
export const CLIENTE_STATUS_LABELS: Record<ClienteStatus, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  PROSPECCAO: 'Prospecção',
  ENCERRADO: 'Encerrado',
  STANDBY: 'Stand-by',
}

/**
 * REEXPORTA o mapa de `lib/metas.ts`.
 *
 * Havia dois mapas de rótulo de meta, e eles divergiram: aqui MED aparecia
 * como "MEDs" e MED_PERCENTUAL como "MED (% das transações)", sugerindo dois
 * indicadores onde existe um. Um rótulo só pode ter uma fonte.
 */
export { META_TIPO_LABEL as META_TIPO_LABELS } from '@/lib/metas'


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

export const VOLUMETRIA_STATUS_LABELS: Record<string, string> = {
  VIGENTE: 'Vigente', PROGRAMADA: 'Programada', ENCERRADA: 'Encerrada', INATIVA: 'Inativa',
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
