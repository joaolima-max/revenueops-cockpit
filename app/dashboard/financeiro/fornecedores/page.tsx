import { redirect } from 'next/navigation'

/**
 * ROTA ANTIGA — redireciona para a aba de Fornecedores.
 *
 * Mesma razão de `categorias/page.tsx`: a tela virou aba de Cadastros
 * Financeiros, e a rota permanece como redirecionamento porque esteve em
 * produção. Ver o comentário de lá para por que 307 e não 308.
 */
export default async function FornecedoresRedirect() {
  redirect('/dashboard/financeiro/cadastros?aba=fornecedores')
}
