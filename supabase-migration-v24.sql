-- =====================================================================
-- RevenueOps Cockpit — migration v24
--
-- O título a receber passa a poder pertencer ao PARCEIRO.
--
-- ── O PROBLEMA ──────────────────────────────────────────────────────
-- A receita do Lançamento BaaS é devida pelo BaaS/White Label, e parceiro não
-- é Cliente — ele mora em CondicaoComercial. Como `ContaReceber.clienteId`
-- era NOT NULL, a geração só criava o título quando o número da conta casava
-- com um `Cliente` cadastrado. O primeiro lançamento de teste gerou o
-- Lançamento e o título a pagar, e NENHUM título a receber.
--
-- A alternativa seria inventar um Cliente por parceiro só para satisfazer a
-- FK — um registro fantasma que apareceria nas contagens de clientes ativos e
-- no MRR da carteira.
--
-- INCREMENTAL E IDEMPOTENTE. Sem reset, TRUNCATE, DROP de tabela ou DELETE em
-- massa. Nenhum título existente é alterado.
-- =====================================================================

-- ── 1. O devedor cliente passa a ser OPCIONAL ───────────────────────
ALTER TABLE "ContaReceber" ALTER COLUMN "clienteId" DROP NOT NULL;

-- ── 2. E nasce o devedor PARCEIRO ───────────────────────────────────
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "condicaoId" TEXT;

-- RESTRICT, não CASCADE: apagar uma condição comercial não pode levar o
-- título a receber embora — é dinheiro devido, e o histórico financeiro é
-- preservado por decisão de produto.
DO $$ BEGIN
  ALTER TABLE "ContaReceber"
    ADD CONSTRAINT "ContaReceber_condicaoId_fkey"
    FOREIGN KEY ("condicaoId") REFERENCES "CondicaoComercial"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ContaReceber_clienteId_idx"  ON "ContaReceber" ("clienteId");
CREATE INDEX IF NOT EXISTS "ContaReceber_condicaoId_idx" ON "ContaReceber" ("condicaoId");

-- ── 3. EXATAMENTE UM DOS DOIS ───────────────────────────────────────
-- Nenhum seria título sem devedor; os dois juntos seriam duas cobranças para
-- o mesmo valor. A constraint é o que impede as duas situações, em vez de
-- depender de todo caminho de código acertar.
--
-- NOT VALID + VALIDATE: a checagem vale para toda linha nova sem varrer a
-- tabela inteira sob lock. As linhas existentes já satisfazem a regra (todas
-- têm cliente), então a validação passa.
DO $$ BEGIN
  ALTER TABLE "ContaReceber"
    ADD CONSTRAINT "ContaReceber_um_devedor"
    CHECK (("clienteId" IS NULL) <> ("condicaoId" IS NULL)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ContaReceber" VALIDATE CONSTRAINT "ContaReceber_um_devedor";

-- ── 4. BACKFILL dos lançamentos já feitos ───────────────────────────
-- Os lançamentos anteriores a esta migration ficaram sem título a receber.
--
-- O VALOR NÃO É RECALCULADO: vem do lançamento financeiro de receita que o
-- próprio Lançamento BaaS já gerou. Recomputar a cascata em SQL seria
-- reimplementá-la numa segunda linguagem, com a chance de divergir.
--
-- IDEMPOTENTE: só toca lançamentos com `contaReceberId IS NULL`.
INSERT INTO "ContaReceber"
  ("id", "descricao", "tipo", "valor", "dataVenc", "status",
   "clienteId", "condicaoId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  lf."descricao",
  'Tarifas BaaS',
  lf."valor",
  lb."periodoFim",
  'PENDENTE',
  cl."id",
  CASE WHEN cl."id" IS NULL THEN lb."condicaoId" ELSE NULL END,
  now(), now()
FROM "LancamentoBaas" lb
JOIN "LancamentoFinanceiro" lf ON lf."id" = lb."lancamentoId"
LEFT JOIN "Cliente" cl ON cl."numeroConta" = lb."numeroConta"
WHERE lb."contaReceberId" IS NULL
  AND lb."lancamentoId" IS NOT NULL
  AND lb."status" <> 'RASCUNHO';

-- Amarra o título ao lançamento de origem. Separado do INSERT porque o
-- vínculo é UNIQUE: amarrar o título errado criaria duplicidade silenciosa.
UPDATE "LancamentoBaas" lb
   SET "contaReceberId" = cr."id", "updatedAt" = now()
  FROM "ContaReceber" cr, "LancamentoFinanceiro" lf
 WHERE lb."contaReceberId" IS NULL
   AND lb."lancamentoId" = lf."id"
   AND cr."descricao" = lf."descricao"
   AND cr."valor" = lf."valor"
   AND cr."tipo" = 'Tarifas BaaS'
   AND NOT EXISTS (
     SELECT 1 FROM "LancamentoBaas" x WHERE x."contaReceberId" = cr."id"
   );
