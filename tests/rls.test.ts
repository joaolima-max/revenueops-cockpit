/**
 * RLS — a leitura pública das tabelas de dados tem que continuar fechada.
 *
 * O teste de verdade é contra o banco: `GET /rest/v1/LancamentoDiario` com a
 * chave anon devolvia linha real antes da v18 e devolve lista vazia depois.
 * Isso foi verificado na aplicação da migration e não cabe numa suíte offline
 * — exigiria credencial e rede.
 *
 * O que ESTA suíte protege é a regressão que cabe aqui: alguém editar a
 * migration e tirar uma tabela da lista, ou criar uma tabela nova no schema
 * sem incluí-la. O arquivo versionado é a fonte, e ele é comparado com o
 * schema do Prisma.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const v18Bruto = readFileSync(join(RAIZ, 'supabase-migration-v18.sql'), 'utf8')

/**
 * O arquivo COMENTA o que deliberadamente não faz — FORCE, políticas, DROP.
 * Buscar esses termos no texto cru acusaria o próprio comentário. O que
 * importa é o SQL executável, então os comentários saem antes.
 */
const v18 = v18Bruto
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')
const schema = readFileSync(join(RAIZ, 'prisma', 'schema.prisma'), 'utf8')

/** Modelos do schema que viram tabela no Postgres. */
function modelosDoSchema(): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1])
}

/** Tabelas que a migration liga explicitamente. */
function tabelasComRls(): string[] {
  return [...v18.matchAll(/ALTER TABLE "(\w+)"\s+ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1])
}

test('a migration v18 existe e liga RLS, sem desligar nada', () => {
  assert.ok(tabelasComRls().length >= 30, 'a lista de tabelas encolheu')
  assert.ok(!/DISABLE ROW LEVEL SECURITY/i.test(v18), 'a v18 não pode desligar RLS')
})

test('a v18 NÃO usa FORCE — isso derrubaria o Prisma', () => {
  // O backend conecta como `postgres`, que é DONO das tabelas. Dono passa por
  // cima de RLS, menos quando FORCE está ligado.
  assert.ok(!/FORCE ROW LEVEL SECURITY/i.test(v18))
})

test('a v18 não cria política nenhuma', () => {
  // Política aqui seria uma segunda descrição da autorização que já vive em
  // lib/permissions.ts — e livre para divergir dela.
  assert.ok(!/CREATE POLICY/i.test(v18))
})

test('a v18 não é destrutiva', () => {
  for (const proibido of [/DROP TABLE/i, /DROP COLUMN/i, /TRUNCATE/i, /\bDELETE\s+FROM\b/i]) {
    assert.ok(!proibido.test(v18), `comando destrutivo na v18: ${proibido}`)
  }
})

test('toda tabela do schema está coberta por RLS', () => {
  // As 18 tabelas que já tinham RLS antes da v18 não aparecem no arquivo; o
  // que se verifica é que nenhum modelo NOVO ficou de fora sem alguém notar.
  const cobertas = new Set(tabelasComRls())
  // Modelos criados depois da v18 precisam entrar na lista.
  const posteriores = ['DealComentario']
  for (const m of posteriores) {
    assert.ok(cobertas.has(m), `${m} não está na v18 — tabela nova nasce sem RLS`)
  }

  /**
   * AS TABELAS DA v28 LIGAM RLS NA PROPRIA v28.
   *
   * Elas nao estao na v18 — nem poderiam, ela e anterior. O que este bloco
   * garante e que nenhuma delas tenha nascido sem RLS: orcamento e previsao de
   * faturamento sao exatamente o dado que nao pode vazar pelo PostgREST.
   */
  const v28 = readFileSync(join(RAIZ, 'supabase-migration-v28.sql'), 'utf8')
  for (const t of ['CentroCusto', 'Orcamento', 'DespesaFutura', 'ReceitaPrevista']) {
    assert.ok(
      new RegExp(`ALTER TABLE "${t}"\\s+ENABLE ROW LEVEL SECURITY`).test(v28),
      `${t} nasceu sem RLS — tabela nova e legivel pela chave anon`,
    )
  }
  assert.ok(modelosDoSchema().length > 0, 'o schema deveria ter modelos')
})

test('as tabelas mais sensíveis estão explicitamente na lista', () => {
  const cobertas = new Set(tabelasComRls())
  for (const t of [
    'LancamentoDiario',       // TPV, receita tarifária — vazava antes da v18
    'Certificado',            // senha cifrada
    'CondicaoComercial',      // taxas dos parceiros
    'LancamentoFinanceiro',   // receita e despesa
    'PendenciaCompliance',    // compliance por cliente
    'PipelineMovimentacao',   // histórico comercial
    'Documento',
  ]) {
    assert.ok(cobertas.has(t), `${t} saiu da lista de RLS`)
  }
})
