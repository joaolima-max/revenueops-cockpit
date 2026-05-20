-- ============================================================
-- RevenueOps Cockpit — Schema + Seed
-- Cole este SQL no Supabase → SQL Editor → New query → Run
-- ============================================================

-- Enums
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERACIONAL', 'COMERCIAL');
CREATE TYPE "LeadStatus" AS ENUM ('NOVO', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO');
CREATE TYPE "DealStage" AS ENUM ('PROSPECCAO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'FECHAMENTO', 'GANHO', 'PERDIDO');

-- Tabela User
CREATE TABLE "User" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "password"  TEXT NOT NULL,
  "role"      "Role" NOT NULL DEFAULT 'COMERCIAL',
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Tabela Lead
CREATE TABLE "Lead" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "email"     TEXT,
  "phone"     TEXT,
  "company"   TEXT,
  "position"  TEXT,
  "source"    TEXT,
  "status"    "LeadStatus" NOT NULL DEFAULT 'NOVO',
  "value"     DOUBLE PRECISION,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ownerId"   TEXT NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- Tabela Deal
CREATE TABLE "Deal" (
  "id"          TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "value"       DOUBLE PRECISION NOT NULL,
  "stage"       "DealStage" NOT NULL DEFAULT 'PROSPECCAO',
  "probability" INTEGER NOT NULL DEFAULT 0,
  "notes"       TEXT,
  "expectedAt"  TIMESTAMP(3),
  "closedAt"    TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ownerId"     TEXT NOT NULL,
  "leadId"      TEXT,
  CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- Tabela Activity
CREATE TABLE "Activity" (
  "id"          TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId"      TEXT NOT NULL,
  "leadId"      TEXT,
  "dealId"      TEXT,
  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- Foreign Keys
ALTER TABLE "Lead"     ADD CONSTRAINT "Lead_ownerId_fkey"     FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal"     ADD CONSTRAINT "Deal_ownerId_fkey"     FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal"     ADD CONSTRAINT "Deal_leadId_fkey"      FOREIGN KEY ("leadId")  REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey"  FOREIGN KEY ("leadId")  REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dealId_fkey"  FOREIGN KEY ("dealId")  REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- SEED — Usuários (senha: Revenue@2025)
-- ============================================================
INSERT INTO "User" ("id", "name", "email", "password", "role", "updatedAt") VALUES
('user-admin',  'Admin RevenueOps',   'admin@revenueops.com.br',        '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oRnHiffa2', 'ADMIN',        NOW()),
('user-op',     'Equipe Operacional', 'operacional@revenueops.com.br',  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oRnHiffa2', 'OPERACIONAL',  NOW()),
('user-com',    'Equipe Comercial',   'comercial@revenueops.com.br',    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oRnHiffa2', 'COMERCIAL',    NOW());

-- Leads
INSERT INTO "Lead" ("id","name","email","phone","company","position","source","status","value","ownerId","updatedAt") VALUES
('lead-1','Carlos Mendes',   'carlos@empresa.com.br',  '(11) 99999-0001','Empresa Alpha Ltda','CEO',                'LinkedIn',  'QUALIFICADO', 85000,  'user-com', NOW()),
('lead-2','Ana Paula Lima',  'ana@betacorp.com.br',    '(21) 99999-0002','BetaCorp S.A.',      'CFO',                'Indicação', 'PROPOSTA',    120000, 'user-com', NOW()),
('lead-3','Roberto Silva',   'roberto@gammatech.com.br','(31) 99999-0003','GammaTech',         'CTO',                'Site',      'NEGOCIACAO',  200000, 'user-admin',NOW()),
('lead-4','Fernanda Costa',  'fernanda@deltaind.com.br','(41) 99999-0004','Delta Indústrias',  'Diretora Financeira','Evento',    'GANHO',       150000, 'user-op',  NOW()),
('lead-5','Marcos Oliveira', 'marcos@epsilonsa.com.br','(51) 99999-0005','Epsilon S.A.',       'Gerente Comercial',  'Google Ads','NOVO',        45000,  'user-com', NOW()),
('lead-6','Juliana Rocha',   'juliana@zetagroup.com.br','(61) 99999-0006','Zeta Group',        'VP de Operações',    'LinkedIn',  'PERDIDO',     95000,  'user-com', NOW());

-- Deals
INSERT INTO "Deal" ("id","title","value","stage","probability","ownerId","leadId","expectedAt","updatedAt") VALUES
('deal-1','Implementação ERP - Alpha Ltda',    85000,  'NEGOCIACAO', 70, 'user-com',  'lead-1', '2025-06-30', NOW()),
('deal-2','Consultoria Financeira - BetaCorp', 120000, 'PROPOSTA',   55, 'user-com',  'lead-2', '2025-07-15', NOW()),
('deal-3','Plataforma SaaS - GammaTech',       200000, 'FECHAMENTO', 90, 'user-admin','lead-3', '2025-05-31', NOW()),
('deal-4','Automação Industrial - Delta',      150000, 'GANHO',     100, 'user-op',   'lead-4', NULL,         NOW()),
('deal-5','CRM Customizado - Epsilon',          45000, 'QUALIFICACAO',30, 'user-com', 'lead-5', '2025-08-01', NOW()),
('deal-6','Suporte Técnico - GammaTech II',     36000, 'PROSPECCAO', 20, 'user-admin', NULL,   '2025-09-01', NOW());

UPDATE "Deal" SET "closedAt" = '2025-04-20' WHERE "id" = 'deal-4';
