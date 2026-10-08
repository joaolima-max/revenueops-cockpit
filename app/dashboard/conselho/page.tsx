export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { podeVerConselho } from '@/lib/autorizacao'
import { formatMesRef } from '@/lib/utils'
import {
  kpisDoPeriodo, linhasReceita, indicadoresEstrutura, composicaoReceitaConselho,
  comparacaoMensal, rotuloComparacao,
  periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'
import {
  figuraMoeda, figuraQuantidade, figuraPercentual, figuraContagem,
  variacao, moedaCheia,
} from '@/lib/format-financeiro'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import EmptyState, { NoData } from '@/components/ui/EmptyState'
import Figure, { Delta, Contexto } from '@/components/ui/Figure'
import ConselhoEvolucao from '@/components/dashboard/ConselhoEvolucao'
import ProjecaoProvider from '@/components/projecao/ProjecaoProvider'
import FiguraProjetada from '@/components/projecao/FiguraProjetada'
import NotaProjecao from '@/components/projecao/NotaProjecao'
import {
  cicloDeProjecao, incrementoDoCiclo, referenciaDoCiclo,
} from '@/lib/projecao'

export default async function ConselhoPage() {
  /**
   * CONSELHO: SÓCIO **E** `view_conselho`.
   *
   * `podeVerConselho()` é o ÚNICO lugar que decide isso, e lê as duas
   * condições do BANCO a cada requisição. Esta página é a autoridade sobre o
   * acesso; o menu usa a mesma regra, pela mesma função.
   *
   * O proxy não decide: ele roda no edge, só conhece o JWT, e o JWT vive 7
   * dias. Quando `isPartner` passou a entrar no token, o cookie de quem já
   * estava logado não o tinha — e tratar o ausente como "não é sócio" barrava
   * o sócio legítimo, com a sidebar mostrando o menu e o clique virando
   * redirect. Ler do banco resolve as duas pontas: o sócio entra agora, e
   * quem deixa de ser sócio perde o acesso agora.
   *
   * Ser ADMIN, ser Diretor ou estar no departamento Conselho NÃO basta, de
   * propósito. Eram três formas de inferir sócio, e cada uma delas dava falso
   * positivo — além de ter sido assim que o acesso acabou bloqueado para quem
   * estava configurado no contexto de Conselho mas sem a outra metade marcada.
   *
   * Nem ser sócio basta sozinho: `view_conselho` é a alçada explícita, e é
   * RESTRITA — não vem por perfil, nem pelo atalho de ADMIN.
   */
  const session = await getSession()
  if (!session) redirect('/login')
  if (!(await podeVerConselho(session))) redirect('/dashboard')

  const periodo = periodoAtual()
  const periodos = ultimosPeriodos(24)

  // MESMA função que o Cockpit e o Financeiro usam para estes três números.
  // Nenhuma consulta equivalente é repetida aqui.
  const [receita, composicao, estrutura, serie] = await Promise.all([
    linhasReceita(periodo),
    // Os SEIS tipos oficiais do Conselho. Transacional é a tarifária — mesma
    // receita, o nome que o Conselho usa; não são duas linhas.
    composicaoReceitaConselho(periodo),
    indicadoresEstrutura(periodo),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
  ])

  const comDados = serie.filter((k: KpisPeriodo) => k.temDados)
  const histTpv = comDados.reduce((a, k) => a + (k.tpv ?? 0), 0)
  const histTx = comDados.reduce((a, k) => a + (k.qtdTransacoes ?? 0), 0)
  const histFat = comDados.reduce((a, k) => a + (k.receitaTarifaria ?? 0) + (k.float ?? 0), 0)
  const temHistorico = comDados.length > 0

  /**
   * COMPARAÇÃO EQUIVALENTE — a MESMA função que o Cockpit usa.
   *
   * O mês corrente está sempre pela metade, e medi-lo contra o mês anterior
   * INTEIRO fazia toda variação ficar negativa no começo de cada mês. Agora os
   * dois lados usam a mesma janela de dias de calendário.
   *
   * `comparacaoMensal` é o único lugar que decide isso. Duas telas calculando
   * a própria base comparável é como elas passam a discordar — e aqui o custo
   * seria alto: o Conselho é onde os sócios leem o desempenho da empresa.
   */
  /**
   * O CICLO DE PROJEÇÃO INTRADIÁRIA — a MESMA função e a MESMA curva da Home.
   *
   * `cicloDeProjecao` é a única consulta, e `lib/projecao-intradiaria` é a
   * única matemática. Duas telas com fórmulas próprias é como elas passam a
   * discordar — e aqui o custo seria alto: o Conselho é onde os sócios leem o
   * desempenho da empresa.
   *
   * ── DOIS RECORTES, PORQUE A TELA TEM DOIS ACUMULADOS ──────────────────
   *
   * O nível 1 soma TODOS os meses lançados; o nível 2 é o mês corrente. O
   * incremento do ciclo tem de ser subtraído do acumulado CERTO em cada caso,
   * senão o número cai: subtrair um incremento de outubro de um total que não
   * o contém daria um valor menor que o do ciclo anterior.
   *
   * Um ciclo, uma consulta, dois recortes somados em memória.
   */
  const ciclo = await cicloDeProjecao()
  const incTodos = incrementoDoCiclo(ciclo)
  const incMes = incrementoDoCiclo(ciclo, periodo)
  const referencia = referenciaDoCiclo(ciclo)
  const temIncremento = ciclo.lancamentos.length > 0 && (
    incTodos.tpv !== 0 || incTodos.receita !== 0
    || incTodos.transacoes !== 0 || incTodos.med !== 0
  )

  const comparacao = await comparacaoMensal(periodo, serie)
  const kpis = comparacao.atual
  const anterior = comparacao.anterior
  const varDe = (pick: (k: KpisPeriodo) => number | null) =>
    anterior ? variacao(pick(kpis), pick(anterior)) : null
  const notaComparacao = rotuloComparacao(comparacao)

  /**
   * NÍVEL 2 — os números estratégicos.
   *
   * `projecao` só nos TRÊS que carregam volume do ciclo: TPV do mês,
   * Faturamento (pela parcela tarifária dele) e Transações.
   *
   * Take Rate, % de MEDs e MRR ficam de fora, e não por omissão: os dois
   * primeiros são RAZÕES — receita ÷ TPV e MEDs ÷ transações — e projetar o
   * numerador e o denominador pela mesma fração não os move, enquanto
   * projetar um só mentiria sobre a eficiência da operação. O MRR é contrato
   * assinado, não volume: ele não "cresce ao longo do dia".
   */
  const estrategicos = [
    {
      label: 'TPV do mês',
      fig: kpis.tpv === null ? null : figuraMoeda(kpis.tpv),
      delta: varDe(k => k.tpv),
      proj: kpis.tpv === null ? undefined
        : { real: kpis.tpv, incremento: incMes.tpv, grandeza: 'moeda' as const },
    },
    {
      label: 'Faturamento',
      fig: receita ? figuraMoeda(receita.total) : null,
      // A PARCELA TARIFÁRIA é a única projetável do faturamento. Float,
      // sustentação e setup não vêm do lançamento diário de volume.
      proj: receita
        ? { real: receita.total, incremento: incMes.receita, grandeza: 'moeda' as const }
        : undefined,
    },
    { label: 'Take Rate', fig: kpis.takeRate === null ? null : figuraPercentual(kpis.takeRate, 3), delta: varDe(k => k.takeRate) },
    { label: 'MRR', fig: figuraMoeda(estrutura.mrr.total) },
    {
      label: 'Transações',
      fig: kpis.qtdTransacoes === null ? null : figuraQuantidade(kpis.qtdTransacoes),
      delta: varDe(k => k.qtdTransacoes),
      proj: kpis.qtdTransacoes === null ? undefined
        : { real: kpis.qtdTransacoes, incremento: incMes.transacoes, grandeza: 'contagem' as const },
    },
    { label: '% de MEDs', fig: kpis.percentMed === null ? null : figuraPercentual(kpis.percentMed, 2), delta: varDe(k => k.percentMed) },
  ]

  /* NÍVEL 5 — a carteira em números inteiros. MESMAS fontes do Cockpit e do
     Financeiro: `indicadoresEstrutura` é a única função que produz estes três
     números, e nenhuma tela repete a consulta. */
  const carteira = [
    { label: 'Clientes ativos', v: estrutura.clientesAtivos },
    { label: 'White Labels ativos', v: estrutura.whiteLabelsAtivos },
    { label: 'BaaS ativos', v: estrutura.baasAtivos },
  ]

  /**
   * As SEIS linhas do Conselho: Transacional, Setup, Mensalidades,
   * Sustentação, Serviços e BaaS. A partição é exclusiva — cada real entra em
   * exatamente uma, e a natureza da categoria classifica antes do vínculo com
   * o parceiro (um setup cobrado de um BaaS é setup).
   *
   * MENSALIDADES não soma: já está embutida no transacional.
   */
  const linhasQueSomam = composicao.linhas.filter((l) => l.soma)

  /** Maior linha de receita — responde "onde está a receita" sem o executivo somar. */
  const maiorLinha = composicao.total > 0
    ? [...linhasQueSomam].sort((a, b) => b.valor - a.valor)[0]
    : null

  const evolucao = periodos.map((p, i) => ({
    mes: formatMesRef(p),
    tpv: serie[i].tpv ?? 0,
    faturamento: serie[i].temDados ? (serie[i].receitaTarifaria ?? 0) + (serie[i].float ?? 0) : 0,
  }))

  return (
    <div className="space-y-10">
      <PageHeader
        title="Conselho Administrativo"
        sub={<>Indicadores consolidados · <span className="capitalize">{formatMesRef(periodo)}</span></>}
      />

      {/* ── OS DOIS NÍVEIS DE VOLUME, SOB O RELÓGIO DA PROJEÇÃO ───────────
          Um provedor para os dois, e o mesmo relógio compartilhado com a Home
          (o timer vive em escopo de módulo). Dois usuários, duas telas e dois
          dispositivos chegam no mesmo número para o mesmo segundo. */}
      <ProjecaoProvider
        inicio={ciclo.inicio}
        fim={ciclo.fim}
        agoraServidor={ciclo.agoraServidor}
        ativo={temIncremento}
      >
      <div className="space-y-10">
      {/* ── NÍVEL 1 · HEADLINE ────────────────────────────────────────────
          Uma faixa, três números acumulados. É a resposta a "o que aconteceu".

          O INCREMENTO DO CICLO É SUBTRAÍDO DO ACUMULADO DE TODOS OS MESES,
          que é o que estes três números somam. O histórico fechado aparece
          inteiro; só a fatia que entrou neste ciclo cresce. */}
      <section className="rounded-3xl border border-line bg-surface overflow-hidden">
        <div className="px-6 sm:px-10 pt-9 sm:pt-12 pb-8">
          <p className="t-label text-subtle">TPV acumulado</p>
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            {temHistorico
              ? <FiguraProjetada real={histTpv} incremento={incTodos.tpv}
                  grandeza="moeda" size="hero" />
              : <Figure figura={null} size="hero" />}
            {temHistorico && <Delta v={varDe(k => k.tpv)} sufixo="no mês corrente" className="pb-2" />}
          </div>
          <div className="flex items-center gap-3 mt-6">
            <span className="bp-rule" aria-hidden />
            <Contexto>
              {temHistorico
                ? `Acumulado de ${comDados.length} ${comDados.length === 1 ? 'mês' : 'meses'} com lançamento`
                : 'Nenhum período lançado'}
            </Contexto>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-px bg-line border-t border-line">
          {[
            {
              label: 'Faturamento acumulado',
              real: histFat,
              // SÓ A PARCELA TARIFÁRIA é projetável: `histFat` soma receita
              // tarifária + Float, e o Float não vem do volume lançado.
              incremento: incTodos.receita,
              grandeza: 'moeda' as const,
            },
            {
              label: 'Transações acumuladas',
              real: histTx,
              incremento: incTodos.transacoes,
              grandeza: 'contagem' as const,
            },
          ].map((h) => (
            <div key={h.label} className="bg-surface px-6 sm:px-10 py-7 transition-colors duration-[380ms] hover:bg-surface-2">
              <p className="t-label text-subtle mb-3">{h.label}</p>
              {temHistorico
                ? <FiguraProjetada real={h.real} incremento={h.incremento}
                    grandeza={h.grandeza} />
                : <Figure figura={null} />}
            </div>
          ))}
        </div>
      </section>

      {/* ── NÍVEL 2 · NÚMEROS ESTRATÉGICOS ───────────────────────────────── */}
      <section className="space-y-4">
        {/* O SUBTÍTULO DECLARA A JANELA.
            "contra o último mês com lançamento" era verdade mas incompleto: a
            comparação é contra a MESMA janela de dias desse mês, não contra
            ele inteiro. Dizer qual é a janela é o que torna a variação
            verificável — e a ausência dessa frase foi o que deixou a
            comparação desigual passar tanto tempo sem ser notada. */}
        <PanelHeader
          title="Como estamos"
          sub={
            comparacao.ateDia !== null
              ? `Desempenho de ${formatMesRef(periodo)} até o dia `
                + `${String(comparacao.ateDia).padStart(2, '0')}, contra a mesma janela `
                + 'do último mês com lançamento.'
              : `Desempenho de ${formatMesRef(periodo)} contra o último mês com lançamento.`
          }
        />
        <HairlineGrid cols={3}>
          {estrategicos.map((m) => (
            <HairlineCell key={m.label} className="gap-3">
              <p className="t-label text-subtle">{m.label}</p>
              {m.proj
                ? <FiguraProjetada real={m.proj.real} incremento={m.proj.incremento}
                    grandeza={m.proj.grandeza} />
                : <Figure figura={m.fig} />}
              <div className="min-h-[1.125rem]">
                {/* A SETA NÃO É PROJETADA: a comparação temporal continua
                    lendo os valores reais dos dois lados. */}
                {m.delta && <Delta v={m.delta} sufixo={notaComparacao} />}
              </div>
            </HairlineCell>
          ))}
        </HairlineGrid>
      </section>

      {/* A DECLARAÇÃO DA ORIGEM, fechando os dois níveis de volume. */}
      {temHistorico && (
        <NotaProjecao
          referencia={referencia}
          inicio={ciclo.inicio}
          quantos={ciclo.lancamentos.length}
        />
      )}
      </div>
      </ProjecaoProvider>

      {/* ── NÍVEL 3 · TENDÊNCIA ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <PanelHeader title="Qual a evolução" sub="TPV e faturamento nos períodos com lançamento." />
        <Panel>
          {temHistorico
            ? <ConselhoEvolucao dados={evolucao} />
            : <EmptyState title="Sem série histórica"
                description="A evolução aparece assim que houver ao menos dois meses com lançamento diário." />}
        </Panel>
      </section>

      {/* ── NÍVEL 4 · COMPOSIÇÃO ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <PanelHeader
          title="Onde está a receita"
          sub={maiorLinha
            ? `${maiorLinha.label} concentra ${((maiorLinha.valor / composicao.total) * 100).toFixed(1)}% da receita do período.`
            : 'Transacional, Setup, Sustentação, Serviços e BaaS somam a receita do período.'}
        />
        {composicao.total === 0 ? (
          <Panel padded={false}>
            <EmptyState title="Sem dados no período" description="Nenhuma linha de receita apurada para este mês." />
          </Panel>
        ) : (
          <>
            {/* Barra de composição: proporção antes do detalhe. */}
            <div className="flex h-2 rounded-full overflow-hidden gap-px bg-line" role="img"
              aria-label="Composição proporcional da receita">
              {/* Só as linhas que SOMAM entram na barra: uma fatia de
                  Mensalidades faria a proporção passar de 100%. */}
              {composicao.linhas.filter((l) => l.soma).map((l, i) => (
                <span key={l.tipo} title={`${l.label}: ${moedaCheia(l.valor)}`}
                  className="transition-opacity duration-[380ms] hover:opacity-80"
                  style={{
                    width: `${Math.max((l.valor / composicao.total) * 100, 0)}%`,
                    background: `color-mix(in srgb, var(--color-accent) ${100 - i * 15}%, transparent)`,
                  }} />
              ))}
            </div>
            <HairlineGrid cols={3}>
              {composicao.linhas.map((l) => (
                <HairlineCell key={l.tipo} className="gap-2.5">
                  <p className="t-label text-subtle">{l.label}</p>
                  <Figure figura={figuraMoeda(l.valor)} size="sm" />
                  <p className="t-mono text-muted">
                    {!l.soma
                      ? 'indicador'
                      : composicao.total > 0
                        ? `${((l.valor / composicao.total) * 100).toFixed(1)}%`
                        : '—'}
                  </p>
                </HairlineCell>
              ))}
            </HairlineGrid>
            <Panel className="flex items-baseline justify-between gap-4 flex-wrap">
              <span className="t-label text-subtle">Receita total do período</span>
              <Figure figura={figuraMoeda(composicao.total)} />
            </Panel>
            {/* MENSALIDADES é INDICADOR, não parcela — e isso é dito em voz
                alta. Elas já estão embutidas na tarifa transacional (é como a
                Bass Pago cobra hoje), e somá-las ao total contaria o mesmo
                dinheiro duas vezes. Omitir a linha seria pior: a pergunta
                "quanto é recorrente" não teria resposta na composição. */}
            {composicao.mensalidadesIndicador > 0 && (
              <p className="t-sm text-subtle">
                <span className="text-fg">Mensalidades de API é indicador</span>, não parcela:{' '}
                <span className="tabular-nums text-fg">
                  {moedaCheia(composicao.mensalidadesIndicador)}
                </span>{' '}
                já estão embutidos na receita transacional, e por isso ficam fora do total.
                O número aparece porque é a base da recorrência.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── NÍVEL 5 · DETALHE DA CARTEIRA ────────────────────────────────── */}
      <section className="space-y-4">
        <PanelHeader
          title="Carteira"
          sub="Clientes ativos do lançamento diário; BaaS e White Labels das condições comerciais."
        />
        <HairlineGrid cols={3}>
          {carteira.map((c) => (
            <HairlineCell key={c.label} className="gap-2.5">
              <p className="t-label text-subtle">{c.label}</p>
              {/* null só acontece em Clientes ativos, quando nenhum dia do mês
                  informou o número. Zero seria uma afirmação falsa. */}
              {c.v === null ? <NoData /> : <Figure figura={figuraContagem(c.v)} size="sm" />}
            </HairlineCell>
          ))}
        </HairlineGrid>
      </section>
    </div>
  )
}
