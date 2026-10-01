/**
 * LEMBRETES — quais avisos vencem hoje, e para quem.
 *
 * Funções PURAS: recebem os registros e a data de referência, devolvem as
 * notificações a criar. Nenhuma consulta, nenhum relógio implícito — é o que
 * torna "falta 1 dia" testável sem esperar um dia.
 *
 * IDEMPOTÊNCIA PELA CHAVE. Cada lembrete carrega uma `chave` que identifica o
 * EVENTO, não a mensagem: `tarefa:<id>:D-3:<destinatário>`. A coluna é UNIQUE,
 * então o banco recusa a segunda inserção do mesmo lembrete e reprocessar o
 * dia — por retry, por deploy, por execução manual — não duplica avisos. Sem
 * isso, qualquer reexecução enviaria tudo de novo.
 *
 * O MARCO É O DIA, não o instante. "3 dias antes" compara datas em UTC, sem
 * horas: uma tarefa que vence às 23h e outra às 01h do mesmo dia estão ambas
 * a 3 dias, e comparar timestamps faria uma delas pular o marco.
 *
 * NÃO EXISTE ENVIO EXTERNO aqui. Tudo é notificação interna, lida na central.
 */

import type { NovaNotificacao } from '@/lib/notificacoes'

/** Dias antes do vencimento que geram aviso, por tipo. */
export const MARCOS_TAREFA = [7, 3, 1, 0, -1] as const
export const MARCOS_COMPLIANCE = [3, 0, -1] as const
export const MARCOS_TITULO = [3, 0, -1] as const
/** Follow Up avisa NO DIA. Antes disso não há o que fazer com o aviso. */
export const MARCOS_FOLLOWUP = [0] as const

/** Meia-noite UTC do dia da data — o grão de comparação de todos os marcos. */
export function diaUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Quantos dias faltam, em dias de calendário.
 *
 * Positivo = ainda falta. Zero = hoje. Negativo = já passou.
 */
export function diasAte(prazo: Date, hoje: Date): number {
  return Math.round((diaUtc(prazo) - diaUtc(hoje)) / 86400000)
}

/**
 * O marco que a data de hoje representa, ou null quando hoje não é marco.
 *
 * Só o -1 é tratado como "a partir de": depois de vencer, o aviso de atraso
 * seria repetido todo dia se cada dia fosse um marco novo — e um aviso que
 * chega todo dia deixa de ser lido. Então vence uma vez, no primeiro dia de
 * atraso, e o atraso continua visível no próprio ambiente.
 */
export function marcoDe(dias: number, marcos: readonly number[]): number | null {
  return marcos.includes(dias) ? dias : null
}

/** Texto do marco, do ponto de vista de quem lê. */
export function rotuloMarco(dias: number): string {
  if (dias > 1) return `vence em ${dias} dias`
  if (dias === 1) return 'vence amanhã'
  if (dias === 0) return 'vence hoje'
  return 'está vencido'
}

/** `chave` do lembrete: o evento, não a mensagem. UNIQUE no banco. */
export function chaveLembrete(
  entidade: string, entidadeId: string, dias: number, destinatarioId: string,
): string {
  return `${entidade}:${entidadeId}:D${dias >= 0 ? '-' : '+'}${Math.abs(dias)}:${destinatarioId}`
}

/* ========================================================================= *
 * TAREFAS — 7, 3, 1, no dia, e 1 dia após
 * ========================================================================= */

export interface TarefaLembrete {
  id: string
  titulo: string
  dueDate: Date | null
  status: string
  responsavelId: string | null
}

/** Tarefa encerrada não gera lembrete: não há o que cobrar de quem terminou. */
function tarefaAberta(status: string): boolean {
  return status === 'PENDENTE' || status === 'EM_ANDAMENTO'
}

export function lembretesDeTarefas(
  tarefas: TarefaLembrete[], hoje: Date,
): NovaNotificacao[] {
  const saida: NovaNotificacao[] = []

  for (const t of tarefas) {
    if (!t.dueDate || !t.responsavelId || !tarefaAberta(t.status)) continue

    const dias = diasAte(t.dueDate, hoje)
    const marco = marcoDe(dias, MARCOS_TAREFA)
    if (marco === null) continue

    saida.push({
      destinatarioId: t.responsavelId,
      titulo: dias < 0 ? `Tarefa vencida: ${t.titulo}` : `Tarefa ${rotuloMarco(dias)}: ${t.titulo}`,
      mensagem: `A tarefa "${t.titulo}" ${rotuloMarco(dias)}.`,
      origem: 'TAREFA',
      entidade: 'Tarefa',
      entidadeId: t.id,
      href: '/dashboard/tarefas',
      chave: chaveLembrete('tarefa', t.id, dias, t.responsavelId),
    })
  }

  return saida
}

/* ========================================================================= *
 * FOLLOW UP — no dia
 * ========================================================================= */

export interface FollowUpLembrete {
  id: string
  titulo: string
  proximoContato: Date | null
  responsavelId: string | null
  clienteNome: string
}

export function lembretesDeFollowUp(
  followUps: FollowUpLembrete[], hoje: Date,
): NovaNotificacao[] {
  const saida: NovaNotificacao[] = []

  for (const f of followUps) {
    if (!f.proximoContato || !f.responsavelId) continue

    const dias = diasAte(f.proximoContato, hoje)
    if (marcoDe(dias, MARCOS_FOLLOWUP) === null) continue

    saida.push({
      destinatarioId: f.responsavelId,
      titulo: `Follow Up hoje: ${f.clienteNome}`,
      mensagem: `"${f.titulo}" está agendado para hoje com ${f.clienteNome}.`,
      origem: 'FOLLOW_UP',
      entidade: 'FollowUp',
      entidadeId: f.id,
      href: '/dashboard/followup',
      chave: chaveLembrete('followup', f.id, dias, f.responsavelId),
    })
  }

  return saida
}

/* ========================================================================= *
 * COMPLIANCE — 3 dias antes, no dia, 1 dia após
 * ========================================================================= */

export interface PendenciaLembrete {
  id: string
  clienteNome: string
  prazo: Date | null
  status: string
  responsavelId: string | null
}

export function lembretesDeCompliance(
  pendencias: PendenciaLembrete[], hoje: Date,
  encerrado: (status: string) => boolean,
): NovaNotificacao[] {
  const saida: NovaNotificacao[] = []

  for (const p of pendencias) {
    if (!p.prazo || !p.responsavelId || encerrado(p.status)) continue

    const dias = diasAte(p.prazo, hoje)
    if (marcoDe(dias, MARCOS_COMPLIANCE) === null) continue

    saida.push({
      destinatarioId: p.responsavelId,
      titulo: dias < 0
        ? `Pendência de compliance vencida: ${p.clienteNome}`
        : `Compliance ${rotuloMarco(dias)}: ${p.clienteNome}`,
      mensagem: `A pendência de compliance de ${p.clienteNome} ${rotuloMarco(dias)}.`,
      origem: 'COMPLIANCE',
      entidade: 'PendenciaCompliance',
      entidadeId: p.id,
      href: '/dashboard/compliance',
      chave: chaveLembrete('compliance', p.id, dias, p.responsavelId),
    })
  }

  return saida
}

/* ========================================================================= *
 * CONTAS A PAGAR / RECEBER — avisam o DEPARTAMENTO financeiro
 * ========================================================================= */

export interface TituloLembrete {
  id: string
  descricao: string
  vencimento: Date | null
  /** true quando o título já foi baixado ou cancelado — não gera aviso. */
  encerrado: boolean
}

/**
 * Lembretes de títulos, para CADA pessoa do Financeiro.
 *
 * O destinatário é o departamento, não um dono: título não tem responsável
 * individual, e mandar para uma pessoa escolhida faria o aviso sumir quando
 * ela estivesse de férias. A chave inclui o destinatário, então cada pessoa
 * tem o seu lembrete e marcar como lida é individual.
 */
export function lembretesDeTitulos(
  titulos: TituloLembrete[],
  financeiro: string[],
  hoje: Date,
  tipo: 'PAGAR' | 'RECEBER',
): NovaNotificacao[] {
  if (financeiro.length === 0) return []

  const saida: NovaNotificacao[] = []
  const origem = tipo === 'PAGAR' ? 'CONTA_PAGAR' : 'CONTA_RECEBER'
  const href = tipo === 'PAGAR'
    ? '/dashboard/financeiro/contas-pagar'
    : '/dashboard/financeiro/contas-receber'
  const substantivo = tipo === 'PAGAR' ? 'a pagar' : 'a receber'

  for (const t of titulos) {
    if (!t.vencimento || t.encerrado) continue

    const dias = diasAte(t.vencimento, hoje)
    if (marcoDe(dias, MARCOS_TITULO) === null) continue

    for (const destinatarioId of financeiro) {
      saida.push({
        destinatarioId,
        titulo: dias < 0
          ? `Título ${substantivo} vencido: ${t.descricao}`
          : `Título ${substantivo} ${rotuloMarco(dias)}: ${t.descricao}`,
        mensagem: `O título "${t.descricao}" ${rotuloMarco(dias)}.`,
        origem,
        entidade: tipo === 'PAGAR' ? 'ContaPagar' : 'ContaReceber',
        entidadeId: t.id,
        href,
        chave: chaveLembrete(tipo === 'PAGAR' ? 'pagar' : 'receber', t.id, dias, destinatarioId),
      })
    }
  }

  return saida
}

/* ========================================================================= *
 * LANÇAMENTO DIÁRIO — ausência de lançamento
 * ========================================================================= */

/** "YYYY-MM-DD" em UTC. Identifica o DIA ausente dentro da chave. */
export function diaIso(d: Date): string {
  return new Date(diaUtc(d)).toISOString().slice(0, 10)
}

/**
 * Avisa o Financeiro quando o Lançamento Diário de ANTEONTEM não existe.
 *
 * Por que anteontem e não ontem: a regra é "após 1 dia sem lançamento". O
 * lançamento de um dia é feito no dia seguinte, então o dia D só está
 * atrasado a partir de D+2. Cobrar em D+1 reclamaria do prazo normal.
 *
 * UM AVISO POR DIA AUSENTE, nunca um alerta recorrente: a chave inclui a data
 * do dia que faltou, então cada ausência cobra uma vez. Sem isso, um dia sem
 * lançamento geraria aviso todas as execuções, para sempre.
 *
 * Fim de semana e feriado não são exceção aqui: o produto não tem calendário
 * de operação, e inventar um esconderia ausência real de dia útil. O que o
 * aviso diz é verificável — não há lançamento para aquela data.
 */
export function lembreteDeLancamentoAusente(
  datasComLancamento: Set<string>,
  financeiro: string[],
  hoje: Date,
): NovaNotificacao[] {
  if (financeiro.length === 0) return []

  const alvo = new Date(diaUtc(hoje) - 2 * 86400000)
  const iso = diaIso(alvo)
  if (datasComLancamento.has(iso)) return []

  const legivel = alvo.toLocaleDateString('pt-BR', { timeZone: 'UTC' })

  return financeiro.map((destinatarioId) => ({
    destinatarioId,
    titulo: `Lançamento Diário ausente: ${legivel}`,
    mensagem:
      `Não há Lançamento Diário registrado para ${legivel}. ` +
      `TPV, receita tarifária, saldo, transações e MEDs desse dia ficam sem fonte.`,
    origem: 'LANCAMENTO_DIARIO' as const,
    entidade: 'LancamentoDiario',
    entidadeId: iso,
    href: '/dashboard/forecast',
    chave: `lancamento:${iso}:${destinatarioId}`,
  }))
}
