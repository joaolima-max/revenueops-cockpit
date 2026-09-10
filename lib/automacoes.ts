/**
 * AUTOMACOES — casamento de gatilho e avaliacao de condicao. Sem Prisma.
 *
 * Deliberadamente pequeno: quatro gatilhos, quatro acoes, condicoes simples.
 * Nao e um motor generico de workflow, e nao existe event bus — os gatilhos se
 * penduram em `registrarMovimentacao()`, que ja e o ponto unico por onde passa
 * qualquer mudanca de card.
 */

export const GATILHOS = ['CARD_CRIADO', 'ETAPA_CONCLUIDA', 'CARD_TRANSFERIDO', 'FORMULARIO_ENVIADO'] as const
export type Gatilho = (typeof GATILHOS)[number]

export const ACOES = ['TRANSFERIR_FUNIL', 'NOTIFICAR', 'CRIAR_TAREFA', 'ABRIR_PENDENCIA'] as const
export type Acao = (typeof ACOES)[number]

export const OPERADORES = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contem'] as const
export type Operador = (typeof OPERADORES)[number]

export const OPERADOR_LABELS: Record<Operador, string> = {
  eq: 'é igual a', ne: 'é diferente de', gt: 'é maior que', gte: 'é maior ou igual a',
  lt: 'é menor que', lte: 'é menor ou igual a', contem: 'contém',
}

/** Campos do contexto que uma condicao pode inspecionar. */
export const CAMPOS_CONDICAO = ['valor', 'probabilidade', 'segmento', 'operacao', 'titulo'] as const
export type CampoCondicao = (typeof CAMPOS_CONDICAO)[number]

export const CAMPO_CONDICAO_LABELS: Record<CampoCondicao, string> = {
  valor: 'Valor do negócio', probabilidade: 'Probabilidade (%)',
  segmento: 'Segmento', operacao: 'Operação', titulo: 'Título',
}

export interface Regra {
  campo: CampoCondicao
  operador: Operador
  valor: string | number
}

/** Formato guardado em `Automacao.condicao`. `todas` = E lógico. */
export interface Condicao {
  todas: Regra[]
}

export interface ContextoGatilho {
  gatilho: Gatilho
  funilId: string | null
  etapaId: string | null
  dealId?: string
  valor?: number | null
  probabilidade?: number | null
  segmento?: string | null
  operacao?: string | null
  titulo?: string | null
  clienteId?: string | null
  ownerId?: string | null
  respostaId?: string
}

export interface AutomacaoCandidata {
  id: string
  ativo: boolean
  gatilho: Gatilho
  /** Nulo = qualquer funil. */
  funilId: string | null
  /** Nulo = qualquer etapa. */
  etapaId: string | null
  condicao: unknown
}

function valorDoCampo(ctx: ContextoGatilho, campo: CampoCondicao): unknown {
  switch (campo) {
    case 'valor': return ctx.valor
    case 'probabilidade': return ctx.probabilidade
    case 'segmento': return ctx.segmento
    case 'operacao': return ctx.operacao
    case 'titulo': return ctx.titulo
  }
}

function comparar(atual: unknown, operador: Operador, esperado: string | number): boolean {
  if (atual === undefined || atual === null) return false

  if (operador === 'contem') {
    return String(atual).toLowerCase().includes(String(esperado).toLowerCase())
  }
  if (operador === 'eq') return String(atual) === String(esperado)
  if (operador === 'ne') return String(atual) !== String(esperado)

  const a = Number(atual)
  const b = Number(esperado)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false

  switch (operador) {
    case 'gt': return a > b
    case 'gte': return a >= b
    case 'lt': return a < b
    case 'lte': return a <= b
  }
}

/** Condicao ausente ou vazia passa: a automacao vale para todo o escopo. */
export function condicaoSatisfeita(condicao: unknown, ctx: ContextoGatilho): boolean {
  if (!condicao || typeof condicao !== 'object') return true
  const c = condicao as Partial<Condicao>
  if (!Array.isArray(c.todas) || c.todas.length === 0) return true

  return c.todas.every((r) => {
    if (!r || !CAMPOS_CONDICAO.includes(r.campo) || !OPERADORES.includes(r.operador)) return false
    return comparar(valorDoCampo(ctx, r.campo), r.operador, r.valor)
  })
}

/**
 * Automacoes que devem disparar para este contexto. Escopo nulo casa com tudo,
 * o que deixa "qualquer funil" ser o padrao em vez de exigir uma regra por funil.
 */
export function automacoesQueDisparam<T extends AutomacaoCandidata>(
  automacoes: T[], ctx: ContextoGatilho,
): T[] {
  return automacoes.filter((a) =>
    a.ativo
    && a.gatilho === ctx.gatilho
    && (a.funilId === null || a.funilId === ctx.funilId)
    && (a.etapaId === null || a.etapaId === ctx.etapaId)
    && condicaoSatisfeita(a.condicao, ctx),
  )
}

export interface AutomacaoConfig {
  acao: Acao
  funilDestinoId: string | null
  etapaDestinoId: string | null
  destinatarioRole: string | null
  destinatarioUserId: string | null
  titulo: string | null
  mensagem: string | null
}

/**
 * A configuracao esta completa para a acao escolhida? Roda na gravacao, para
 * uma automacao nao ser salva num estado que so falharia na hora de executar.
 */
export function validarConfiguracao(c: AutomacaoConfig): string | null {
  switch (c.acao) {
    case 'TRANSFERIR_FUNIL':
      if (!c.funilDestinoId) return 'Escolha o funil de destino.'
      if (!c.etapaDestinoId) return 'Escolha a etapa inicial no funil de destino.'
      return null
    case 'NOTIFICAR':
      if (!c.destinatarioRole && !c.destinatarioUserId) {
        return 'Escolha quem recebe a notificação: um perfil ou um usuário.'
      }
      if (!c.titulo?.trim()) return 'Informe o título da notificação.'
      return null
    case 'CRIAR_TAREFA':
      if (!c.destinatarioUserId && !c.destinatarioRole) {
        return 'Escolha o responsável pela tarefa.'
      }
      if (!c.titulo?.trim()) return 'Informe o título da tarefa.'
      return null
    case 'ABRIR_PENDENCIA':
      if (!c.destinatarioUserId && !c.destinatarioRole) {
        return 'Escolha o responsável pela pendência.'
      }
      if (!c.titulo?.trim()) return 'Informe o título da pendência.'
      return null
  }
}

/** Substitui {{cliente}}, {{card}}, {{funil}} e {{etapa}} no texto configurado. */
export function interpolar(texto: string, vars: Record<string, string | null | undefined>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave: string) => vars[chave] ?? '—')
}
