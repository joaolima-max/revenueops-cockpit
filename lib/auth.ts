import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const JWT_SECRET = process.env.JWT_SECRET!

export interface TokenPayload {
  userId: string
  email: string
  role: string
  name: string
  permissoes?: string[]
  /**
   * SOCIO. Primeira barreira do Conselho, no proxy. A palavra final e de
   * `socio()`, que le do banco: um token de 7 dias faria a revogacao de um
   * socio demorar uma semana para valer.
   */
  isPartner?: boolean
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<TokenPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')?.value
  if (!token) return null
  return verifyToken(token)
}
