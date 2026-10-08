import Link from 'next/link'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import { NoData } from '@/components/ui/EmptyState'
import { moedaCheia } from '@/lib/format-financeiro'
import { formatMesRef } from '@/lib/utils'
import { META_TIPO_LABEL } from '@/lib/metas'
import type { ReceitaPrevistaComposta } from '@/lib/previsao-calculo'

/**
 * A ORIGEM DA RECEITA PREVISTA — a navegação de auditoria.
 *
 * ── A PERGUNTA QUE ESTA TELA RESPONDE ───────────────────────────────────
 *
 * "De onde saiu este número?". A receita prevista do período não é digitada:
 * é a soma de seis parcelas, cada uma com uma fonte diferente. Sem este
 * bloco, o executivo lê "R$ 1,2 mi previstos" e não tem como conferir — e um
 * número de planejamento que ninguém consegue conferir não é usado para
 * decidir nada.
 *
 * ── POR QUE AQUI, E NÃO EM SEIS PÁGINAS ─────────────────────────────────
 *
 * Cada parcela mostra o VALOR, a FRASE de origem, a composição interna quando
 * há, e um LINK para a tela onde o número é mantido. É navegação profunda sem
 * criar tela nova: quem quer conferir a sustentação de um parceiro vai para
 * Condições BaaS, que é onde ela se corrige; quem quer mudar a meta de setup
 * vai para Metas.
 *
 * Seis páginas de detalhe dariam a mesma informação espalhada por seis
 * carregamentos, e a conta — que é a razão do bloco existir — não apareceria
 * em nenhuma delas.
 *
 * ── AUSENTE NÃO É ZERO ──────────────────────────────────────────────────
 *
 * Uma parcela sem fonte cadastrada aparece como <NoData />, não como
 * R$ 0,00. "Não há meta de setup para novembro" e "a meta de setup de
 * novembro é zero" são afirmações diferentes, e só a segunda é uma decisão.
 * Mostrar as duas como R$ 0,00 esconderia o que falta cadastrar — que é
 * justamente o que esta tela deveria apontar.
 */
export default function ComposicaoReceita({
  composta, titulo = 'Como a receita prevista é formada',
}: {
  composta: ReceitaPrevistaComposta
  titulo?: string
}) {
  return (
    <section className="space-y-4">
      <PanelHeader
        title={titulo}
        sub={
          `${formatMesRef(composta.periodo)} · MRR projetado mais as quatro metas de `
          + 'receita e as previsões lançadas. Cada parcela mostra de onde sai e onde '
          + 'é mantida.'
        }
      />

      <Panel padded={false}>
        <ul className="divide-y divide-line">
          {composta.componentes.map((c) => (
            <li key={c.chave} className="p-5 sm:p-6 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <p className="t-body font-medium text-fg flex items-center gap-2 flex-wrap">
                    {c.label}
                    {c.ausente && <Badge>Sem fonte no período</Badge>}
                  </p>
                  <p className="t-sm text-muted">{c.origem}</p>
                </div>
                <p className="t-num text-fg whitespace-nowrap">
                  {c.ausente ? <NoData /> : moedaCheia(c.valor)}
                </p>
              </div>

              {/* A COMPOSIÇÃO INTERNA. Só o MRR e as receitas lançadas têm uma
                  — uma meta é um número só, e inventar sublinhas para ela
                  daria a impressão de um detalhamento que não existe. */}
              {c.linhas.length > 0 && (
                <ul className="space-y-1.5 pl-4 border-l border-line">
                  {c.linhas.map((l, i) => (
                    <li key={`${c.chave}-${i}`}
                      className="flex items-baseline justify-between gap-4 t-sm">
                      <span className="text-muted min-w-0 truncate">
                        {l.rota
                          ? <Link href={l.rota} className="text-accent-soft hover:underline">
                            {l.label}
                          </Link>
                          : l.label}
                      </span>
                      <span className="t-num text-subtle whitespace-nowrap">
                        {moedaCheia(l.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {c.rota && (
                <p className="t-label text-subtle/70">
                  <Link href={c.rota} className="text-accent-soft hover:underline">
                    Conferir na origem
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>

        <div className="p-5 sm:p-6 border-t border-line-2 flex items-baseline justify-between gap-4">
          <p className="t-body font-medium text-fg">Receita prevista do período</p>
          <p className="t-num text-fg">{moedaCheia(composta.total)}</p>
        </div>
      </Panel>

      {/* METAS EM PERCENTUAL IGNORADAS — declaradas, nunca somadas. Um
          percentual não tem o que somar em reais, e omitir o aviso faria o
          total parecer errado a quem acabou de cadastrar a meta. */}
      {composta.ignoradasPorUnidade.length > 0 && (
        <Panel>
          <p className="t-sm text-subtle">
            Fora da soma por estar cadastrada em <span className="text-fg">percentual</span>:{' '}
            {composta.ignoradasPorUnidade
              .map((t) => META_TIPO_LABEL[t] ?? t)
              .join(', ')}
            . Uma meta percentual não tem o que somar em reais — para entrar na
            receita prevista, ela precisa ser cadastrada com unidade{' '}
            <span className="text-fg">valor</span>.
          </p>
        </Panel>
      )}
    </section>
  )
}
