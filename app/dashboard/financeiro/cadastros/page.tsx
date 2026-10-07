export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { podeGerenciarCentrosCustoDoBanco } from '@/lib/previsao-acesso'
import PageHeader from '@/components/dashboard/PageHeader'
import CadastrosClient from './CadastrosClient'

/**
 * FINANCEIRO › CADASTROS FINANCEIROS.
 *
 * Um item de menu para os três cadastros que classificam lançamento:
 * Categorias, Fornecedores e Centros de Custo. Antes, os dois primeiros eram
 * itens separados no sidebar — para dois cadastros que se consultam juntos.
 *
 * ── AS DUAS ALÇADAS ─────────────────────────────────────────────────────
 *
 * `manage_financeiro`  → Categorias e Fornecedores
 * `manage_financeiro` OU `manage_previsao` → Centros de Custo
 *
 * O centro de custo é insumo do ORÇAMENTO, então quem responde pelo
 * planejamento precisa poder criá-lo mesmo sem administrar o resto do
 * Financeiro. Ver `lib/previsao-acesso.ts`.
 *
 * ── `Suspense` É OBRIGATÓRIO AQUI ───────────────────────────────────────
 *
 * `CadastrosClient` lê a aba de `useSearchParams`, e no App Router um
 * componente de cliente que usa esse hook precisa estar dentro de um limite de
 * Suspense — sem ele o build falha ao pré-renderizar a rota.
 */
export default async function CadastrosFinanceirosPage() {
  const session = await getSession()
  const podeGerenciarFinanceiro = !!session &&
    hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
  // DO BANCO: `manage_previsao` é uma das duas chaves que liberam o cadastro,
  // e ela nasceu nesta rodada — o token de quem já estava logado não a tem.
  const podeGerenciarCentros = await podeGerenciarCentrosCustoDoBanco(session)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cadastros Financeiros"
        sub="Categorias, fornecedores e centros de custo — o que classifica cada lançamento."
      />

      <Suspense fallback={<p className="t-sm text-subtle">Carregando…</p>}>
        <CadastrosClient
          podeGerenciarFinanceiro={podeGerenciarFinanceiro}
          podeGerenciarCentros={podeGerenciarCentros}
        />
      </Suspense>
    </div>
  )
}
