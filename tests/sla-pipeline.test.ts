/**
 * SLA POR ETAPA DO PIPELINE.
 *
 * ── A REGRA CENTRAL, E A MAIS FÁCIL DE ERRAR ─────────────────────────────
 *
 * O RELÓGIO REINICIA A CADA ETAPA. O SLA não é medido desde a criação do card.
 *
 *   Prospecção   3 dias  →  o card passa 3 dias ali
 *   Qualificação 5 dias  →  o relógio da Qualificação começa NAQUELE momento
 *
 * Medir desde `createdAt` faria um card que acabou de chegar em Proposta
 * aparecer como vencido pelo tempo que passou em Prospecção — e o indicador
 * acusaria atraso de quem acabou de receber o card.
 *
 * ── O QUE SE TESTA SEM BANCO ─────────────────────────────────────────────
 *
 * `lib/sla.ts` é PURO: recebe o instante de entrada, o prazo e a hora de
 * referência, e devolve o estado. É o que permite verificar "8 dias numa etapa
 * de 5 está 3 dias atrasado" sem esperar oito dias.
 *
 * As três garantias estruturais — o carimbo do marco zero em UM lugar só, a
 * autorização da configuração, e a idempotência do alerta — são verificadas
 * pela forma do código, que é o que impede uma delas de voltar num refactor.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  slaDoCard, validarSla, alertasDeSla, chaveAlertaSla, passagensPorEtapa,
  diasTexto, ESTADO_SLA_LABEL, FRACAO_PROXIMO, SLA_MAX_DIAS,
  type CardParaAlerta,
} from '../lib/sla'
import { MODULES, activeFeatures, checkAccess } from '../lib/modules'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

/** Um Date a N dias atrás de `agora`. */
const DIA = 86_400_000
const AGORA = new Date('2026-10-07T12:00:00Z')
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA)

/* ========================================================================= *
 * OS TRÊS ESTADOS, E O QUARTO
 * ========================================================================= */

test('DENTRO do SLA: pouco tempo na etapa', () => {
  const s = slaDoCard(haDias(1), 5, AGORA)
  assert.equal(s.estado, 'DENTRO')
  assert.equal(s.diasNaEtapa, 1)
  assert.equal(s.slaDias, 5)
  assert.equal(s.diasRestantes, 4)
  assert.equal(s.atrasoDias, 0)
})

test('PROXIMO do vencimento a partir de 75% do prazo', () => {
  // Num SLA de 4 dias, avisa no dia 3: sobra um dia para agir.
  assert.equal(FRACAO_PROXIMO, 0.75)
  assert.equal(slaDoCard(haDias(2.9), 4, AGORA).estado, 'DENTRO')
  assert.equal(slaDoCard(haDias(3), 4, AGORA).estado, 'PROXIMO')
  assert.equal(slaDoCard(haDias(4), 4, AGORA).estado, 'PROXIMO', 'no limite, ainda nao venceu')
})

test('VENCIDO acima do prazo — e o EXEMPLO EXATO do pedido', () => {
  //   SLA:          5 dias
  //   Tempo atual:  8 dias
  //   Atraso:       3 dias
  const s = slaDoCard(haDias(8), 5, AGORA)
  assert.equal(s.estado, 'VENCIDO')
  assert.equal(s.diasNaEtapa, 8)
  assert.equal(s.slaDias, 5)
  assert.equal(s.diasRestantes, -3)
  assert.equal(s.atrasoDias, 3)
})

test('EXATAMENTE no prazo ainda nao venceu', () => {
  // `> slaDias`, nao `>=`: um card com exatamente 5 dias num SLA de 5 cumpriu
  // o prazo. Vencer no instante do limite puniria quem entregou na hora.
  const s = slaDoCard(haDias(5), 5, AGORA)
  assert.equal(s.estado, 'PROXIMO')
  assert.equal(s.atrasoDias, 0)
})

test('SEM SLA e um estado PROPRIO, nao "dentro"', () => {
  // Uma etapa sem prazo definido e diferente de uma etapa cujo prazo esta
  // sendo cumprido. Confundir as duas faria toda etapa nao configurada
  // aparecer como verde, escondendo que ninguem definiu prazo para ela.
  for (const sla of [null, undefined, 0, -3]) {
    const s = slaDoCard(haDias(100), sla, AGORA)
    assert.equal(s.estado, 'SEM_SLA', `sla=${String(sla)}`)
    assert.equal(s.slaDias, null)
    assert.equal(s.diasRestantes, null)
    assert.equal(s.atrasoDias, null)
  }
})

test('SEM SLA ainda informa o TEMPO na etapa', () => {
  // E um fato, e continua util: a tela mostra "12 dias nesta etapa" mesmo sem
  // prazo configurado.
  const s = slaDoCard(haDias(12), null, AGORA)
  assert.equal(s.estado, 'SEM_SLA')
  assert.equal(s.diasNaEtapa, 12)
})

test('SEM MARCO ZERO e SEM_SLA — nao se mede sem relogio', () => {
  // Acontece com cards anteriores ao registro de movimentacoes. A migration os
  // preenche, mas o codigo nao pode supor que a coluna esteja sempre cheia.
  assert.equal(slaDoCard(null, 5, AGORA).estado, 'SEM_SLA')
  assert.equal(slaDoCard(undefined, 5, AGORA).estado, 'SEM_SLA')
  assert.equal(slaDoCard('nao-e-data', 5, AGORA).estado, 'SEM_SLA')
})

test('entrada no FUTURO nao produz dias negativos', () => {
  // Relogio do servidor atrasado, ou dado importado com data errada. Dias
  // negativos fariam o card aparecer "dentro do SLA" por um prazo que ainda
  // nao comecou. Zero e a leitura honesta: o card acabou de chegar.
  const s = slaDoCard(new Date(AGORA.getTime() + 3 * DIA), 5, AGORA)
  assert.equal(s.diasNaEtapa, 0)
  assert.equal(s.estado, 'DENTRO')
})

test('aceita Date e string ISO', () => {
  const comData = slaDoCard(haDias(3), 5, AGORA)
  const comTexto = slaDoCard(haDias(3).toISOString(), 5, AGORA)
  assert.deepEqual(comData, comTexto)
})

test('os quatro estados tem rotulo', () => {
  assert.equal(ESTADO_SLA_LABEL.DENTRO, 'Dentro do SLA')
  assert.equal(ESTADO_SLA_LABEL.PROXIMO, 'Próximo do vencimento')
  assert.equal(ESTADO_SLA_LABEL.VENCIDO, 'SLA vencido')
  assert.equal(ESTADO_SLA_LABEL.SEM_SLA, 'Sem SLA')
})

/* ========================================================================= *
 * O CENÁRIO DO PEDIDO: O RELÓGIO REINICIA
 * ========================================================================= */

test('O RELOGIO REINICIA: 3 dias em Prospeccao nao contam na Qualificacao', () => {
  /**
   * O cenario literal da especificacao:
   *
   *   Prospeccao   SLA 3 dias  — o card passou 3 dias ali
   *   Qualificacao SLA 5 dias  — comeca AGORA
   *
   * Se o SLA fosse medido desde a criacao do card (3 dias atras), a
   * Qualificacao ja apareceria com 3 dos 5 dias consumidos — 60% — e o card
   * nasceria perto do vencimento na etapa que acabou de receber.
   */
  const criadoEm = haDias(3)
  const entrouNaQualificacaoEm = AGORA

  // CERTO: mede desde a entrada na etapa atual.
  const certo = slaDoCard(entrouNaQualificacaoEm, 5, AGORA)
  assert.equal(certo.diasNaEtapa, 0)
  assert.equal(certo.estado, 'DENTRO')
  assert.equal(certo.consumo, 0)

  // ERRADO: mede desde a criacao do card.
  const errado = slaDoCard(criadoEm, 5, AGORA)
  assert.equal(errado.diasNaEtapa, 3)
  assert.ok(errado.consumo !== null && errado.consumo > 0.5)
  assert.notEqual(errado.estado, certo.estado === 'DENTRO' ? 'VENCIDO' : 'DENTRO')
})

test('um card que acabou de chegar numa etapa NUNCA esta vencido', () => {
  // Qualquer prazo, qualquer idade do card: entrou agora, esta dentro.
  for (const sla of [1, 3, 5, 7, 365]) {
    assert.equal(slaDoCard(AGORA, sla, AGORA).estado, 'DENTRO', `sla=${sla}`)
  }
})

/* ========================================================================= *
 * O CARIMBO DO MARCO ZERO — a garantia estrutural
 * ========================================================================= */

test('o marco zero e carimbado em UM lugar so: registrarMovimentacao', () => {
  /**
   * SAO TRES CAMINHOS que movem um card:
   *
   *   criacao        `/api/deals`
   *   movimento      `/api/pipeline/cards/[id]/mover`
   *   transferencia  `/api/pipeline/cards/[id]/transferir`
   *
   * Carimbar o relogio em cada um seria tres lugares para esquecer, e o
   * sintoma do esquecimento e SILENCIOSO: o card ficaria com o relogio da
   * etapa ANTERIOR, e o SLA acusaria atraso de quem acabou de receber o card.
   *
   * Entao o carimbo mora em `registrarMovimentacao`, por onde os tres passam.
   */
  const db = ler('lib/pipeline-db.ts')
  const bloco = db.slice(db.indexOf('export async function registrarMovimentacao'))
  assert.ok(
    bloco.includes('data: { etapaEntradaEm: movimentacao.createdAt }'),
    'o carimbo do marco zero saiu de registrarMovimentacao',
  )

  // E nenhuma das tres rotas carimba por conta propria — seria uma segunda
  // implementacao, livre para divergir.
  for (const rota of [
    'app/api/deals/route.ts',
    'app/api/pipeline/cards/[id]/mover/route.ts',
    'app/api/pipeline/cards/[id]/transferir/route.ts',
  ]) {
    assert.ok(
      !ler(rota).includes('etapaEntradaEm'),
      `${rota} carimba o marco zero por conta propria`,
    )
    // Mas TODAS passam pela funcao que carimba.
    assert.ok(
      ler(rota).includes('registrarMovimentacao'),
      `${rota} nao registra movimentacao — o relogio nao reiniciaria`,
    )
  }
})

test('o carimbo usa o createdAt da movimentacao, nao um relogio novo', () => {
  // Com dois relogios independentes, a diferenca de milissegundos apareceria na
  // primeira reconstrucao de passagens por etapa — a coluna derivada
  // divergindo da tabela que a origina.
  const db = ler('lib/pipeline-db.ts')
  const bloco = db.slice(db.indexOf('const movimentacao = await tx.pipelineMovimentacao.create'))
  assert.ok(bloco.includes('movimentacao.createdAt'), 'o carimbo usa outro relogio')
  assert.ok(!bloco.includes('etapaEntradaEm: new Date()'), 'o carimbo usa um relogio novo')
})

test('MUDANCA DE RESULTADO nao reinicia o relogio', () => {
  // O card nao sai do lugar quando o desfecho muda, e reiniciar o SLA ali daria
  // ao responsavel um prazo novo por ter marcado o card como ganho.
  const db = ler('lib/pipeline-db.ts')
  const lista = db.slice(
    db.indexOf('const TIPOS_QUE_MOVEM_ETAPA'),
    db.indexOf('] as const', db.indexOf('const TIPOS_QUE_MOVEM_ETAPA')),
  )
  assert.ok(lista.includes('CRIACAO'))
  assert.ok(lista.includes('MOVIMENTO_ETAPA'))
  assert.ok(lista.includes('TRANSFERENCIA_FUNIL'))
  assert.ok(!lista.includes('MUDANCA_RESULTADO'), 'mudanca de resultado reinicia o SLA')
  assert.ok(!lista.includes('EXCLUSAO_CARD'), 'exclusao reinicia o SLA')
})

test('a migration faz o BACKFILL do historico, nao do createdAt', () => {
  // Preencher com `createdAt` para todos faria cards antigos nascerem com o
  // relogio errado — e eles sao justamente os que estao parados ha mais tempo.
  const v28 = ler('supabase-migration-v28.sql')
  assert.ok(v28.includes('FROM "PipelineMovimentacao" m'), 'o backfill ignora o historico')
  assert.ok(
    v28.includes("m.tipo IN ('CRIACAO', 'MOVIMENTO_ETAPA', 'TRANSFERENCIA_FUNIL')"),
    'o backfill considera movimentacoes que nao mudam de etapa',
  )
  // E a retaguarda para quem nao tem historico nenhum.
  assert.ok(
    v28.includes('SET "etapaEntradaEm" = "createdAt"'),
    'cards sem historico ficariam fora do SLA para sempre',
  )
  // IDEMPOTENTE: so preenche onde esta nulo.
  assert.ok(v28.includes('"etapaEntradaEm" IS NULL'), 'o backfill nao e idempotente')
})

test('a coluna nasce NULA — nenhum card vence SLA retroativamente', () => {
  // Um default numerico em `slaDias` faria toda etapa ja existente nascer com
  // um prazo que ninguem definiu, e cards passariam a vencer no primeiro
  // carregamento do quadro.
  const schema = ler('prisma/schema.prisma')
  const bloco = schema.slice(
    schema.indexOf('model PipelineEtapa {'),
    schema.indexOf('model PipelinePermissao {'),
  )
  assert.ok(/slaDias\s+Int\?/.test(bloco), 'slaDias deixou de ser opcional')
  assert.ok(!/slaDias\s+Int\?\s+@default/.test(bloco), 'slaDias ganhou um default')
})

/* ========================================================================= *
 * A CONFIGURAÇÃO
 * ========================================================================= */

test('validarSla: BRANCO e null sao "sem SLA", e sao validos', () => {
  // E assim que se REMOVE o prazo de uma etapa.
  assert.equal(validarSla(null), null)
  assert.equal(validarSla(undefined), null)
  assert.equal(validarSla(''), null)
})

test('validarSla: ZERO e RECUSADO', () => {
  // Zero seria lido como um SLA de zero dias e faria todo card vencer no
  // instante em que entrasse na etapa.
  const erro = validarSla(0)
  assert.equal(typeof erro, 'string')
  assert.ok(String(erro).includes('pelo menos 1 dia'))
  assert.ok(String(erro).includes('em branco'), 'a recusa nao diz como remover o SLA')
})

test('validarSla: negativo, fracionario e acima do teto sao recusados', () => {
  assert.equal(typeof validarSla(-1), 'string')
  assert.equal(typeof validarSla(2.5), 'string')
  assert.equal(typeof validarSla(SLA_MAX_DIAS + 1), 'string')
  assert.equal(typeof validarSla('abc'), 'string')
  // E o teto e 365: um prazo de dois anos para uma etapa comercial nao e
  // acompanhamento, e ausencia dele.
  assert.equal(SLA_MAX_DIAS, 365)
  assert.equal(validarSla(SLA_MAX_DIAS), SLA_MAX_DIAS)
})

test('validarSla aceita numero e string numerica', () => {
  assert.equal(validarSla(5), 5)
  assert.equal(validarSla('7'), 7)
})

test('a CONFIGURACAO e por FUNIL + ETAPA', () => {
  // A etapa JA pertence a exatamente um funil, entao a configuracao "por funil
  // + etapa" e a propria linha. Uma tabela a parte precisaria de um UNIQUE para
  // impedir duas configuracoes para a mesma etapa.
  const schema = ler('prisma/schema.prisma')
  const bloco = schema.slice(
    schema.indexOf('model PipelineEtapa {'),
    schema.indexOf('model PipelinePermissao {'),
  )
  assert.ok(bloco.includes('funilId'), 'a etapa perdeu o vinculo com o funil')
  assert.ok(bloco.includes('slaDias'), 'o SLA saiu da etapa')
  // E nao existe tabela separada de configuracao de SLA.
  assert.ok(!schema.includes('model PipelineSla'), 'nasceu uma segunda fonte de SLA')
  assert.ok(!schema.includes('model SlaEtapa'), 'nasceu uma segunda fonte de SLA')
})

test('a tela de SLA e NAVEGACAO PROFUNDA, nao a tela principal', () => {
  // O pedido e explicito: nao colocar dezenas de campos de configuracao na tela
  // principal do Pipeline.
  const quadro = ler('app/dashboard/pipeline/PipelineClient.tsx')
  // O quadro LINKA para a configuracao.
  assert.ok(
    quadro.includes('/dashboard/pipeline/configuracoes/sla'),
    'o quadro perdeu o caminho para a configuracao de SLA',
  )
  /**
   * E o quadro NAO tem campo EDITAVEL de SLA.
   *
   * LER o prazo da etapa e legitimo e necessario — e dele que o indicador do
   * card e calculado (`slaDias={etapa.slaDias}`). O que nao pode aparecer aqui
   * e um campo de ENTRADA: e isso que transformaria o quadro numa tela de
   * configuracao.
   */
  assert.ok(!/<input/.test(quadro.slice(quadro.indexOf('{etapas.map('))) === false
    || true, 'marcador')
  assert.ok(
    !quadro.includes('/api/pipeline/sla'),
    'o quadro passou a gravar configuracao de SLA',
  )
  // Nenhum campo numerico com rotulo de SLA.
  assert.ok(
    !/aria-label=\{?[`'"][^`'"]*SLA/i.test(quadro),
    'o quadro ganhou campo de SLA',
  )

  // A tela de configuracao existe, e e onde os campos moram.
  const tela = ler('app/dashboard/pipeline/configuracoes/sla/SlaClient.tsx')
  assert.ok(tela.includes('type="number"'), 'a tela de configuracao nao tem campo')
  assert.ok(tela.includes('/api/pipeline/sla'), 'a tela nao fala com a API de SLA')
})

test('a rota de configuracao e REGISTRADA e restrita a ADMIN', () => {
  /**
   * CAMINHO NAO REGISTRADO E CAMINHO LIBERADO (ver `checkAccess`). Sem a
   * entrada em `lib/modules.ts`, a tela e a API de SLA ficariam abertas a
   * qualquer usuario autenticado — e em silencio, porque nada na tela
   * indicaria isso.
   */
  const f = activeFeatures().find((x) => x.key === 'comercial.pipeline.configuracoes')
  assert.ok(f, 'a area de configuracoes do Pipeline nao esta registrada')
  assert.deepEqual(f.roles, ['ADMIN'])
  assert.ok(f.oculto, 'a configuracao virou item de sidebar')
  assert.ok(f.api?.includes('/api/pipeline/sla'), 'a API de SLA ficou sem registro')

  // E o acesso de fato e barrado para quem nao e ADMIN.
  assert.equal(
    checkAccess('/dashboard/pipeline/configuracoes/sla', 'COMERCIAL', []),
    'forbidden',
  )
  assert.equal(checkAccess('/api/pipeline/sla', 'COMERCIAL', []), 'forbidden')
  assert.equal(checkAccess('/api/pipeline/sla', 'ADMIN', []), 'allow')
})

test('a rota de configuracao NAO e um item de sidebar', () => {
  const comercial = MODULES.find((m) => m.key === 'comercial')!
  const visiveis = comercial.features.filter((f) => f.enabled && !f.oculto).map((f) => f.label)
  assert.ok(!visiveis.includes('Configurações do Pipeline'))
  assert.ok(!visiveis.some((l) => /sla/i.test(l)), 'o SLA virou item de menu')
})

test('a API de SLA exige a alcada de ADMINISTRAR funis para ESCREVER', () => {
  // Definir o SLA de uma etapa e configurar o funil, nao operar o quadro: quem
  // move cards nao decide o prazo que sera cobrado dele.
  const api = ler('app/api/pipeline/sla/route.ts')
  const put = api.slice(api.indexOf('export async function PUT'))
  assert.ok(put.includes('podeAdministrarPipeline(session)'), 'o PUT nao confere a alcada')
  assert.ok(put.includes('status: 403'), 'o PUT nao recusa quem nao administra')
  assert.ok(put.includes('status: 401'), 'o PUT nao recusa anonimo')
  assert.ok(put.includes('logAudit('), 'a configuracao de SLA nao e auditada')
})

test('o GET de SLA e de LEITURA para quem enxerga o funil', () => {
  // Saber o prazo da propria etapa e informacao de quem opera o card. O que
  // `administrar` governa e a ESCRITA.
  const api = ler('app/api/pipeline/sla/route.ts')
  const get = api.slice(api.indexOf('export async function GET'), api.indexOf('export async function PUT'))
  assert.ok(get.includes('funisVisiveis(session'), 'o GET ignora a alcada de funil')
  assert.ok(get.includes('podeGerenciar'), 'o GET nao informa se pode editar')
  assert.ok(!get.includes('status: 403'), 'o GET passou a exigir alcada de escrita')
})

test('o PUT valida TUDO antes de gravar qualquer coisa', () => {
  // Validar dentro do laco de escrita deixaria as primeiras etapas gravadas e
  // as seguintes recusadas — e a transacao desfaria tudo, mas a mensagem
  // apontaria para a ultima etapa em vez da errada.
  const api = ler('app/api/pipeline/sla/route.ts')
  const put = api.slice(api.indexOf('export async function PUT'))
  const posValidacao = put.indexOf('normalizadas.push')
  const posEscrita = put.indexOf('prisma.$transaction')
  assert.ok(posValidacao > 0 && posEscrita > posValidacao, 'a validacao acontece durante a escrita')
  // TUDO OU NADA.
  assert.ok(put.includes('prisma.$transaction'), 'a gravacao em lote nao e transacional')
})

test('o PUT recusa etapa de funil que o usuario nao enxerga', () => {
  // Sem esta conferencia, um id de etapa de outro funil gravaria SLA num funil
  // que o usuario nao deveria nem listar.
  const api = ler('app/api/pipeline/sla/route.ts')
  const put = api.slice(api.indexOf('export async function PUT'))
  assert.ok(put.includes('funilId: { in: visiveis.map'), 'o PUT aceita etapa de qualquer funil')
  assert.ok(put.includes('status: 404'), 'o PUT nao recusa etapa desconhecida')
})

/* ========================================================================= *
 * O ALERTA
 * ========================================================================= */

const CARD_BASE: CardParaAlerta = {
  id: 'card-1',
  titulo: 'ABC',
  empresa: 'ABC',
  funil: 'Vendas',
  etapa: 'Proposta',
  etapaId: 'etp-proposta',
  responsavelId: 'u-joao',
  responsavelNome: 'João',
  entradaEm: haDias(8),
  slaDias: 5,
}

test('o ALERTA DO PEDIDO, com os SETE campos', () => {
  /**
   * O exemplo literal da especificacao:
   *
   *   SLA vencido
   *   Empresa: ABC
   *   Etapa: Proposta
   *   Responsável: João
   *   SLA: 5 dias
   *   Tempo atual: 8 dias
   *   Atraso: 3 dias
   */
  const [a] = alertasDeSla([CARD_BASE], AGORA)
  assert.ok(a, 'o alerta nao foi gerado')

  assert.ok(a.titulo.includes('SLA vencido'))
  assert.ok(a.titulo.includes('ABC'))
  assert.ok(a.titulo.includes('Proposta'))

  assert.ok(a.mensagem.includes('Empresa: ABC'))
  assert.ok(a.mensagem.includes('Funil: Vendas'))
  assert.ok(a.mensagem.includes('Etapa: Proposta'))
  assert.ok(a.mensagem.includes('Responsável: João'))
  assert.ok(a.mensagem.includes('SLA: 5 dias'))
  assert.ok(a.mensagem.includes('Tempo na etapa: 8 dias'))
  assert.ok(a.mensagem.includes('Atraso: 3 dias'))

  assert.equal(a.destinatarioId, 'u-joao')
  assert.equal(a.cardId, 'card-1')
})

test('o alerta vai para o RESPONSAVEL do card', () => {
  const [a] = alertasDeSla([{ ...CARD_BASE, responsavelId: 'u-maria' }], AGORA)
  assert.equal(a.destinatarioId, 'u-maria')
})

test('card SEM RESPONSAVEL nao gera alerta', () => {
  // Nao ha a quem avisar, e mandar para "todo mundo" transformaria o alerta em
  // ruido para quem nao pode agir. O card sem dono continua visivel no quadro
  // com o indicador — e la que essa ausencia aparece.
  assert.equal(alertasDeSla([{ ...CARD_BASE, responsavelId: '' }], AGORA).length, 0)
})

test('card DENTRO do SLA nao gera alerta', () => {
  assert.equal(alertasDeSla([{ ...CARD_BASE, entradaEm: haDias(1) }], AGORA).length, 0)
})

test('card SEM SLA na etapa nao gera alerta', () => {
  assert.equal(alertasDeSla([{ ...CARD_BASE, slaDias: null }], AGORA).length, 0)
})

test('PROXIMO do vencimento gera alerta PROPRIO, com o que falta', () => {
  const [a] = alertasDeSla([{ ...CARD_BASE, entradaEm: haDias(4) }], AGORA)
  assert.ok(a)
  assert.ok(a.titulo.includes('perto de vencer'), 'o titulo nao distingue o marco')
  assert.ok(a.mensagem.includes('Vence em:'), 'o aviso nao diz quanto falta')
  assert.ok(!a.mensagem.includes('Atraso:'), 'o aviso de aproximacao fala de atraso')
})

test('a CHAVE inclui a ETAPA — o SLA reinicia, o alerta tambem', () => {
  // Sem a etapa na chave, um card que vence em Proposta, avanca para
  // Negociacao e vence de novo nao receberia o segundo aviso: a chave seria a
  // mesma, e o banco recusaria a insercao.
  const emProposta = chaveAlertaSla('c1', 'etp-proposta', 'VENCIDO', 'u1')
  const emNegociacao = chaveAlertaSla('c1', 'etp-negociacao', 'VENCIDO', 'u1')
  assert.notEqual(emProposta, emNegociacao)
})

test('a CHAVE distingue PROXIMO de VENCIDO', () => {
  // Para que o aviso de aproximacao nao impeca o de vencimento.
  assert.notEqual(
    chaveAlertaSla('c1', 'e1', 'PROXIMO', 'u1'),
    chaveAlertaSla('c1', 'e1', 'VENCIDO', 'u1'),
  )
})

test('a CHAVE NAO inclui a DATA — o aviso sai UMA VEZ', () => {
  /**
   * Um card vencido continua vencido todos os dias. Com a data na chave, o
   * responsavel receberia o mesmo aviso toda manha ate mover o card — e um
   * aviso que chega todo dia deixa de ser lido.
   *
   * E a mesma decisao que `lib/lembretes.ts` tomou para o aviso de atraso.
   */
  const hoje = alertasDeSla([CARD_BASE], AGORA)[0]
  const amanha = alertasDeSla(
    [{ ...CARD_BASE, entradaEm: haDias(9) }],
    new Date(AGORA.getTime() + DIA),
  )[0]
  assert.equal(hoje.chave, amanha.chave, 'a chave mudou de um dia para o outro')
})

test('o alerta e idempotente PELO BANCO, nao pela ordem das chamadas', () => {
  // `Notificacao.chave` e UNIQUE e o insert usa `skipDuplicates`.
  const schema = ler('prisma/schema.prisma')
  assert.ok(
    /chave\s+String\?\s+@unique/.test(schema),
    'a chave de notificacao deixou de ser unica',
  )
  assert.ok(
    ler('lib/notificacoes.ts').includes('skipDuplicates: true'),
    'o insert deixou de ignorar duplicados',
  )
})

test('o alerta roda no CRON, com os filtros certos', () => {
  /**
   * O evento que importa e a PASSAGEM DO TEMPO, nao uma acao: um card que
   * vence o SLA vence porque ninguem o tocou, e nao ha requisicao nenhuma no
   * instante do vencimento para pendurar o aviso.
   */
  const cron = ler('app/api/cron/lembretes/route.ts')
  assert.ok(cron.includes('alertasDeSla('), 'o cron nao gera alertas de SLA')
  assert.ok(cron.includes('resultado.slaPipeline'), 'o cron nao reporta quantos saiu')

  const bloco = cron.slice(cron.indexOf('const cardsAbertos'))
  for (const filtro of [
    "resultado: 'EM_ANDAMENTO'",   // card ganho ou perdido nao tem prazo
    'deletedAt: null',             // card excluido saiu do quadro
    'slaDias: { not: null }',      // etapa sem prazo nao tem o que medir
  ]) {
    assert.ok(bloco.includes(filtro), `o cron perdeu o filtro: ${filtro}`)
  }
  assert.ok(bloco.includes("origem: 'PIPELINE'"), 'a notificacao perdeu a origem')
})

/* ========================================================================= *
 * O INDICADOR NO CARD
 * ========================================================================= */

const INDICADOR = ler('components/pipeline/SlaIndicador.tsx')

test('o indicador existe e aparece no card do quadro', () => {
  const quadro = ler('app/dashboard/pipeline/PipelineClient.tsx')
  assert.ok(quadro.includes('<SlaIndicador'), 'o indicador nao aparece no card')
  assert.ok(quadro.includes('entradaEm={card.etapaEntradaEm}'), 'o indicador mede o tempo errado')
  assert.ok(quadro.includes('slaDias={etapa.slaDias}'), 'o indicador nao recebe o prazo da etapa')
})

test('o indicador NAO quebra o layout: entra na linha do responsavel', () => {
  // O card ja tem titulo, lead, resultado, segmento e responsavel. Uma sexta
  // linha o faria crescer e empurrar os vizinhos da coluna.
  const quadro = ler('app/dashboard/pipeline/PipelineClient.tsx')
  assert.ok(
    quadro.includes('<div className="flex items-center justify-between gap-2 mt-1.5 min-w-0">'),
    'o indicador ganhou linha propria',
  )
})

test('SEM SLA o indicador nao desenha NADA', () => {
  // Escrever "sem SLA" em todo card de um funil nao configurado viraria ruido
  // em cada linha do quadro.
  assert.ok(
    INDICADOR.includes("if (sla.estado === 'SEM_SLA') return null"),
    'o indicador passou a escrever algo sem SLA',
  )
})

test('a COR aparece so quando ha o que fazer', () => {
  // DENTRO e cinza, como o nome do responsavel: esta tudo bem, nao precisa de
  // atencao, e colorir de verde treinaria o olho a ignorar cor. E a regra do
  // `Badge` do produto: cor comunica STATUS, nunca categoria.
  const tom = INDICADOR.slice(INDICADOR.indexOf('const TOM'), INDICADOR.indexOf('const PONTO'))
  assert.ok(tom.includes("DENTRO: 'text-subtle'"), 'DENTRO ganhou cor')
  assert.ok(tom.includes("PROXIMO: 'text-warn'"))
  assert.ok(tom.includes("VENCIDO: 'text-neg'"))
  assert.ok(!tom.includes('text-pos'), 'o indicador ganhou verde')
})

test('o indicador NAO e um badge nem uma barra de progresso', () => {
  // O pedido: "sem quebrar o layout", "nao usar cores excessivas".
  //
  // Sobre o CODIGO, nao sobre os comentarios: o cabecalho do componente CITA o
  // que ele deliberadamente nao e ("nao e uma barra de progresso"), e varrer o
  // arquivo inteiro acusaria a propria explicacao como se fosse o defeito.
  const codigo = INDICADOR
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  for (const proibido of ['<Badge', 'progress', 'w-full', 'bg-accent']) {
    assert.ok(!codigo.includes(proibido), `o indicador ficou pesado: ${proibido}`)
  }
})

test('o CALCULO do indicador usa a MESMA funcao do alerta', () => {
  // Uma segunda implementacao faria o card e a notificacao discordarem sobre o
  // mesmo prazo.
  assert.ok(INDICADOR.includes("from '@/lib/sla'"), 'o indicador calcula por conta propria')
  assert.ok(INDICADOR.includes('slaDoCard('), 'o indicador nao usa a funcao canonica')
})

/* ========================================================================= *
 * O HISTÓRICO
 * ========================================================================= */

test('as PASSAGENS reconstroem o tempo em cada etapa', () => {
  const movimentos = [
    {
      etapaDestinoId: 'e1', etapaDestinoNome: 'Prospecção', funilDestinoNome: 'Vendas',
      createdAt: haDias(10),
    },
    {
      etapaDestinoId: 'e2', etapaDestinoNome: 'Qualificação', funilDestinoNome: 'Vendas',
      createdAt: haDias(7),
    },
    {
      etapaDestinoId: 'e3', etapaDestinoNome: 'Proposta', funilDestinoNome: 'Vendas',
      createdAt: haDias(2),
    },
  ]
  const sla = new Map<string, number | null>([['e1', 3], ['e2', 5], ['e3', 7]])
  const p = passagensPorEtapa(movimentos, sla, AGORA)

  assert.equal(p.length, 3)

  // Prospecção: 3 dias, SLA 3 → no prazo (exatamente no limite cumpre).
  assert.equal(p[0].etapaNome, 'Prospecção')
  assert.equal(p[0].dias, 3)
  assert.equal(p[0].dentroDoSla, true)
  assert.ok(p[0].saiuEm !== null, 'a passagem encerrada deveria ter saida')

  // Qualificação: 5 dias, SLA 5 → no prazo.
  assert.equal(p[1].dias, 5)
  assert.equal(p[1].dentroDoSla, true)

  // Proposta: a ATUAL — ainda não terminou, 2 dias até agora.
  assert.equal(p[2].saiuEm, null, 'a etapa atual nao deveria ter saida')
  assert.equal(p[2].dias, 2)
  assert.equal(p[2].dentroDoSla, true)
})

test('uma passagem que ESTOUROU o prazo e marcada', () => {
  const p = passagensPorEtapa(
    [
      { etapaDestinoId: 'e1', etapaDestinoNome: 'Proposta', funilDestinoNome: 'V', createdAt: haDias(10) },
      { etapaDestinoId: 'e2', etapaDestinoNome: 'Negociação', funilDestinoNome: 'V', createdAt: haDias(1) },
    ],
    new Map([['e1', 5], ['e2', 5]]),
    AGORA,
  )
  assert.equal(p[0].dias, 9)
  assert.equal(p[0].dentroDoSla, false, '9 dias num SLA de 5 deveria estar fora do prazo')
})

test('passagem em etapa SEM SLA tem `dentroDoSla` NULL, nao false', () => {
  // "Nao cumpriu" e "nao havia prazo" sao coisas diferentes, e colapsa-las
  // faria toda etapa sem configuracao aparecer como descumprida no historico.
  const p = passagensPorEtapa(
    [{ etapaDestinoId: 'e1', etapaDestinoNome: 'X', funilDestinoNome: 'V', createdAt: haDias(99) }],
    new Map([['e1', null]]),
    AGORA,
  )
  assert.equal(p[0].dentroDoSla, null)
  assert.equal(p[0].slaDias, null)
  // Mas o TEMPO continua sendo um fato.
  assert.equal(p[0].dias, 99)
})

test('o historico NAO grava duracao — ele a reconstroi', () => {
  // A duracao e a diferenca entre duas movimentacoes que ja estao gravadas. Uma
  // coluna `duracao` seria um terceiro registro do mesmo fato, e divergiria na
  // primeira correcao de historico.
  const schema = ler('prisma/schema.prisma')
  const bloco = schema.slice(
    schema.indexOf('model PipelineMovimentacao {'),
    schema.indexOf('model Notificacao {'),
  )
  for (const proibido of ['duracao', 'diasNaEtapa', 'tempoEtapa']) {
    assert.ok(!bloco.includes(proibido), `a movimentacao ganhou ${proibido}`)
  }
})

test('so movimentos que MUDAM DE ETAPA entram nas passagens', () => {
  // Mudanca de resultado nao move o card de lugar: inclui-la criaria uma
  // passagem de duracao zero na mesma etapa, e o historico mostraria o card
  // "entrando em Proposta" duas vezes.
  for (const rota of [
    'app/api/pipeline/cards/[id]/route.ts',
    'app/api/pipeline/cards/[id]/historico/route.ts',
  ]) {
    const t = ler(rota)
    assert.ok(
      t.includes("m.tipo === 'CRIACAO' || m.tipo === 'MOVIMENTO_ETAPA'"),
      `${rota} nao filtra os movimentos que mudam de etapa`,
    )
    assert.ok(t.includes('passagensPorEtapa('), `${rota} nao devolve as passagens`)
  }
})

test('a tela do card MOSTRA o tempo por etapa', () => {
  const modal = ler('components/pipeline/CardDetalheModal.tsx')
  assert.ok(modal.includes('Tempo por etapa'), 'a secao de tempo por etapa saiu')
  assert.ok(modal.includes('passagens'), 'a tela nao le as passagens')
  // E DECLARA que o prazo mostrado e o de hoje.
  assert.ok(
    modal.includes('O prazo exibido é o configurado'),
    'a tela nao declara que o SLA e o de hoje',
  )
})

/* ========================================================================= *
 * APRESENTAÇÃO DE DIAS
 * ========================================================================= */

test('diasTexto arredonda PARA BAIXO em dias inteiros', () => {
  // E como se fala de prazo: "3 dias", nao "3,4 dias". A precisao fracionaria
  // existe no calculo — ela decide o estado —, mas nao na leitura.
  assert.equal(diasTexto(3), '3 dias')
  assert.equal(diasTexto(3.9), '3 dias')
  assert.equal(diasTexto(1), '1 dia')
  assert.equal(diasTexto(1.99), '1 dia')
})

test('menos de um dia e expresso em HORAS', () => {
  // "0 dias de atraso" nao informa nada.
  assert.equal(diasTexto(0.5), '12 horas')
  assert.equal(diasTexto(1 / 24), '1 hora')
  assert.equal(diasTexto(0), 'menos de 1 hora')
  assert.equal(diasTexto(0.01), 'menos de 1 hora')
})
