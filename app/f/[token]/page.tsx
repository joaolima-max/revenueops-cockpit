import type { Metadata } from 'next'
import FormularioPublico from './FormularioPublico'

export const dynamic = 'force-dynamic'

// Formulário público não deve ser indexado: o link é dirigido a quem o recebeu.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function PaginaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <FormularioPublico token={token} />
}
