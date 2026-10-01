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
 * EXCLUSÃO
 * ========================================================================= */

export interface Bloqueio {
  /** Quantos cards de pipeline impedem a exclusão. */
  cards: number
  mensagem: string
}

/**
 * A exclusão do lead está bloqueada?
 *
 * COMENTÁRIOS E ATIVIDADES não bloqueiam: são registros SOBRE o lead, sem
 * vida própria, e o banco os apaga em cascata junto com ele.
 *
 * CARDS DE PIPELINE bloqueiam. O card carrega histórico — movimentações,
 * comentários, desfecho — e apagá-lo junto com o lead destruiria esse
 * histórico sem ninguém ter pedido. Também não serve deixar o card órfão com
 * `leadId` nulo: desde a v17 todo card nasce de um lead existente, e um card
 * sem lead é um registro que a própria tela não sabe explicar.
 *
 * Então a exclusão é recusada com a razão e a contagem, e quem decide o que
 * fazer com o histórico é a pessoa — removendo ou transferindo os cards antes.
 */
export function bloqueioDeExclusao(cards: number): Bloqueio | null {
  if (cards === 0) return null
  return {
    cards,
    mensagem:
      `Este lead tem ${cards} card${cards === 1 ? '' : 's'} no Pipeline. ` +
      `Excluir o lead apagaria o histórico desse${cards === 1 ? '' : 's'} card${cards === 1 ? '' : 's'} ` +
      `— movimentações, comentários e desfecho. Remova ou transfira ` +
      `${cards === 1 ? 'o card' : 'os cards'} antes de excluir o lead.`,
  }
}
