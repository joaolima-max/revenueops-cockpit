-- RevOps Migration v4 — Parametros + limpezas
CREATE TABLE IF NOT EXISTS "Parametro" (
  "id"        TEXT NOT NULL,
  "chave"     TEXT NOT NULL,
  "valor"     TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "descricao" TEXT,
  "grupo"     TEXT NOT NULL DEFAULT 'GERAL',
  "tipo"      TEXT NOT NULL DEFAULT 'NUMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Parametro_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Parametro_chave_key" ON "Parametro"("chave");

-- Seed parâmetros padrão
INSERT INTO "Parametro" ("id","chave","valor","label","descricao","grupo","tipo") VALUES
  (gen_random_uuid()::text, 'MED_PORCENT_CRITICO',    '5',  'MED % Crítico',          'MED acima deste % = alerta crítico',                    'OPERACIONAL', 'PERCENT'),
  (gen_random_uuid()::text, 'MED_PORCENT_ALTO',       '2',  'MED % Alto',             'MED acima deste % = alerta alto',                       'OPERACIONAL', 'PERCENT'),
  (gen_random_uuid()::text, 'SATISFACAO_CRITICO',     '50', 'Satisfação Crítica',     'Índice de satisfação abaixo deste % = crítico',         'OPERACIONAL', 'PERCENT'),
  (gen_random_uuid()::text, 'SATISFACAO_ALTO',        '70', 'Satisfação Alta',        'Índice de satisfação abaixo deste % = alto',            'OPERACIONAL', 'PERCENT'),
  (gen_random_uuid()::text, 'SCORE_RISCO_ALERTA',     'ALTO', 'Score Risco p/ Alerta','Score mínimo para gerar alerta de risco',               'RISCO',       'TEXT'),
  (gen_random_uuid()::text, 'VOLUME_MINIMO_CRITICO',  '50', 'Volume Mínimo Crítico',  'TPV abaixo de X% do volume mínimo = alerta crítico',    'ALERTAS',     'PERCENT'),
  (gen_random_uuid()::text, 'VOLUME_MINIMO_ALTO',     '80', 'Volume Mínimo Alto',     'TPV abaixo de X% do volume mínimo = alerta alto',      'ALERTAS',     'PERCENT'),
  (gen_random_uuid()::text, 'META_RECEITA_CRITICO',   '50', 'Meta Receita Crítico',   '% da meta de receita abaixo = alerta crítico',          'ALERTAS',     'PERCENT'),
  (gen_random_uuid()::text, 'META_RECEITA_ALTO',      '70', 'Meta Receita Alto',      '% da meta de receita abaixo = alerta alto',             'ALERTAS',     'PERCENT'),
  (gen_random_uuid()::text, 'DOWNTIME_CRITICO_MIN',   '120','Downtime Crítico (min)', 'Downtime acima de X minutos por incidente = crítico',   'RISCO',       'NUMBER')
ON CONFLICT ("chave") DO NOTHING;
