-- ============================================================
-- RevenueOps Cockpit — Migration v2
-- Cole no Supabase → SQL Editor → New query → Run
-- ============================================================

CREATE TYPE "ModeloOperacional" AS ENUM ('API', 'WHITE_LABEL');
CREATE TYPE "ClienteStatus" AS ENUM ('ATIVO', 'INATIVO', 'PROSPECCAO', 'ENCERRADO');
CREATE TYPE "MetaTipo" AS ENUM ('RECEITA', 'TPV', 'MRR', 'FLOATING', 'CLIENTES_ATIVOS');

CREATE TABLE "Cliente" (
  "id"                    TEXT NOT NULL,
  "nome"                  TEXT NOT NULL,
  "cnpj"                  TEXT,
  "email"                 TEXT,
  "telefone"              TEXT,
  "modeloOperacional"     "ModeloOperacional" NOT NULL,
  "status"                "ClienteStatus" NOT NULL DEFAULT 'PROSPECCAO',
  "dataFechamento"        TIMESTAMP(3),
  "dataEncerramento"      TIMESTAMP(3),
  "mensalidadeApi"        DOUBLE PRECISION,
  "sustentacaoWhiteLabel" DOUBLE PRECISION,
  "setup"                 DOUBLE PRECISION,
  "tpvEsperado"           DOUBLE PRECISION,
  "qtdTransacoesEsperada" INTEGER,
  "qtdMedEsperada"        INTEGER,
  "receitaPrevistaMensal" DOUBLE PRECISION,
  "notas"                 TEXT,
  "ownerId"               TEXT NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Processamento" (
  "id"               TEXT NOT NULL,
  "mesRef"           TEXT NOT NULL,
  "tpv"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qtdTransacoes"    INTEGER NOT NULL DEFAULT 0,
  "qtdMed"           INTEGER NOT NULL DEFAULT 0,
  "receitaTarifaria" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "floating"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "clienteId"        TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Processamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Processamento_clienteId_mesRef_key" ON "Processamento"("clienteId", "mesRef");
ALTER TABLE "Processamento" ADD CONSTRAINT "Processamento_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Forecast" (
  "id"               TEXT NOT NULL,
  "mesRef"           TEXT NOT NULL,
  "tpvPrevisto"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qtdPrevista"      INTEGER NOT NULL DEFAULT 0,
  "taxaMedia"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "receitaPrevista"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tpvRealizado"     DOUBLE PRECISION,
  "receitaRealizada" DOUBLE PRECISION,
  "clienteId"        TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Forecast_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Forecast_clienteId_mesRef_key" ON "Forecast"("clienteId", "mesRef");
ALTER TABLE "Forecast" ADD CONSTRAINT "Forecast_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReceitaRealizada" (
  "id"                TEXT NOT NULL,
  "mesRef"            TEXT NOT NULL,
  "receitaTarifaria"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "floatingRealizado" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceitaRealizada_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReceitaRealizada_mesRef_key" ON "ReceitaRealizada"("mesRef");

CREATE TABLE "Meta" (
  "id"        TEXT NOT NULL,
  "tipo"      "MetaTipo" NOT NULL,
  "valor"     DOUBLE PRECISION NOT NULL,
  "periodo"   TEXT NOT NULL,
  "realizado" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Meta_tipo_periodo_key" ON "Meta"("tipo", "periodo");

-- ============================================================
-- SEED — Clientes demo
-- ============================================================
INSERT INTO "Cliente" ("id","nome","cnpj","email","telefone","modeloOperacional","status","dataFechamento","mensalidadeApi","sustentacaoWhiteLabel","setup","tpvEsperado","qtdTransacoesEsperada","qtdMedEsperada","receitaPrevistaMensal","ownerId","updatedAt") VALUES
('cli-1','Fintech Alpha S.A.','11.111.111/0001-11','contato@fintechalpha.com.br','(11) 4000-1001','API','ATIVO','2024-01-15',5000,NULL,15000,50000000,25000,500,850000,'user-op',NOW()),
('cli-2','PayBeta Pagamentos','22.222.222/0001-22','ti@paybeta.com.br','(21) 4000-2002','WHITE_LABEL','ATIVO','2024-03-01',NULL,8000,25000,120000000,60000,800,1680000,'user-op',NOW()),
('cli-3','Gamma Tech Financeira','33.333.333/0001-33','operacoes@gammatech.com.br','(31) 4000-3003','API','ATIVO','2024-06-10',3500,NULL,10000,30000000,15000,300,519000,'user-op',NOW()),
('cli-4','Delta Meios de Pagamento','44.444.444/0001-44','delta@delta.com.br','(41) 4000-4004','WHITE_LABEL','INATIVO','2023-08-20',NULL,12000,30000,80000000,40000,600,1120000,'user-admin',NOW()),
('cli-5','Epsilon Pay','55.555.555/0001-55','contato@epsilonpay.com.br','(51) 4000-5005','API','PROSPECCAO',NULL,4000,NULL,12000,25000000,12000,200,425000,'user-com',NOW());

-- Processamentos (últimos 6 meses)
INSERT INTO "Processamento" ("id","mesRef","tpv","qtdTransacoes","qtdMed","receitaTarifaria","floating","clienteId","updatedAt") VALUES
('proc-1-01','2025-01',48000000,23000,480,816000,192000,'cli-1',NOW()),
('proc-1-02','2025-02',51000000,24500,510,867000,204000,'cli-1',NOW()),
('proc-1-03','2025-03',49500000,23800,498,841500,198000,'cli-1',NOW()),
('proc-1-04','2025-04',52000000,25200,520,884000,208000,'cli-1',NOW()),
('proc-1-05','2025-05',54000000,26000,540,918000,216000,'cli-1',NOW()),
('proc-1-06','2025-06',56000000,27000,560,952000,224000,'cli-1',NOW()),
('proc-2-01','2025-01',115000000,58000,760,1610000,460000,'cli-2',NOW()),
('proc-2-02','2025-02',118000000,59500,790,1652000,472000,'cli-2',NOW()),
('proc-2-03','2025-03',120000000,61000,810,1680000,480000,'cli-2',NOW()),
('proc-2-04','2025-04',122000000,62000,820,1708000,488000,'cli-2',NOW()),
('proc-2-05','2025-05',125000000,63500,845,1750000,500000,'cli-2',NOW()),
('proc-2-06','2025-06',128000000,65000,870,1792000,512000,'cli-2',NOW()),
('proc-3-01','2025-01',29000000,14500,295,501700,116000,'cli-3',NOW()),
('proc-3-02','2025-02',30500000,15200,310,527650,122000,'cli-3',NOW()),
('proc-3-03','2025-03',31000000,15500,312,536300,124000,'cli-3',NOW()),
('proc-3-04','2025-04',30000000,15000,300,519000,120000,'cli-3',NOW()),
('proc-3-05','2025-05',32000000,16000,320,553600,128000,'cli-3',NOW()),
('proc-3-06','2025-06',33000000,16500,330,570900,132000,'cli-3',NOW());

-- ReceitaRealizada
INSERT INTO "ReceitaRealizada" ("id","mesRef","receitaTarifaria","floatingRealizado","updatedAt") VALUES
('rec-2025-01','2025-01',2927700,768000,NOW()),
('rec-2025-02','2025-02',3046650,798000,NOW()),
('rec-2025-03','2025-03',3057800,802000,NOW()),
('rec-2025-04','2025-04',3111000,816000,NOW()),
('rec-2025-05','2025-05',3221600,844000,NOW()),
('rec-2025-06','2025-06',3314900,868000,NOW());

-- Forecasts
INSERT INTO "Forecast" ("id","mesRef","tpvPrevisto","qtdPrevista","taxaMedia","receitaPrevista","tpvRealizado","receitaRealizada","clienteId","updatedAt") VALUES
('fc-1-01','2025-01',50000000,25000,0.017,850000,48000000,816000,'cli-1',NOW()),
('fc-1-02','2025-02',52000000,26000,0.017,884000,51000000,867000,'cli-1',NOW()),
('fc-1-03','2025-03',53000000,26500,0.017,901000,49500000,841500,'cli-1',NOW()),
('fc-1-04','2025-04',54000000,27000,0.017,918000,52000000,884000,'cli-1',NOW()),
('fc-1-05','2025-05',55000000,27500,0.017,935000,54000000,918000,'cli-1',NOW()),
('fc-1-06','2025-06',57000000,28500,0.017,969000,NULL,NULL,'cli-1',NOW()),
('fc-2-01','2025-01',120000000,61000,0.014,1680000,115000000,1610000,'cli-2',NOW()),
('fc-2-02','2025-02',122000000,62000,0.014,1708000,118000000,1652000,'cli-2',NOW()),
('fc-2-03','2025-03',124000000,63000,0.014,1736000,120000000,1680000,'cli-2',NOW()),
('fc-2-04','2025-04',126000000,64000,0.014,1764000,122000000,1708000,'cli-2',NOW()),
('fc-2-05','2025-05',128000000,65000,0.014,1792000,125000000,1750000,'cli-2',NOW()),
('fc-2-06','2025-06',130000000,66000,0.014,1820000,NULL,NULL,'cli-2',NOW()),
('fc-3-01','2025-01',30000000,15000,0.0173,519000,29000000,501700,'cli-3',NOW()),
('fc-3-02','2025-02',31000000,15500,0.0173,536300,30500000,527650,'cli-3',NOW()),
('fc-3-03','2025-03',32000000,16000,0.0173,553600,31000000,536300,'cli-3',NOW()),
('fc-3-04','2025-04',31000000,15500,0.0173,536300,30000000,519000,'cli-3',NOW()),
('fc-3-05','2025-05',33000000,16500,0.0173,570900,32000000,553600,'cli-3',NOW()),
('fc-3-06','2025-06',34000000,17000,0.0173,588200,NULL,NULL,'cli-3',NOW());

-- Metas
INSERT INTO "Meta" ("id","tipo","valor","periodo","realizado","updatedAt") VALUES
('meta-rec-06','RECEITA',3500000,'2025-06',3314900,NOW()),
('meta-tpv-06','TPV',220000000,'2025-06',217000000,NOW()),
('meta-mrr-06','MRR',16000,'2025-06',13500,NOW()),
('meta-cli-06','CLIENTES_ATIVOS',5,'2025-06',3,NOW());
