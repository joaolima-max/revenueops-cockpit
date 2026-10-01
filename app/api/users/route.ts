import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { roleDoPerfil, DEPARTAMENTOS, HIERARQUIAS, type Perfil, type Departamento, type Hierarquia } from '@/lib/permissions'

/**
 * Só aceita valor que EXISTE no enum. Texto solto do corpo da requisição não
 * pode virar coluna de enum: o Prisma recusaria com erro genérico, e o
 * administrador veria "erro interno" sem saber o que digitou de errado.
 */
function valido(v: unknown, permitidos: readonly string[]): string | null {
  return typeof v === 'string' && permitidos.includes(v) ? v : null
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, active: true, createdAt: true,
      departamento: true, hierarquia: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(users)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const data = await request.json()

  if (!data.name || !data.email) {
    return NextResponse.json({ error: 'Nome e e-mail são obrigatórios' }, { status: 400 })
  }

  const departamento = valido(data.departamento, DEPARTAMENTOS) as Departamento | null
  const hierarquia = valido(data.hierarquia, HIERARQUIAS) as Hierarquia | null

  /**
   * PERFIL → ROLE.
   *
   * A tela escolhe entre Admin e Colaborador; o banco guarda a role técnica,
   * que continua sendo a fonte do acesso por módulo. Admin é inequívoco;
   * Colaborador é resolvido pelo departamento, porque existem três roles
   * não-admin e escolher ao acaso trocaria as alçadas da pessoa.
   *
   * `data.role` ainda é aceito para quem precisa gravar a role exata — a
   * granularidade de Production (OPERACIONAL, COMERCIAL, GESTOR) não foi
   * colapsada em dois perfis.
   */
  const perfil: Perfil = data.perfil === 'ADMIN' ? 'ADMIN' : 'COLABORADOR'
  const role = data.role ?? roleDoPerfil(perfil, departamento, null)

  const password = await bcrypt.hash(data.password || 'Revenue@2025', 12)

  const user = await prisma.user.create({
    data: {
      name: String(data.name).trim(),
      email: String(data.email).trim().toLowerCase(),
      password,
      role,
      departamento,
      hierarquia,
    },
    select: {
      id: true, name: true, email: true, role: true, active: true, createdAt: true,
      departamento: true, hierarquia: true,
    },
  })

  return NextResponse.json(user, { status: 201 })
}
