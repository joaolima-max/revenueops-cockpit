import { getSession } from '@/lib/auth'
import CarteiraClient from './CarteiraClient'

export default async function CarteiraPage() {
  const session = await getSession()
  return <CarteiraClient role={session?.role || 'COMERCIAL'} />
}
