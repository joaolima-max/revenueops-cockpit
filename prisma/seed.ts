import { PrismaClient, Role, LeadStatus, DealStage } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  const adminPassword = await bcrypt.hash('Revenue@2025', 12)
  const opPassword = await bcrypt.hash('Revenue@2025', 12)
  const comercialPassword = await bcrypt.hash('Revenue@2025', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@revenueops.com.br' },
    update: {},
    create: {
      name: 'Admin RevenueOps',
      email: 'admin@revenueops.com.br',
      password: adminPassword,
      role: Role.ADMIN,
    },
  })

  const operacional = await prisma.user.upsert({
    where: { email: 'operacional@revenueops.com.br' },
    update: {},
    create: {
      name: 'Equipe Operacional',
      email: 'operacional@revenueops.com.br',
      password: opPassword,
      role: Role.OPERACIONAL,
    },
  })

  const comercial = await prisma.user.upsert({
    where: { email: 'comercial@revenueops.com.br' },
    update: {},
    create: {
      name: 'Equipe Comercial',
      email: 'comercial@revenueops.com.br',
      password: comercialPassword,
      role: Role.COMERCIAL,
    },
  })

  const leads = await Promise.all([
    prisma.lead.upsert({
      where: { id: 'lead-1' },
      update: {},
      create: {
        id: 'lead-1',
        name: 'Carlos Mendes',
        email: 'carlos@empresa.com.br',
        phone: '(11) 99999-0001',
        company: 'Empresa Alpha Ltda',
        position: 'CEO',
        source: 'LinkedIn',
        status: LeadStatus.QUALIFICADO,
        value: 85000,
        ownerId: comercial.id,
      },
    }),
    prisma.lead.upsert({
      where: { id: 'lead-2' },
      update: {},
      create: {
        id: 'lead-2',
        name: 'Ana Paula Lima',
        email: 'ana@betacorp.com.br',
        phone: '(21) 99999-0002',
        company: 'BetaCorp S.A.',
        position: 'CFO',
        source: 'Indicação',
        status: LeadStatus.PROPOSTA,
        value: 120000,
        ownerId: comercial.id,
      },
    }),
    prisma.lead.upsert({
      where: { id: 'lead-3' },
      update: {},
      create: {
        id: 'lead-3',
        name: 'Roberto Silva',
        email: 'roberto@gammatech.com.br',
        phone: '(31) 99999-0003',
        company: 'GammaTech',
        position: 'CTO',
        source: 'Site',
        status: LeadStatus.NEGOCIACAO,
        value: 200000,
        ownerId: admin.id,
      },
    }),
    prisma.lead.upsert({
      where: { id: 'lead-4' },
      update: {},
      create: {
        id: 'lead-4',
        name: 'Fernanda Costa',
        email: 'fernanda@deltaind.com.br',
        phone: '(41) 99999-0004',
        company: 'Delta Indústrias',
        position: 'Diretora Financeira',
        source: 'Evento',
        status: LeadStatus.GANHO,
        value: 150000,
        ownerId: operacional.id,
      },
    }),
    prisma.lead.upsert({
      where: { id: 'lead-5' },
      update: {},
      create: {
        id: 'lead-5',
        name: 'Marcos Oliveira',
        email: 'marcos@epsilonsa.com.br',
        phone: '(51) 99999-0005',
        company: 'Epsilon S.A.',
        position: 'Gerente Comercial',
        source: 'Google Ads',
        status: LeadStatus.NOVO,
        value: 45000,
        ownerId: comercial.id,
      },
    }),
    prisma.lead.upsert({
      where: { id: 'lead-6' },
      update: {},
      create: {
        id: 'lead-6',
        name: 'Juliana Rocha',
        email: 'juliana@zetagroup.com.br',
        phone: '(61) 99999-0006',
        company: 'Zeta Group',
        position: 'VP de Operações',
        source: 'LinkedIn',
        status: LeadStatus.PERDIDO,
        value: 95000,
        ownerId: comercial.id,
      },
    }),
  ])

  await Promise.all([
    prisma.deal.upsert({
      where: { id: 'deal-1' },
      update: {},
      create: {
        id: 'deal-1',
        title: 'Implementação ERP - Alpha Ltda',
        value: 85000,
        stage: DealStage.NEGOCIACAO,
        probability: 70,
        ownerId: comercial.id,
        leadId: leads[0].id,
        expectedAt: new Date('2025-06-30'),
      },
    }),
    prisma.deal.upsert({
      where: { id: 'deal-2' },
      update: {},
      create: {
        id: 'deal-2',
        title: 'Consultoria Financeira - BetaCorp',
        value: 120000,
        stage: DealStage.PROPOSTA,
        probability: 55,
        ownerId: comercial.id,
        leadId: leads[1].id,
        expectedAt: new Date('2025-07-15'),
      },
    }),
    prisma.deal.upsert({
      where: { id: 'deal-3' },
      update: {},
      create: {
        id: 'deal-3',
        title: 'Plataforma SaaS - GammaTech',
        value: 200000,
        stage: DealStage.FECHAMENTO,
        probability: 90,
        ownerId: admin.id,
        leadId: leads[2].id,
        expectedAt: new Date('2025-05-31'),
      },
    }),
    prisma.deal.upsert({
      where: { id: 'deal-4' },
      update: {},
      create: {
        id: 'deal-4',
        title: 'Automação Industrial - Delta',
        value: 150000,
        stage: DealStage.GANHO,
        probability: 100,
        ownerId: operacional.id,
        leadId: leads[3].id,
        closedAt: new Date('2025-04-20'),
      },
    }),
    prisma.deal.upsert({
      where: { id: 'deal-5' },
      update: {},
      create: {
        id: 'deal-5',
        title: 'CRM Customizado - Epsilon',
        value: 45000,
        stage: DealStage.QUALIFICACAO,
        probability: 30,
        ownerId: comercial.id,
        leadId: leads[4].id,
        expectedAt: new Date('2025-08-01'),
      },
    }),
    prisma.deal.upsert({
      where: { id: 'deal-6' },
      update: {},
      create: {
        id: 'deal-6',
        title: 'Suporte Técnico - GammaTech II',
        value: 36000,
        stage: DealStage.PROSPECCAO,
        probability: 20,
        ownerId: admin.id,
        expectedAt: new Date('2025-09-01'),
      },
    }),
  ])

  console.log('Seed completed!')
  console.log(`Users created: admin, operacional, comercial`)
  console.log(`Leads created: ${leads.length}`)
  console.log(`Deals created: 6`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
