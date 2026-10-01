/**
 * CLIENTES — ordenação e filtro da Carteira. Funções puras.
 */

/**
 * O STATUS do cliente, como a tela o oferece.
 *
 * ATIVO e INATIVO, e só esses dois. O enum do banco tem cinco valores
 * (PROSPECCAO, ENCERRADO, STANDBY vieram antes desta decisão) e eles ficam:
 * há clientes gravados com eles, e apagá-los do enum exigiria reescrever
 * esses registros. A tela oferece dois; a leitura entende cinco.
 */
export const STATUS_CLIENTE = ['ATIVO', 'INATIVO'] as const
export type StatusCliente = typeof STATUS_CLIENTE[number]

export const STATUS_CLIENTE_LABEL: Record<string, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  // Legados: legíveis, nunca oferecidos.
  PROSPECCAO: 'Prospecção (legado)',
  ENCERRADO: 'Encerrado (legado)',
  STANDBY: 'Standby (legado)',
}

/**
 * ORDEM DE STATUS na listagem: ATIVOS primeiro, todo o resto depois.
 *
 * O número é a chave de ordenação, e existe porque `ORDER BY status` ordenaria
 * pela posição do valor no enum — que é ATIVO, INATIVO, PROSPECCAO,
 * ENCERRADO, STANDBY. Daria o resultado certo por acidente hoje e errado no
 * dia em que um valor novo entrasse no meio.
 */
export function pesoDoStatus(status: string): number {
  if (status === 'ATIVO') return 0
  if (status === 'INATIVO') return 1
  return 2
}

/**
 * Ordena a Carteira: ATIVOS alfabéticos, depois INATIVOS alfabéticos.
 *
 * `localeCompare` com `pt-BR` e `sensitivity: 'base'` para que "Ângulo" fique
 * entre "Andrade" e "Aurora", e não no fim da lista — que é onde a ordenação
 * por código de caractere o colocaria.
 */
export function ordenarCarteira<T extends { status: string; nome: string }>(
  clientes: T[],
): T[] {
  return [...clientes].sort((a, b) => {
    const p = pesoDoStatus(a.status) - pesoDoStatus(b.status)
    if (p !== 0) return p
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  })
}

/** Normaliza para busca: sem acento, sem caixa. */
function normalizar(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export interface FiltroCarteira {
  busca?: string
  status?: string
  modelo?: string
  segmentoId?: string
  gestorId?: string
}

export interface ClienteFiltravel {
  nome: string
  cnpj?: string | null
  numeroConta?: string | null
  status: string
  modeloOperacional: string
  segmentoComercialId?: string | null
  gestorId?: string | null
}

/**
 * Aplica o filtro da Carteira.
 *
 * A BUSCA cobre nome, CNPJ e número da conta: são as três formas de chegar a
 * um cliente, e o número da conta é a única delas que o Lançamento BaaS usa.
 * Acento e caixa são ignorados, porque ninguém digita o acento ao procurar.
 */
export function filtrarCarteira<T extends ClienteFiltravel>(
  clientes: T[], f: FiltroCarteira,
): T[] {
  const termo = normalizar((f.busca ?? '').trim())
  return clientes.filter((c) => {
    if (f.status && c.status !== f.status) return false
    if (f.modelo && c.modeloOperacional !== f.modelo) return false
    if (f.segmentoId && c.segmentoComercialId !== f.segmentoId) return false
    if (f.gestorId && c.gestorId !== f.gestorId) return false
    if (!termo) return true
    return [c.nome, c.cnpj, c.numeroConta].some(
      (campo) => !!campo && normalizar(campo).includes(termo),
    )
  })
}
