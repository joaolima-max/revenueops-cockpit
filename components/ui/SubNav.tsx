'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * NAVEGAÇÃO PROFUNDA — o componente único de sub-rotas de um módulo.
 *
 * ── POR QUE UM COMPONENTE, E NÃO UM POR MÓDULO ──────────────────────────
 *
 * Quatro módulos do produto passaram a ter áreas internas: Previsão,
 * CP / CR, Condições BaaS e Clientes. A navegação deles é a MESMA coisa —
 * uma fileira de links, um marcado como atual —, e quatro cópias do mesmo
 * markup é como quatro telas passam a ter quatro aparências e quatro regras
 * diferentes de "qual aba está ativa".
 *
 * Então a aparência e a regra de atividade moram aqui. Cada módulo declara
 * apenas a sua RAIZ e as suas ÁREAS.
 *
 * ── A REGRA DE "ATIVA" ──────────────────────────────────────────────────
 *
 * A primeira área mora na RAIZ do módulo (`href: ''`), então ela casa
 * EXATAMENTE. Sem isso ela ficaria marcada como atual em todas as
 * sub-rotas, porque todas começam com o seu caminho.
 *
 * As demais casam por PREFIXO, de propósito: uma área com detalhe próprio
 * (`/clientes/abc`) deve manter a sua aba acesa.
 *
 * ── ÁREAS OCULTAS POR ALÇADA ────────────────────────────────────────────
 *
 * `visivel: false` tira a área da fileira. É assim que Certificados
 * desaparece para quem não tem `view_certificates`: o link não existe, em
 * vez de existir e levar a um redirect. A página continua conferindo a
 * chave — esconder o link não é autorizar nada.
 */

export interface AreaSubNav {
  /** Sufixo da rota. String vazia = a raiz do módulo. */
  href: string
  label: string
  /** Ausente = visível. `false` esconde o link sem mexer na página. */
  visivel?: boolean
}

export default function SubNav({
  raiz, areas, rotulo,
}: {
  raiz: string
  areas: readonly AreaSubNav[]
  /** O que a fileira navega, para o leitor de tela. */
  rotulo: string
}) {
  const pathname = usePathname()
  const visiveis = areas.filter((a) => a.visivel !== false)

  // Uma área só não é navegação: é um título repetido. Nesse caso a fileira
  // não é desenhada — acontece de verdade quando a alçada esconde as demais.
  if (visiveis.length <= 1) return null

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label={rotulo}>
      {visiveis.map((a) => {
        const rota = `${raiz}${a.href}`
        const ativa = a.href === ''
          ? pathname === rota
          : pathname === rota || pathname.startsWith(rota + '/')
        return (
          <Link
            key={a.href || 'raiz'}
            href={rota}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              'px-3.5 py-2 rounded-lg t-sm font-medium border',
              'transition-colors duration-[180ms] ease-bp',
              ativa
                ? 'border-accent/40 bg-accent/10 text-accent-soft'
                : 'border-line text-muted hover:border-line-2 hover:text-fg',
            )}
          >
            {a.label}
          </Link>
        )
      })}
    </nav>
  )
}
