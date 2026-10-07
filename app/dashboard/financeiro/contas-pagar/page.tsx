import { redirect } from 'next/navigation'

/**
 * ROTA ANTIGA — redireciona para CP / CR.
 *
 * Contas a Pagar deixou de ser item do sidebar e virou a aba de entrada de
 * CP / CR. A rota PERMANECE, como redirecionamento, porque esteve em
 * produção: há favoritos, links em conversas e históricos de navegador
 * apontando para cá. Devolver 404 a quem clica num link que funcionava ontem
 * é quebrar a tela sem avisar.
 *
 * 307 e não 308, pela mesma razão de `categorias/page.tsx`: um 308 fica em
 * cache no navegador, e se a organização das abas mudar de novo o cache
 * apontaria para um lugar que não existe mais — sem forma de invalidar.
 */
export default async function ContasPagarRedirect() {
  redirect('/dashboard/financeiro/cp-cr')
}
