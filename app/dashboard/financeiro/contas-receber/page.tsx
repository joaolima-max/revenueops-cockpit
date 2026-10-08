import { redirect } from 'next/navigation'

/** ROTA ANTIGA — virou aba de CP / CR. Ver `contas-pagar/page.tsx`. */
export default async function ContasReceberRedirect() {
  redirect('/dashboard/financeiro/cp-cr/receber')
}
