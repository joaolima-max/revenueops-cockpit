export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { diretor } from '@/lib/autorizacao'
import LixeiraClient from './LixeiraClient'

/**
 * LIXEIRA DE LEADS — só DIRETORES.
 *
 * Hierarquia, não perfil: um Diretor Colaborador entra, um Admin Operador
 * não. Conferido no BANCO, como o Conselho: um token de sete dias faria um
 * rebaixamento demorar uma semana para valer.
 *
 * O proxy já barra por rota, mas a página não pode depender disso — e a API
 * confere de novo, porque esconder a tela não impede um GET.
 */
export default async function LixeiraPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!(await diretor(session))) redirect('/dashboard/leads')

  return <LixeiraClient />
}
