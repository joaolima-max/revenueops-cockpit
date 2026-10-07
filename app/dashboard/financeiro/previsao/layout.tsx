export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { podeVerPrevisaoDoBanco } from '@/lib/previsao-acesso'
import PageHeader from '@/components/dashboard/PageHeader'
import PrevisaoNav from '@/components/previsao/PrevisaoNav'

/**
 * FINANCEIRO › PREVISÃO — o cabeçalho e a navegação profunda, compartilhados
 * pelas sete áreas.
 *
 * ── A AUTORIZAÇÃO FICA AQUI, NÃO EM CADA PÁGINA ─────────────────────────
 *
 * O layout envolve TODAS as sub-rotas, então uma checagem aqui cobre as sete.
 * Repeti-la em cada página criaria sete cópias da mesma regra, livres para
 * divergir — e a primeira divergência seria uma sub-rota esquecida, acessível
 * por URL direta a quem não tem a chave.
 *
 * Isto NÃO substitui a autorização das APIs: cada rota de dados confere a
 * alçada por conta própria. Esconder a tela nunca é o que protege o dado — é o
 * handler que protege.
 *
 * `view_previsao` OU `manage_previsao` abrem a leitura (quem edita também lê).
 * `manage_previsao` é exigido nas rotas de escrita, e as telas usam a flag que
 * a API devolve para decidir se desenham os botões.
 */
export default async function PrevisaoLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  /**
   * LÊ DO BANCO, não do token.
   *
   * `view_previsao` NASCEU nesta rodada, então o JWT de quem já estava logado
   * não a tem — e um não-ADMIN com lista explícita de permissões seria barrado
   * por uma foto antiga mesmo tendo a chave gravada. O proxy, por isso, não
   * decide essas chaves (ver `PERMISSOES_RECENTES`): a autoridade é aqui.
   *
   * Isto também faz a REVOGAÇÃO valer na hora, em vez de esperar o token
   * expirar — e é o mesmo caminho que o Conselho tomou depois de ter o acesso
   * quebrado duas vezes pelo motivo oposto.
   */
  if (!(await podeVerPrevisaoDoBanco(session))) redirect('/dashboard/financeiro')

  return (
    <div className="space-y-8">
      <PageHeader
        title="Previsão"
        sub="Previsto × realizado, orçamento, projeção de caixa e forecast."
      />

      <PrevisaoNav />

      {children}
    </div>
  )
}
