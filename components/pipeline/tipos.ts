/** Contratos compartilhados entre o quadro e os modais. Só tipos — nada de runtime. */

export type ResultadoCard = 'EM_ANDAMENTO' | 'GANHO' | 'PERDIDO'

export interface AcessoFunil {
  ver: boolean
  editar: boolean
  mover: boolean
  criar: boolean
  transferir: boolean
  administrar: boolean
  apenasProprios: boolean
}

export interface FunilResumo {
  id: string
  nome: string
  descricao: string | null
  area: string | null
  ordem: number
  ativo: boolean
  exigeCliente: boolean
  acesso: AcessoFunil
}

export interface EtapaResumo {
  id: string
  funilId: string
  nome: string
  descricao: string | null
  ordem: number
  cor: string | null
  ativo: boolean
}

/**
 * O card do quadro. NÃO tem valor nem probabilidade: o card do pipeline deixou
 * de carregar número financeiro.
 *
 * `etapaId` e `resultado` são eixos independentes — um card em Negociação pode
 * estar ganho, perdido ou em andamento, e é essa combinação que o quadro
 * mostra.
 */
export interface Card {
  id: string
  title: string
  etapaId: string | null
  funilId: string | null
  resultado: ResultadoCard
  resultadoEm: string | null
  createdAt: string
  owner: { id: string; name: string }
  /**
   * O lead que originou o card. `segmento` vem DAQUI e não de `Deal.segmento`:
   * a cópia no card envelheceria, e corrigir o cadastro do lead deixaria o
   * card mostrando o segmento antigo.
   */
  lead: {
    id: string; name: string; company: string | null
    cnpj: string | null; segmento: string | null
  } | null
  cliente: { id: string; nome: string } | null
}
