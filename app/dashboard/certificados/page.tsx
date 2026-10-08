import { redirect } from 'next/navigation'

/** ROTA ANTIGA — virou a aba "Certificados" de Clientes. */
export default async function CertificadosRedirect() {
  redirect('/dashboard/carteira/certificados')
}
