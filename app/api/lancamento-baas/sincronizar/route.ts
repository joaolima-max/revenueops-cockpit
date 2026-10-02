import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { sincronizarTitulosFaltantes } from '@/lib/baas-titulos'

/**
 * SINCRONIZAR OS TÍTULOS DOS LANÇAMENTOS BAAS.
 *
 * Completa o que falta nos lançamentos que ficaram com conjunto incompleto —
 * herança do tempo em que criar um lançamento não gerava os três registros
 * sozinho, e de títulos apagados à mão em Lançamentos (o que zera a FK).
 *
 * É uma OPERAÇÃO DE REPARO, não um caminho normal: a criação agora gera os
 * títulos no mesmo passo, então em uso corrente esta rota não encontra nada
 * para fazer e devolve `reparados: 0`.
 *
 * Idempotente e conservadora — conjunto completo não é tocado, e nada
 * liquidado é reescrito. Ver `sincronizarTitulosFaltantes`.
 *
 * POST, não GET: altera estado. Um GET que escreve seria pré-carregado por
 * qualquer crawler ou prefetch do navegador.
 */
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_receita', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const r = await sincronizarTitulosFaltantes(session.userId)

  // Só audita quando algo mudou. Registrar "examinei 0" a cada clique encheria
  // a trilha de linhas que não contam nada.
  if (r.reparados > 0 || r.falhas.length > 0) {
    await logAudit(
      session.userId, 'SINCRONIZOU_TITULOS_BAAS', 'LancamentoBaas', undefined,
      `examinados ${r.examinados} · reparados ${r.reparados}`
      + (r.falhas.length > 0
        ? ` · falhas ${r.falhas.length}: `
          + r.falhas.map((f) => `${f.parceiro} (${f.motivo})`).join('; ')
        : ''),
    )
  }

  return NextResponse.json(r)
}
