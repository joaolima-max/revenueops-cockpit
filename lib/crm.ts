/**
 * CRM — analitica do Pipeline. NAO ha entidade de CRM.
 *
 * Tudo aqui e derivado de `PipelineMovimentacao` e `Deal`, que a v11 ja grava.
 * Duplicar deals, leads ou movimentacoes para alimentar um dashboard seria
 * criar uma segunda verdade sobre o mesmo fato.
 *
 * As funcoes de calculo sao puras e recebem as linhas ja carregadas, para
 * poderem ser exercitadas sem banco.
 */

export interface MovimentoBruto {
  dealId: string
  tipo: 'CRIACAO' | 'MOVIMENTO_ETAPA' | 'TRANSFERENCIA_FUNIL'
  funilOrigemId: string | null
  etapaOrigemId: string | null
  funilDestinoId: string
  etapaDestinoId: string
  createdAt: Date
}

export interface CardBruto {
  id: string
  ownerId: string
  ownerNome: string
  funilId: string | null
  etapaId: string | null
  valor: number
  criadoEm: Date
  fechadoEm: Date | null
}

const DIA_MS = 86_400_000

/**
 * Tempo medio, em dias, que os cards passam em cada etapa.
 *
 * A saida de uma etapa e a proxima movimentacao do MESMO card. O ultimo
 * trecho fica em aberto — o card ainda esta la — e conta ate agora, senao a
 * etapa onde tudo empaca apareceria como a mais rapida do funil.
 */
export function tempoMedioPorEtapa(
  movimentos: MovimentoBruto[], agora = new Date(),
): Map<string, { dias: number; amostras: number }> {
  const porCard = new Map<string, MovimentoBruto[]>()
  for (const m of movimentos) {
    const lista = porCard.get(m.dealId) ?? []
    lista.push(m)
    porCard.set(m.dealId, lista)
  }

  const acumulado = new Map<string, { total: number; amostras: number }>()

  for (const lista of porCard.values()) {
    const ordenada = [...lista].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    for (let i = 0; i < ordenada.length; i++) {
      const entrada = ordenada[i]
      const saida = ordenada[i + 1]?.createdAt ?? agora
      const dias = (saida.getTime() - entrada.createdAt.getTime()) / DIA_MS
      if (dias < 0) continue

      const chave = entrada.etapaDestinoId
      const atual = acumulado.get(chave) ?? { total: 0, amostras: 0 }
      atual.total += dias
      atual.amostras += 1
      acumulado.set(chave, atual)
    }
  }

  const saida = new Map<string, { dias: number; amostras: number }>()
  for (const [etapaId, v] of acumulado) {
    saida.set(etapaId, { dias: v.total / v.amostras, amostras: v.amostras })
  }
  return saida
}

/**
 * Conversao de cada etapa para a seguinte: dos cards que ENTRARAM na etapa,
 * quantos chegaram a alguma etapa posterior do mesmo funil.
 */
export function conversaoPorEtapa(
  movimentos: MovimentoBruto[], ordemEtapas: string[],
): Map<string, { entraram: number; avancaram: number; taxa: number | null }> {
  const posicao = new Map(ordemEtapas.map((id, i) => [id, i]))
  const maiorPosicao = new Map<string, number>()
  const entrouEm = new Map<string, Set<string>>()

  for (const m of movimentos) {
    const pos = posicao.get(m.etapaDestinoId)
    if (pos === undefined) continue

    const conjunto = entrouEm.get(m.etapaDestinoId) ?? new Set<string>()
    conjunto.add(m.dealId)
    entrouEm.set(m.etapaDestinoId, conjunto)

    maiorPosicao.set(m.dealId, Math.max(maiorPosicao.get(m.dealId) ?? -1, pos))
  }

  const saida = new Map<string, { entraram: number; avancaram: number; taxa: number | null }>()
  for (const [i, etapaId] of ordemEtapas.entries()) {
    const cards = entrouEm.get(etapaId) ?? new Set<string>()
    const entraram = cards.size
    let avancaram = 0
    for (const dealId of cards) if ((maiorPosicao.get(dealId) ?? -1) > i) avancaram++

    saida.set(etapaId, {
      entraram,
      avancaram,
      taxa: entraram > 0 ? (avancaram / entraram) * 100 : null,
    })
  }
  return saida
}

export interface ConversaoResponsavel {
  ownerId: string
  ownerNome: string
  total: number
  ganhos: number
  perdas: number
  abertos: number
  valorAberto: number
  taxa: number | null
}

/**
 * Conversao por responsavel. A taxa considera so os cards ja decididos —
 * incluir os que ainda estao em aberto puniria quem tem pipeline cheio.
 */
export function conversaoPorResponsavel(
  cards: CardBruto[], etapasGanho: Set<string>, etapasPerda: Set<string>,
): ConversaoResponsavel[] {
  const porDono = new Map<string, ConversaoResponsavel>()

  for (const c of cards) {
    const atual = porDono.get(c.ownerId) ?? {
      ownerId: c.ownerId, ownerNome: c.ownerNome,
      total: 0, ganhos: 0, perdas: 0, abertos: 0, valorAberto: 0, taxa: null,
    }
    atual.total++

    if (c.etapaId && etapasGanho.has(c.etapaId)) atual.ganhos++
    else if (c.etapaId && etapasPerda.has(c.etapaId)) atual.perdas++
    else { atual.abertos++; atual.valorAberto += c.valor }

    porDono.set(c.ownerId, atual)
  }

  return [...porDono.values()]
    .map((r) => ({ ...r, taxa: r.ganhos + r.perdas > 0 ? (r.ganhos / (r.ganhos + r.perdas)) * 100 : null }))
    .sort((a, b) => b.total - a.total)
}

/** Transferencias entre funis, agregadas por par origem→destino. */
export function conversaoEntreFunis(
  movimentos: MovimentoBruto[],
): Array<{ origemId: string; destinoId: string; total: number }> {
  const pares = new Map<string, { origemId: string; destinoId: string; total: number }>()

  for (const m of movimentos) {
    if (m.tipo !== 'TRANSFERENCIA_FUNIL' || !m.funilOrigemId) continue
    const chave = `${m.funilOrigemId}→${m.funilDestinoId}`
    const atual = pares.get(chave) ?? { origemId: m.funilOrigemId, destinoId: m.funilDestinoId, total: 0 }
    atual.total++
    pares.set(chave, atual)
  }

  return [...pares.values()].sort((a, b) => b.total - a.total)
}

/** Ciclo total em dias dos cards ja encerrados. Null quando nenhum fechou ainda. */
export function cicloMedioDias(cards: CardBruto[]): number | null {
  const fechados = cards.filter((c) => c.fechadoEm)
  if (fechados.length === 0) return null
  const total = fechados.reduce((s, c) => s + (c.fechadoEm!.getTime() - c.criadoEm.getTime()) / DIA_MS, 0)
  return total / fechados.length
}

/**
 * Gargalo: etapa cujo tempo medio passa do dobro da mediana do funil e que
 * ainda tem cards parados. O dobro da mediana evita apontar como gargalo uma
 * etapa que e naturalmente mais longa que as vizinhas num funil curto.
 */
export function gargalos(
  tempos: Map<string, { dias: number; amostras: number }>,
  volumePorEtapa: Map<string, number>,
): Array<{ etapaId: string; dias: number; cards: number; vezesMediana: number }> {
  const valores = [...tempos.values()].map((t) => t.dias).sort((a, b) => a - b)
  if (valores.length < 3) return []

  const mediana = valores[Math.floor(valores.length / 2)]
  if (mediana <= 0) return []

  return [...tempos.entries()]
    .filter(([etapaId, t]) => t.dias > mediana * 2 && (volumePorEtapa.get(etapaId) ?? 0) > 0)
    .map(([etapaId, t]) => ({
      etapaId,
      dias: t.dias,
      cards: volumePorEtapa.get(etapaId) ?? 0,
      vezesMediana: t.dias / mediana,
    }))
    .sort((a, b) => b.dias - a.dias)
}
