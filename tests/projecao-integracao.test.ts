/**
 * PROJEÇÃO INTRADIÁRIA — a integração: ciclo, elegibilidade e as duas telas.
 *
 * ── O QUE SE PRENDE AQUI ─────────────────────────────────────────────────
 *
 * A matemática está em `tests/projecao-intradiaria.test.ts`. Aqui ficam os
 * fatos que a matemática não cobre e que, se quebrarem, quebram em silêncio:
 *
 *   - o lançamento elegível é escolhido por REGISTRO, não por competência;
 *   - o recorte de competência existe, e é ele que impede um lançamento
 *     retroativo de ser subtraído de um acumulado onde ele nunca esteve;
 *   - Home e Conselho usam a MESMA função e a MESMA curva;
 *   - a projeção NÃO escapa para Previsão, relatórios, gráficos ou metas;
 *   - a tela não afirma tempo real;
 *   - o timer é um só, e é limpo.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { incrementoDoCiclo, referenciaDoCiclo, type CicloProjecao } from '../lib/projecao'

const RAIZ = join(import.meta.dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const semComentarios = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const PROJECAO = ler('lib/projecao.ts')
const PURO = ler('lib/projecao-intradiaria.ts')
const HOME = ler('app/dashboard/page.tsx')
const CONSELHO = ler('app/dashboard/conselho/page.tsx')
const PROVEDOR = ler('components/projecao/ProjecaoProvider.tsx')
const RELOGIO = ler('lib/relogio-ciclo.ts')
const FIGURA = ler('components/projecao/FiguraProjetada.tsx')
const NOTA = ler('components/projecao/NotaProjecao.tsx')

/* ========================================================================= *
 * O INCREMENTO E O RECORTE DE COMPETÊNCIA
 * ========================================================================= */

/** Um ciclo de teste, com os dois lançamentos reais de 02/10 e 03/10. */
const cicloDuplo: CicloProjecao = {
  inicio: '2026-10-03T13:00:00.000Z',
  fim: '2026-10-04T13:00:00.000Z',
  agoraServidor: '2026-10-04T02:30:00.000Z',
  lancamentos: [
    {
      competencia: '2026-10-02',
      registradoEm: '2026-10-04T02:03:02.016Z',
      volume: { tpv: 81_321_812.62, receita: 30_045.89, transacoes: 258_922, med: 3_939 },
    },
    {
      competencia: '2026-10-03',
      registradoEm: '2026-10-04T03:01:14.181Z',
      volume: { tpv: 67_744_982.94, receita: 20_788.32, transacoes: 246_133, med: 3_328 },
    },
  ],
}

test('o incremento SOMA os lancamentos do ciclo', () => {
  /**
   * Em Production, as competências de 02/10 e 03/10 entraram no mesmo ciclo
   * (23h03 e 00h01). Animar só a mais recente faria a outra aparecer de uma
   * vez — o salto que a rodada existe para eliminar.
   */
  const i = incrementoDoCiclo(cicloDuplo)
  assert.equal(i.transacoes, 258_922 + 246_133)
  assert.equal(i.med, 3_939 + 3_328)
  assert.ok(Math.abs(i.tpv - (81_321_812.62 + 67_744_982.94)) < 1e-6)
  assert.ok(Math.abs(i.receita - (30_045.89 + 20_788.32)) < 1e-6)
})

test('o RECORTE DE COMPETENCIA e respeitado', () => {
  // As duas competências são de outubro: o recorte do mês soma as duas.
  const out = incrementoDoCiclo(cicloDuplo, '2026-10')
  assert.equal(out.transacoes, 258_922 + 246_133)
  // Nenhuma é de setembro: o recorte de setembro soma zero.
  const set = incrementoDoCiclo(cicloDuplo, '2026-09')
  assert.deepEqual(set, { tpv: 0, receita: 0, transacoes: 0, med: 0 })
})

test('um lancamento RETROATIVO nao polui o acumulado do mes corrente', () => {
  /**
   * O DEFEITO SILENCIOSO QUE O RECORTE IMPEDE.
   *
   * A migration v29 criou 234 linhas de fevereiro a setembro com `createdAt`
   * de hoje. Sem o recorte, esse volume entraria no incremento do ciclo e
   * seria subtraído do acumulado de OUTUBRO — onde ele nunca esteve. O painel
   * mostraria um número menor que o do ciclo anterior.
   */
  const ciclo: CicloProjecao = {
    ...cicloDuplo,
    lancamentos: [
      {
        competencia: '2026-02-15',
        registradoEm: '2026-10-04T02:00:00.000Z',
        volume: { tpv: 999_999, receita: 888, transacoes: 777, med: 66 },
      },
      cicloDuplo.lancamentos[1],
    ],
  }
  const out = incrementoDoCiclo(ciclo, '2026-10')
  assert.equal(out.transacoes, 246_133, 'o retroativo de fevereiro entrou em outubro')
  assert.equal(out.med, 3_328)

  // Sem recorte — o acumulado de TODOS os meses — ele entra, e está correto:
  // ali o volume de fevereiro de fato faz parte do total.
  const todos = incrementoDoCiclo(ciclo)
  assert.equal(todos.transacoes, 777 + 246_133)
})

test('CICLO SEM LANCAMENTO devolve incremento zero e referencia nula', () => {
  // "Mantenha o último valor válido... Não inventar um novo volume."
  const vazio: CicloProjecao = { ...cicloDuplo, lancamentos: [] }
  assert.deepEqual(incrementoDoCiclo(vazio), { tpv: 0, receita: 0, transacoes: 0, med: 0 })
  assert.equal(referenciaDoCiclo(vazio), null)
})

test('a REFERENCIA e o lancamento mais recentemente registrado', () => {
  // É o que a tela declara ("referente a 03/10, registrado às 00h01").
  const r = referenciaDoCiclo(cicloDuplo)
  assert.equal(r?.competencia, '2026-10-03')
  assert.equal(r?.registradoEm, '2026-10-04T03:01:14.181Z')
  // E respeita o recorte.
  assert.equal(referenciaDoCiclo(cicloDuplo, '2026-09'), null)
})

/* ========================================================================= *
 * O LANÇAMENTO ELEGÍVEL É ESCOLHIDO POR REGISTRO
 * ========================================================================= */

test('a consulta filtra por `createdAt`, NUNCA por competencia', () => {
  /**
   * A distinção que o pedido isola: o lançamento feito hoje às 10h se refere a
   * ONTEM. Escolher o ciclo pela competência animaria um número que já estava
   * visível — e o faria CAIR na virada, porque ele já estava somado no
   * acumulado.
   *
   * Com `createdAt`, o incremento é por definição o volume que o acumulado
   * ainda não mostrava quando o ciclo começou. É isso que faz o número só
   * subir.
   */
  const sem = semComentarios(PROJECAO)
  assert.ok(
    sem.includes('where: { createdAt: { gte: ciclo.inicio, lt: ciclo.fim } }'),
    'a elegibilidade deixou de ser decidida pelo registro',
  )
  assert.ok(!/where:[\s\S]{0,80}data: \{ gte/.test(sem),
    'a consulta passou a filtrar o ciclo por competência')
})

test('o ciclo e apurado NO SERVIDOR, e o relogio dele viaja no payload', () => {
  /**
   * "Evitar que cada navegador calcule ciclos diferentes por causa do timezone
   * ou do relógio local."
   */
  assert.ok(PROJECAO.includes('agoraServidor'))
  assert.ok(semComentarios(PROJECAO).includes('agoraServidor: agora.toISOString()'))
  // A MEDIÇÃO mora em `lib/relogio-ciclo` (fora do React, onde é testável — ver
  // `tests/relogio-ciclo.test.ts`); aqui se verifica que o provedor a USA.
  const sem = semComentarios(PROVEDOR)
  assert.ok(sem.includes("from '@/lib/relogio-ciclo'"))
  assert.ok(sem.includes('medirDesvio(agoraServidor)'))
  const rel = semComentarios(RELOGIO)
  assert.ok(rel.includes('const t = Date.parse(agoraServidor)'))
  assert.ok(rel.includes('desvioMs = t - Date.now()'))
  // E a medição acontece na ASSINATURA, não na renderização: `Date.now()` é
  // impuro, e lê-lo durante o render daria resultados que mudam a cada
  // re-render.
  assert.ok(sem.includes('medirDesvio(agoraServidor)\n    return assinar(aviso)'))
})

/* ========================================================================= *
 * HOME E CONSELHO COMPARTILHAM A REGRA
 * ========================================================================= */

test('as DUAS telas chamam a MESMA funcao de ciclo', () => {
  for (const [nome, fonte] of [['Home', HOME], ['Conselho', CONSELHO]] as const) {
    assert.ok(fonte.includes("from '@/lib/projecao'"), `${nome} não usa o módulo comum`)
    assert.ok(fonte.includes('await cicloDeProjecao()'), `${nome} não apura o ciclo`)
    assert.ok(fonte.includes('incrementoDoCiclo'), `${nome} não calcula o incremento`)
    assert.ok(fonte.includes('<ProjecaoProvider'), `${nome} não monta o provedor`)
  }
})

test('NENHUMA das duas telas reimplementa a curva', () => {
  /**
   * "Não implementar fórmulas diferentes nas duas páginas."
   *
   * A curva vive em `lib/projecao-intradiaria`. Uma segunda implementação numa
   * das telas é como duas páginas passam a mostrar números diferentes para o
   * mesmo instante — e o Conselho é onde os sócios leem o desempenho.
   */
  for (const [nome, fonte] of [['Home', HOME], ['Conselho', CONSELHO]] as const) {
    const sem = semComentarios(fonte)
    for (const proibido of ['26', 'PESO_TOTAL', 'pesoAcumulado', 'fracaoDoCiclo', '18', '20']) {
      if (proibido === '18' || proibido === '20' || proibido === '26') continue
      assert.ok(!sem.includes(proibido), `${nome} reimplementou a curva (${proibido})`)
    }
  }
})

test('os QUATRO KPIs da Home estao projetados — e so eles', () => {
  const sem = semComentarios(HOME)
  // Os quatro, cada um com a sua grandeza.
  assert.ok(sem.includes("proj(kpis.receitaTarifaria, incremento.receita, 'moeda')"))
  assert.ok(sem.includes("proj(kpis.tpv, incremento.tpv, 'moeda')"))
  assert.ok(sem.includes("proj(kpis.qtdTransacoes, incremento.transacoes, 'contagem')"))
  assert.ok(sem.includes("proj(kpis.qtdMed, incremento.med, 'contagem')"))

  // E NENHUM dos excluídos.
  for (const fora of ['saldoMedio', 'takeRate', 'percentMed', 'clientesAtivos', 'baasAtivos', 'whiteLabelsAtivos']) {
    assert.ok(
      !new RegExp(`proj\\([^)]*${fora}`).test(sem),
      `${fora} foi projetado, e não deveria`,
    )
  }
})

test('o Conselho projeta os acumulados e os estrategicos de VOLUME', () => {
  const sem = semComentarios(CONSELHO)
  // Nível 1 — o acumulado de TODOS os meses usa o incremento sem recorte.
  assert.ok(sem.includes('real={histTpv} incremento={incTodos.tpv}'))
  assert.ok(sem.includes('incremento: incTodos.receita'))
  assert.ok(sem.includes('incremento: incTodos.transacoes'))
  // Nível 2 — o mês corrente usa o incremento recortado.
  assert.ok(sem.includes('incremento: incMes.tpv'))
  assert.ok(sem.includes('incremento: incMes.receita'))
  assert.ok(sem.includes('incremento: incMes.transacoes'))

  // E os dois recortes existem, pelos dois acumulados da tela.
  assert.ok(sem.includes('incrementoDoCiclo(ciclo)'))
  assert.ok(sem.includes("incrementoDoCiclo(ciclo, periodo)"))
})

test('Take Rate, % de MEDs e MRR NAO sao projetados no Conselho', () => {
  /**
   * Os dois primeiros são RAZÕES: projetar numerador e denominador pela mesma
   * fração não os move, e projetar um só mentiria sobre a eficiência. O MRR é
   * contrato assinado, não volume.
   */
  const sem = semComentarios(CONSELHO)
  const bloco = sem.slice(sem.indexOf('const estrategicos = ['), sem.indexOf('NÍVEL 5'))
  for (const linha of ['Take Rate', 'MRR', '% de MEDs']) {
    const i = bloco.indexOf(`label: '${linha}'`)
    assert.ok(i > 0, `${linha} saiu do nível 2`)
    // A entrada termina no fecho da linha; nenhuma delas carrega `proj`.
    const entrada = bloco.slice(i, bloco.indexOf('\n', i) + 1)
    assert.ok(!entrada.includes('proj'), `${linha} foi projetado, e não deveria`)
  }
})

/* ========================================================================= *
 * A PROJEÇÃO NÃO ESCAPA DA CAMADA DE APRESENTAÇÃO
 * ========================================================================= */

test('NENHUM modulo de calculo importa a projecao', () => {
  /**
   * A REGRA MAIS IMPORTANTE DO PEDIDO: "Não permitir que os valores simulados
   * sejam utilizados como dados reais por outros módulos."
   *
   * Previsão, metas, financeiro, KPIs, relatórios e as APIs continuam lendo o
   * valor REAL. Se um deles importar a projeção, um número de apresentação
   * entra na contabilidade — e o defeito seria invisível, porque os dois
   * convergem ao fim do ciclo.
   */
  const calculo = [
    'lib/kpi.ts', 'lib/financeiro.ts', 'lib/previsao.ts', 'lib/previsao-calculo.ts',
    'lib/previsao-receita.ts', 'lib/metas.ts', 'lib/lancamento-baas.ts',
    'lib/baas-titulos.ts', 'lib/volumetria.ts', 'lib/periodo.ts',
    'lib/comparacao-temporal.ts', 'lib/sla.ts', 'lib/pipeline.ts',
  ]
  for (const arquivo of calculo) {
    const fonte = ler(arquivo)
    assert.ok(
      !fonte.includes('projecao-intradiaria') && !fonte.includes("from '@/lib/projecao'"),
      `${arquivo} passou a depender da camada de projeção`,
    )
  }
})

test('NENHUMA rota de API devolve valor projetado', () => {
  const rotas: string[] = []
  const varrer = (dir: string) => {
    for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) varrer(p)
      else if (e.name === 'route.ts') rotas.push(p)
    }
  }
  varrer('app/api')
  assert.ok(rotas.length > 50, 'a varredura não encontrou as rotas')
  for (const r of rotas) {
    const fonte = ler(r)
    assert.ok(
      !fonte.includes('projecao'),
      `${r} passou a envolver a camada de projeção`,
    )
  }
})

test('a projecao NAO escreve nada, em lugar nenhum', () => {
  /**
   * "Não criar lançamentos artificiais. Não atualizar o banco a cada segundo.
   * Não gravar transações fictícias."
   */
  for (const [nome, fonte] of [
    ['projecao.ts', PROJECAO], ['projecao-intradiaria.ts', PURO],
    ['ProjecaoProvider', PROVEDOR], ['FiguraProjetada', FIGURA],
  ] as const) {
    const sem = semComentarios(fonte)
    // Escritas de PRISMA. O prefixo `prisma.` é o que separa uma gravação no
    // banco de um `Set.delete` do próprio provedor.
    for (const escrita of ['create(', 'update(', 'upsert(', 'delete(', 'createMany(', 'deleteMany(']) {
      assert.ok(
        !new RegExp(`prisma\\.[A-Za-z]+\\.${escrita.replace('(', '\\(')}`).test(sem),
        `${nome} passou a gravar no banco (${escrita})`,
      )
    }
    // E nenhuma requisição de rede: o tick é local, e o pedido proíbe uma
    // chamada ao backend por segundo.
    assert.ok(!sem.includes('fetch('), `${nome} passou a fazer requisição`)
  }
  // A ÚNICA consulta é uma leitura.
  assert.ok(semComentarios(PROJECAO).includes('prisma.lancamentoDiario.findMany'))
})

test('os GRAFICOS e as SETAS continuam com os valores reais', () => {
  /**
   * "Gráficos históricos devem permanecer baseados nos dados reais.
   * Comparações temporais devem continuar usando os valores reais."
   */
  const graficos = ler('components/dashboard/DashboardCharts.tsx')
  assert.ok(!graficos.includes('projecao'), 'os gráficos passaram a ler a projeção')
  assert.ok(!ler('components/dashboard/ConselhoEvolucao.tsx').includes('projecao'))

  // As sparklines e os deltas da Home saem da série real.
  const sem = semComentarios(HOME)
  assert.ok(sem.includes('const spark = (pick: (k: KpisPeriodo) => number | null) => serie.map'))
  assert.ok(sem.includes('anterior ? variacao(pick(kpis), pick(anterior)) : null'))
})

/* ========================================================================= *
 * A TELA NÃO AFIRMA TEMPO REAL
 * ========================================================================= */

test('nenhuma tela diz "tempo real", "ao vivo" ou equivalente', () => {
  /**
   * "Não afirmar que os dados são recebidos em tempo real."
   *
   * A Bass Pago não recebe eventos transacionais. Um número que cresce sozinho
   * já é lido como "dado chegando agora" — e é por isso que a nota existe e é
   * por isso que estas palavras são proibidas.
   */
  const proibidas = [
    'tempo real', 'ao vivo', 'em tempo-real', 'live', 'realtime',
    'transações agora', 'atualizando agora',
  ]
  for (const [nome, fonte] of [
    ['Home', HOME], ['Conselho', CONSELHO],
    ['NotaProjecao', NOTA], ['FiguraProjetada', FIGURA],
  ] as const) {
    const baixo = fonte.toLowerCase()
    for (const p of proibidas) {
      // "tempo real" aparece nos comentários para NEGAR que exista. O que não
      // pode é a tela afirmá-lo — então a varredura é do texto renderizado.
      const semCom = semComentarios(fonte).toLowerCase()
      assert.ok(!semCom.includes(p), `${nome} afirma "${p}" na tela`)
      assert.ok(baixo.length > 0)
    }
  }
})

test('a nota DECLARA a competencia e o horario do registro', () => {
  /**
   * "Se houver indicação de atualização, ela deve representar corretamente a
   * data e a hora do lançamento de referência."
   */
  assert.ok(NOTA.includes('referencia.competencia'))
  assert.ok(NOTA.includes('referencia.registradoEm'))
  assert.ok(NOTA.includes('registrado em'))
  assert.ok(NOTA.includes('não há captura transacional contínua'))
  // E o fuso da formatação é o operacional, não o do navegador.
  assert.ok(NOTA.includes('timeZone: FUSO_OPERACIONAL'))
})

test('SEM lancamento no ciclo, a nota diz isso — nao desaparece', () => {
  // "Não exibir uma falsa confirmação de atualização em tempo real."
  assert.ok(NOTA.includes('Nenhum lançamento novo no ciclo'))
  assert.ok(NOTA.includes('acumulado já registrado'))
})

/* ========================================================================= *
 * O TIMER
 * ========================================================================= */

test('UM timer para a aplicacao, criado no primeiro e limpo no ultimo', () => {
  /**
   * "Não cause vazamento de timers. Seja corretamente limpo quando o
   * componente desmontar."
   *
   * O intervalo vive em escopo de módulo e é compartilhado: navegar entre Home
   * e Conselho não acumula timers, e sair da última tela projetada apaga o
   * único que existe.
   */
  // O intervalo vive em `lib/relogio-ciclo`. O comportamento (um timer, limpo
  // no último a sair) é exercitado de verdade em `tests/relogio-ciclo.test.ts`;
  // aqui se prende a ESTRUTURA — um `setInterval` no produto inteiro, e o
  // provedor sem timer próprio.
  const rel = semComentarios(RELOGIO)
  assert.equal((rel.match(/setInterval\(/g) ?? []).length, 1, 'há mais de um setInterval')
  assert.ok(rel.includes('clearInterval(timer)'), 'o timer não é limpo')
  assert.ok(rel.includes('ouvintes.size === 0'), 'o timer não é limpo no último a sair')
  assert.ok(rel.includes('ouvintes.delete(aviso)'))
  assert.ok(!semComentarios(PROVEDOR).includes('setInterval'),
    'o provedor voltou a criar o seu próprio timer')
})

test('o timer NAO e armado quando nao ha incremento', () => {
  // Um intervalo rodando para multiplicar zero é só consumo de bateria.
  const sem = semComentarios(PROVEDOR)
  assert.ok(sem.includes('if (!ativo) return () => {}'))
  assert.ok(HOME.includes('ativo={temIncremento}'))
  assert.ok(CONSELHO.includes('ativo={temIncremento}'))
})

test('o intervalo e de 1 segundo — nem rapido demais, nem uma requisicao', () => {
  assert.ok(semComentarios(RELOGIO).includes('export const INTERVALO_MS = 1000'))
  // E o tick NÃO vai ao servidor: a fração é recalculada do relógio local.
  // "Não faça uma requisição ao backend a cada segundo."
  assert.ok(!semComentarios(RELOGIO).includes('fetch('))
  assert.ok(!semComentarios(PROVEDOR).includes('fetch('))
})

test('a fracao e RECALCULADA do relogio, nunca acumulada', () => {
  /**
   * "A projeção deve ser baseada no horário atual, não no tempo decorrido
   * desde que a tela foi aberta."
   *
   * É isso que faz o número sobreviver a recarregar a página, trocar de tela,
   * voltar de uma aba suspensa e abrir em outro dispositivo: não existe estado
   * a preservar.
   */
  const sem = semComentarios(PROVEDOR)
  assert.ok(sem.includes('fracaoDoCiclo(agora, ciclo)'))
  // Nenhum acumulador.
  assert.ok(!/\+=/.test(sem), 'o provedor passou a acumular em vez de recalcular')
  assert.ok(sem.includes('useSyncExternalStore'))
})

test('a PRIMEIRA renderizacao usa o instante do SERVIDOR', () => {
  // Começar pelo relógio local acusaria divergência de hidratação no primeiro
  // quadro — e o número daria um pulo visível ao hidratar.
  assert.ok(semComentarios(RELOGIO).includes('export function semCliente(): null'))
  assert.ok(semComentarios(PROVEDOR).includes("segundo === null ? new Date(agoraServidor)"))
})
