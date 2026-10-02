/**
 * EXCLUSÃO DE CARD DO PIPELINE — e a preservação do Lead.
 *
 * A distinção inteira desta rodada: EXCLUIR CARD ≠ EXCLUIR LEAD.
 *
 * O card sai do quadro e dos indicadores. O lead continua em Leads, com
 * cadastro, comentários, atividades e histórico — pode ser trabalhado de novo
 * e receber um card novo amanhã. A Lixeira de Leads é outro mecanismo, para
 * outra entidade, e não é tocada por aqui.
 *
 * O que se testa:
 *   1. a alçada (quem pode excluir);
 *   2. que o LEAD não é apagado em nenhum caminho de código;
 *   3. que o card excluído desaparece do quadro, dos KPIs e das distribuições;
 *   4. que o histórico é preservado e a exclusão é registrada;
 *   5. que não se opera mais sobre um card excluído.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { podeExcluirCard } from '../lib/pipeline'
import { cardExcluido, ERRO_CARD_EXCLUIDO } from '../lib/pipeline-db'

const ler = (p: string) => readFileSync(p, 'utf8')

const ROTA_CARD = ler('app/api/pipeline/cards/[id]/route.ts')
const BOARD = ler('app/api/pipeline/board/route.ts')
const CRM = ler('app/api/crm/route.ts')
const KPI = ler('lib/kpi.ts')
const SCHEMA = ler('prisma/schema.prisma')
const MODAL = ler('components/pipeline/CardDetalheModal.tsx')

/** O arquivo sem comentários — os comentários explicam a regra e citam o que
 *  foi removido; contá-los acusaria a própria explicação. */
const semComentarios = (txt: string) =>
  txt.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')

/* ========================================================================= *
 * A ALÇADA
 * ========================================================================= */

const ACESSO = {
  ver: true, editar: false, mover: false,
  criar: false, transferir: false, administrar: false,
  // `apenasProprios` faz parte do contrato de AcessoFunil: restringe o funil
  // aos cards do proprio usuario. Nao tem efeito sobre PODER excluir — e por
  // isso fica false aqui, fixo, em todos os casos.
  apenasProprios: false,
}

test('EXCLUIR exige `editar` — mover nao basta', () => {
  // Arrastar de coluna e mudar o resultado é operar o funil. Tirar o card do
  // quadro some com ele para todo mundo, e dos indicadores.
  assert.equal(podeExcluirCard({ ...ACESSO, editar: true }), true)
  assert.equal(podeExcluirCard({ ...ACESSO, mover: true }), false)
  assert.equal(podeExcluirCard({ ...ACESSO, ver: true }), false)
})

test('leitura pura NAO exclui', () => {
  assert.equal(podeExcluirCard(ACESSO), false)
})

test('administrar o funil NAO e trabalhar os cards dele', () => {
  // Administrar é configurar etapas e alçadas; não dá direito sobre o card.
  assert.equal(podeExcluirCard({ ...ACESSO, administrar: true }), false)
})

test('a UI espelha a regra do servidor', () => {
  assert.ok(
    MODAL.includes('const podeExcluir = !!acesso && acesso.editar'),
    'o botao da UI usa uma alcada diferente da do servidor',
  )
})

/* ========================================================================= *
 * O LEAD SOBREVIVE
 * ========================================================================= */

test('a rota de exclusao NAO apaga lead em nenhum caminho', () => {
  const codigo = semComentarios(ROTA_CARD)
  for (const proibido of [
    'prisma.lead.delete', 'tx.lead.delete',
    'prisma.lead.deleteMany', 'tx.lead.deleteMany',
    'prisma.lead.update', 'tx.lead.update',
  ]) {
    assert.ok(!codigo.includes(proibido), `a exclusao do card mexe no lead: ${proibido}`)
  }
})

test('a exclusao do card e SOFT — o registro nao e apagado', () => {
  const codigo = semComentarios(ROTA_CARD)
  assert.ok(codigo.includes('deletedAt: new Date()'), 'a exclusao deixou de marcar deletedAt')
  assert.ok(codigo.includes('deletedById: session.userId'), 'nao se registra quem excluiu')
  for (const proibido of ['prisma.deal.delete', 'tx.deal.delete', 'deal.deleteMany']) {
    assert.ok(!codigo.includes(proibido), `voltou a apagar o card fisicamente: ${proibido}`)
  }
})

test('a rota LEGADA /api/deals tambem e soft delete', () => {
  // Ela fazia `prisma.deal.delete`, um apagamento fisico que levava embora as
  // movimentacoes e os comentarios (CASCADE) — o historico que a exclusao
  // deveria preservar.
  const legada = semComentarios(ler('app/api/deals/[id]/route.ts'))
  assert.ok(!legada.includes('prisma.deal.delete'), 'a rota legada voltou a apagar fisicamente')
  assert.ok(legada.includes('deletedAt: new Date()'))
})

test('a auditoria declara que o LEAD foi preservado', () => {
  assert.ok(
    ROTA_CARD.includes('PRESERVADO em Leads'),
    'a trilha nao diz o que aconteceu com o lead',
  )
  assert.ok(ROTA_CARD.includes('EXCLUIU_CARD_PIPELINE'))
})

test('a confirmacao da UI avisa que o lead FICA', () => {
  assert.ok(
    MODAL.includes('NÃO será excluído'),
    'a confirmacao nao esclarece que o lead permanece',
  )
})

test('a LIXEIRA DE LEADS nao e tocada', () => {
  // Outro mecanismo, outra entidade. Um card excluido nao aparece la.
  const codigo = semComentarios(ROTA_CARD)
  assert.ok(!codigo.includes('lixeira'))
  assert.ok(!codigo.includes('podeVerLixeira'))
})

/* ========================================================================= *
 * O CARD DESAPARECE — quadro, KPIs e distribuições
 * ========================================================================= */

test('o Deal tem soft delete no schema, com indice', () => {
  const deal = SCHEMA.slice(SCHEMA.indexOf('model Deal {'), SCHEMA.indexOf('model DealComentario'))
  assert.ok(/deletedAt\s+DateTime\?/.test(deal), 'Deal.deletedAt saiu do schema')
  assert.ok(/deletedById\s+String\?/.test(deal))
  assert.ok(deal.includes('@@index([deletedAt])'), 'sem indice, cada leitura varre a tabela')
})

test('o QUADRO nao mostra card excluido', () => {
  assert.ok(BOARD.includes('deletedAt: null'), 'o quadro voltou a listar cards excluidos')
})

test('os KPIs de pipeline ignoram card excluido', () => {
  // Ganhos, perdidos e atividade assistida: os tres.
  const bloco = KPI.slice(KPI.indexOf('export async function realizadoPipeline'))
  const fim = bloco.indexOf('const decididos')
  const trecho = bloco.slice(0, fim)
  assert.equal(
    (trecho.match(/deletedAt: null/g) ?? []).length, 3,
    'algum KPI de pipeline voltou a contar card excluido',
  )
})

test('a Visao geral do Comercial ignora card excluido', () => {
  // Cards, movimentacoes (tempo medio e conversao) e os deals do lead.
  assert.ok(
    (CRM.match(/deletedAt: null/g) ?? []).length >= 4,
    'a leitura comercial voltou a incluir card excluido',
  )
  assert.ok(
    CRM.includes('deal: { deletedAt: null }'),
    'as movimentacoes do card excluido voltaram aos indicadores',
  )
})

test('a etapa inativada NAO realoca card excluido', () => {
  const etapas = ler('app/api/pipeline/etapas/[id]/route.ts')
  assert.ok(
    etapas.includes('where: { etapaId: id, deletedAt: null }'),
    'card excluido voltou a ser realocado ao inativar a etapa',
  )
})

/* ========================================================================= *
 * O HISTÓRICO FICA
 * ========================================================================= */

test('a exclusao grava MOVIMENTACAO com funil e etapa de origem', () => {
  assert.ok(ROTA_CARD.includes("tipo: 'EXCLUSAO_CARD'"))
  assert.ok(ROTA_CARD.includes('funilOrigemId: card.funilId'))
  assert.ok(ROTA_CARD.includes('etapaOrigemId: card.etapaId'))
})

test('EXCLUSAO_CARD existe no enum do schema', () => {
  const enumBloco = SCHEMA.slice(
    SCHEMA.indexOf('enum MovimentacaoTipo'),
    SCHEMA.indexOf('enum MovimentacaoTipo') + 500,
  )
  assert.ok(enumBloco.includes('EXCLUSAO_CARD'))
})

test('a exclusao e a movimentacao vao na MESMA transacao', () => {
  // Card excluido sem historico seria pior que nenhum historico, porque
  // parece completo.
  const codigo = semComentarios(ROTA_CARD)
  assert.ok(codigo.includes('prisma.$transaction'), 'a exclusao saiu da transacao')
})

test('a exclusao e IDEMPOTENTE — duas vezes nao grava dois historicos', () => {
  assert.ok(
    ROTA_CARD.includes('if (card.deletedAt)') && ROTA_CARD.includes('jaExcluido: true'),
    'excluir duas vezes voltou a gravar historico duplicado',
  )
})

/* ========================================================================= *
 * NÃO SE OPERA SOBRE CARD EXCLUÍDO
 * ========================================================================= */

test('cardExcluido reconhece a marca', () => {
  assert.equal(cardExcluido({ deletedAt: new Date() }), true)
  assert.equal(cardExcluido({ deletedAt: null }), false)
  assert.equal(cardExcluido({}), false)
})

test('a mensagem de recusa explica, e lembra que o LEAD ficou', () => {
  // "Nao existe" e "foi excluido" sao situacoes diferentes; confundi-las manda
  // a pessoa procurar um bug que nao existe.
  assert.ok(ERRO_CARD_EXCLUIDO.includes('excluído'))
  assert.ok(ERRO_CARD_EXCLUIDO.includes('Leads'), 'a recusa nao diz onde o lead esta')
})

test('mover, resultado, transferir e comentar RECUSAM card excluido', () => {
  for (const rota of [
    'app/api/pipeline/cards/[id]/mover/route.ts',
    'app/api/pipeline/cards/[id]/resultado/route.ts',
    'app/api/pipeline/cards/[id]/transferir/route.ts',
    'app/api/pipeline/cards/[id]/comentarios/route.ts',
  ]) {
    const t = ler(rota)
    assert.ok(
      t.includes('cardExcluido(ctx.deal)'),
      `${rota} opera sobre card excluido`,
    )
    assert.ok(t.includes('ERRO_CARD_EXCLUIDO'), `${rota} nao explica a recusa`)
  }
})
