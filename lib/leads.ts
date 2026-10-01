/**
 * LEADS — obrigatoriedades e regra de exclusão. Funções puras.
 *
 * O cadastro exige DUAS coisas e só duas: a empresa e o executivo. Todo o
 * resto é opcional, porque um lead nasce de uma conversa — exigir CNPJ,
 * segmento e canal na criação faz o vendedor inventar valores para conseguir
 * salvar, e dado inventado é pior que dado ausente.
 */

export interface EntradaLead {
  /** Nome do executivo — o campo `name`. */
  name?: unknown
  /** Nome da empresa — o campo `company`. */
  company?: unknown
}

export interface ErroValidacao {
  campo: string
  mensagem: string
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Valida o cadastro de um lead. Devolve a lista de erros — vazia quando passa.
 *
 * A validação é do SERVIDOR, não só da tela: o formulário pode marcar os
 * campos como obrigatórios, mas quem garante é quem grava.
 */
export function validarLead(e: EntradaLead): ErroValidacao[] {
  const erros: ErroValidacao[] = []
  if (!texto(e.company)) {
    erros.push({ campo: 'company', mensagem: 'O nome da empresa é obrigatório.' })
  }
  if (!texto(e.name)) {
    erros.push({ campo: 'name', mensagem: 'O nome do executivo é obrigatório.' })
  }
  return erros
}

/** Os dois campos obrigatórios, para a tela marcá-los sem duplicar a regra. */
export const CAMPOS_OBRIGATORIOS_LEAD = ['company', 'name'] as const

/* ========================================================================= *
 * LIXEIRA
 * ========================================================================= */

/**
 * Excluir um lead passou a significar MOVER PARA A LIXEIRA.
 *
 * `bloqueioDeExclusao` saiu junto com a exclusão física. Ele existia para
 * recusar a exclusão de um lead com cards, porque apagar levaria o histórico
 * de pipeline — movimentações, comentários, desfecho. A lixeira não leva nada:
 * o registro sai de circulação e o passado continua legível, então não há mais
 * o que bloquear.
 *
 * O que a lixeira garante, e o que estas funções descrevem.
 */

/** O lead está na lixeira? */
export function naLixeira(lead: { deletedAt?: Date | string | null }): boolean {
  return !!lead.deletedAt
}

/**
 * O filtro que TODA consulta normal de lead precisa carregar.
 *
 * Exportado como objeto para que o esquecimento fique visível: uma consulta
 * sem `...FILTRO_ATIVOS` devolve leads da lixeira, e é um erro silencioso —
 * a lista simplesmente volta a mostrar o que foi descartado.
 */
export const FILTRO_ATIVOS = { deletedAt: null } as const

/** Texto de quem e quando descartou, para a Lixeira mostrar. */
export function descarteTexto(
  lead: { deletedAt?: Date | string | null; deletedBy?: { name: string } | null },
): string {
  if (!lead.deletedAt) return '—'
  const quando = new Date(lead.deletedAt).toLocaleString('pt-BR', { timeZone: 'UTC' })
  return lead.deletedBy ? `${quando} por ${lead.deletedBy.name}` : quando
}
