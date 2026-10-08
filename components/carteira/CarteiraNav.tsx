import SubNav from '@/components/ui/SubNav'

/**
 * NAVEGAÇÃO PROFUNDA DE CLIENTES.
 *
 * ── TRÊS LEITURAS DO MESMO CLIENTE ──────────────────────────────────────
 *
 * Eram três menus numa seção CARTEIRA própria: Clientes (o cadastro, com
 * gestor, segmento, status e regra de ativo/inativo), Volumetria (o volume
 * mínimo contratado e o seu acompanhamento) e Certificados (o certificado
 * digital de cada cliente, com numeração, versões e envios).
 *
 * As três respondem sobre o MESMO cliente, e a pergunta de quem abre uma
 * delas quase sempre continua nas outras: "este cliente bate a volumetria?",
 * "o certificado dele está válido?". Três menus obrigavam a sair da carteira e
 * reencontrar o cliente em cada tela.
 *
 * ── A SEÇÃO CARTEIRA SAIU; O MÓDULO É DO COMERCIAL ──────────────────────
 *
 * Clientes passou a morar em COMERCIAL, depois de Pipeline: é o desfecho do
 * funil, e quem opera o pipeline é quem consulta a carteira. Uma seção
 * própria para um item só é um cabeçalho sem conteúdo.
 *
 * ── A TELA INICIAL CONTINUA SENDO CLIENTES ──────────────────────────────
 *
 * A raiz (`/dashboard/carteira`) é o cadastro, como sempre foi. Volumetria e
 * Certificados são sub-rotas: quem tinha o endereço antigo nos favoritos cai
 * na aba certa por redirecionamento.
 */

export const AREAS_CARTEIRA = [
  { href: '', label: 'Clientes' },
  { href: '/volumetria', label: 'Volumetria' },
  { href: '/certificados', label: 'Certificados' },
] as const

export const RAIZ_CARTEIRA = '/dashboard/carteira'

export default function CarteiraNav({
  podeVerCertificados,
}: {
  /**
   * A aba de Certificados exige `view_certificates` — a mesma chave que a
   * tela já exigia como menu próprio. Sem ela o link não é desenhado, em vez
   * de ser desenhado e levar a um redirect. A página continua conferindo.
   */
  podeVerCertificados: boolean
}) {
  return (
    <SubNav
      raiz={RAIZ_CARTEIRA}
      rotulo="Áreas de Clientes"
      areas={AREAS_CARTEIRA.map((a) =>
        a.href === '/certificados' ? { ...a, visivel: podeVerCertificados } : a,
      )}
    />
  )
}
