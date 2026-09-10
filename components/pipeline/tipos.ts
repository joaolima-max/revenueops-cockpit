/** Contratos compartilhados entre o quadro e os modais. Só tipos — nada de runtime. */

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
  tipo: 'NORMAL' | 'GANHO' | 'PERDIDO'
}

export interface Card {
  id: string
  title: string
  value: number
  probability: number
  etapaId: string | null
  funilId: string | null
  owner: { id: string; name: string }
  lead: { id: string; name: string; company: string | null } | null
  cliente: { id: string; nome: string } | null
}
