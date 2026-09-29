/**
 * SEED ESTRUTURAL — cria apenas o que o sistema precisa para funcionar.
 *
 * Não cria dados de demonstração. Clientes, leads, deals e lançamentos entram
 * pela operação real. Rodar este seed várias vezes é seguro: tudo é upsert.
 */

import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

// Só o administrador. As contas de equipe "Comercial" e "Operacional" saíram
// do sistema; os PAPÉIS COMERCIAL e OPERACIONAL continuam existindo e são
// atribuídos a pessoas reais em Usuários.
const USUARIOS = [
  { email: 'admin@revenueops.com.br', name: 'Administrador', role: 'ADMIN' as const },
]

async function main() {
  const senha = process.env.SEED_PASSWORD || 'Revenue@2025'
  const hash = await bcrypt.hash(senha, 10)

  for (const u of USUARIOS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, active: true },
      create: { ...u, password: hash, active: true },
    })
  }
  console.log(`✓ ${USUARIOS.length} usuários`)

  // Multiplicador do Float: sem uma vigência, o Float não é calculado. Entra
  // zerado de propósito. O ambiente "Parâmetros" saiu do produto, então o
  // valor real é definido direto em FloatConfig por quem opera o banco.
  const jaTemFloat = await prisma.floatConfig.count()
  if (jaTemFloat === 0) {
    const inicioDoAno = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))
    await prisma.floatConfig.create({
      data: {
        multiplicador: 0,
        vigenciaInicio: inicioDoAno,
        notas: 'Vigência inicial. Defina o multiplicador real em Parâmetros — com 0 o Float não rende.',
      },
    })
    console.log('✓ vigência inicial do Float (multiplicador 0 — configure em Parâmetros)')
  }

  if (process.env.SEED_PASSWORD) {
    console.log('\nSenha definida via SEED_PASSWORD.')
  } else {
    console.log(`\n⚠  Senha padrão "${senha}" para os 3 usuários. Troque antes de usar em produção,`)
    console.log('   ou rode com SEED_PASSWORD=... npm run seed')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
