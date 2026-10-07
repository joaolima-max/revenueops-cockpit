import { redirect } from 'next/navigation'

/**
 * ROTA ANTIGA — redireciona para a aba de Categorias.
 *
 * Categorias deixou de ser um item do sidebar e virou aba de Cadastros
 * Financeiros. A rota PERMANECE, como redirecionamento, porque ela esteve em
 * produção: há favoritos, links em conversas e históricos de navegador
 * apontando para cá. Devolver 404 a quem clica num link que funcionava ontem
 * é quebrar a tela sem avisar.
 *
 * O redirecionamento é PERMANENTE no sentido do produto, mas usa o `redirect`
 * padrão (307) de propósito: um 308 fica em cache no navegador, e se a
 * organização das abas mudar de novo, o cache apontaria para um lugar que não
 * existe mais — sem forma de invalidar.
 */
export default async function CategoriasRedirect() {
  redirect('/dashboard/financeiro/cadastros?aba=categorias')
}
