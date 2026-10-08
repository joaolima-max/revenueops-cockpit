import SubNav from '@/components/ui/SubNav'

/**
 * NAVEGAÇÃO PROFUNDA DE CONDIÇÕES BAAS.
 *
 * ── O CONTRATO E A APURAÇÃO, NO MESMO LUGAR ─────────────────────────────
 *
 * Eram dois menus: "Condições BaaS" (o cadastro do parceiro — tarifas, PIX,
 * KYC, sustentação, API, overprice, mensalidades, número de conta) e
 * "Lançamentos BaaS" (a apuração mensal que usa essas tarifas e produz o
 * lançamento financeiro, o título a receber e o título a pagar).
 *
 * São o MESMO assunto em dois tempos: o que foi acordado e o que isso rendeu
 * no mês. Conferir uma apuração exigia sair do módulo para reler a tarifa que
 * a originou — e voltar de memória.
 *
 * ── O BOTÃO SE CHAMA "LANÇAMENTOS", SEM "BAAS" ──────────────────────────
 *
 * Dentro de "Condições BaaS" o sufixo é redundante: o módulo já disse que o
 * assunto é BaaS. "Lançamentos BaaS" aqui leria como se houvesse outro tipo
 * de lançamento na mesma tela.
 */

export const AREAS_CONDICOES_BAAS = [
  { href: '', label: 'Condições' },
  { href: '/lancamentos', label: 'Lançamentos' },
] as const

export const RAIZ_CONDICOES_BAAS = '/dashboard/financeiro/condicoes-baas'

export default function CondicoesBaasNav({
  podeVerLancamentos,
}: {
  /**
   * A aba de Lançamentos exige `view_receita` — a mesma chave que a tela já
   * exigia como menu próprio. Sem ela o link não é desenhado, em vez de ser
   * desenhado e levar a um redirect. A página continua conferindo a chave:
   * esconder o link não autoriza nada.
   */
  podeVerLancamentos: boolean
}) {
  return (
    <SubNav
      raiz={RAIZ_CONDICOES_BAAS}
      rotulo="Áreas de Condições BaaS"
      areas={AREAS_CONDICOES_BAAS.map((a) =>
        a.href === '/lancamentos' ? { ...a, visivel: podeVerLancamentos } : a,
      )}
    />
  )
}
