/**
 * LIMPEZA DOS DADOS DE DEMONSTRAÇÃO (Parte 16).
 *
 * Apaga dados operacionais e mantém o que é estrutural:
 *   MANTÉM   usuários, parâmetros, vigências do Float, schema
 *   APAGA    clientes, leads, deals, atividades, tarefas, incidentes,
 *            contas a receber, follow-ups, lançamentos, metas, volumetria
 *
 * Exige confirmação explícita, porque é irreversível:
 *   CONFIRMAR_LIMPEZA=SIM npx tsx prisma/limpar-dados-demo.ts
 */

import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  if (process.env.CONFIRMAR_LIMPEZA !== 'SIM') {
    console.error('Abortado: rode com CONFIRMAR_LIMPEZA=SIM para confirmar.')
    console.error('Isto apaga TODOS os dados operacionais e não tem volta.')
    process.exit(1)
  }

  // Contagem antes, para você conferir o que será removido.
  const antes = {
    clientes: await prisma.cliente.count(),
    leads: await prisma.lead.count(),
    deals: await prisma.deal.count(),
    tarefas: await prisma.tarefa.count(),
    incidentes: await prisma.incidente.count(),
    contasReceber: await prisma.contaReceber.count(),
    followUps: await prisma.followUp.count(),
    lancamentos: await prisma.lancamentoDiario.count(),
    metas: await prisma.meta.count(),
    volumetria: await prisma.volumetriaMinima.count(),
    auditoria: await prisma.auditoria.count(),
  }
  console.log('Registros encontrados:', antes)

  // Ordem respeita as chaves estrangeiras: dependentes primeiro.
  await prisma.activity.deleteMany()
  await prisma.deal.deleteMany()
  await prisma.lead.deleteMany()
  await prisma.tarefa.deleteMany()
  await prisma.followUp.deleteMany()
  await prisma.contaReceber.deleteMany()
  await prisma.incidente.deleteMany()
  await prisma.cliente.deleteMany()
  await prisma.lancamentoDiario.deleteMany()
  await prisma.meta.deleteMany()
  await prisma.volumetriaMinima.deleteMany()
  await prisma.auditoria.deleteMany()

  const mantidos = {
    usuarios: await prisma.user.count(),
    parametros: await prisma.parametro.count(),
    floatConfig: await prisma.floatConfig.count(),
  }
  console.log('\n✓ Dados operacionais removidos.')
  console.log('Mantidos (estruturais):', mantidos)
  console.log('\nO sistema está pronto para receber dados reais.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
