import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !user.active) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    /**
     * As PERMISSÕES entram no token.
     *
     * Antes não entravam, e o efeito era silencioso: `session.permissoes` era
     * sempre `undefined`, então `hasPermission` caía no default do perfil e a
     * lista configurada na tela de Usuários nunca valia para ninguém que não
     * fosse ADMIN. O proxy precisa dessa lista para barrar Conselho e
     * Auditoria antes da página.
     *
     * Lista corrompida é ausência de permissão, nunca permissão total.
     */
    let permissoes: string[] | undefined
    if (user.permissoes) {
      try {
        const lista = JSON.parse(user.permissoes)
        if (Array.isArray(lista)) {
          permissoes = lista.filter((x): x is string => typeof x === 'string')
        }
      } catch {
        permissoes = []
      }
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissoes,
      isPartner: user.isPartner,
    })

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
