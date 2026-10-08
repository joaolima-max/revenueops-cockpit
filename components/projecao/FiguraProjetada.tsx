'use client'

import Figure from '@/components/ui/Figure'
import { figuraMoeda, figuraQuantidade } from '@/lib/format-financeiro'
import { valorExibido } from '@/lib/projecao-intradiaria'
import { useFracaoCiclo } from './ProjecaoProvider'

/**
 * UM NÚMERO QUE CRESCE — a única peça visual da projeção.
 *
 * ── A MESMA TIPOGRAFIA DE SEMPRE ────────────────────────────────────────
 *
 * Renderiza o `Figure` do produto, com a mesma hierarquia (valor, unidade,
 * prefixo, valor cheio no `title`). Nada de cor nova, nada de badge, nada de
 * "ao vivo". O efeito é o número andando — e é só isso que deveria chamar
 * atenção.
 *
 * ── A SUAVIDADE VEM DA GRANDEZA, NÃO DE UMA ANIMAÇÃO ────────────────────
 *
 * Com o TPV de um dia típico (R$ 113 mi), a taxa base é de ~R$ 1.433 por
 * segundo: os centavos e os milhares andam em todo tick. Transações andam
 * ~3,35 por segundo. Não há tween, não há interpolação de quadro — o valor
 * exibido é sempre o valor correto para aquele segundo, e é por isso que ele
 * bate com o de outro dispositivo.
 *
 * MEDs crescem ~0,04 por segundo e portanto mudam a cada ~24 segundos; na
 * madrugada, a cada ~80. É a taxa real do indicador naquela faixa; acelerá-la
 * para "parecer vivo" seria inventar movimento.
 *
 * ── `tabular-nums` JÁ ESTÁ NO `Figure` ──────────────────────────────────
 *
 * Fonte de largura fixa por dígito. Sem isso o número tremeria na horizontal
 * a cada mudança de algarismo, que é o defeito clássico de contador animado.
 */
export default function FiguraProjetada({
  real, incremento, pendente = 0, grandeza, size = 'md', tone = 'default',
}: {
  /** O valor REAL acumulado, como o banco o reporta. */
  real: number
  /** A fatia dele que entrou neste ciclo e deve crescer. */
  incremento: number
  /**
   * A fatia já REGISTRADA cujo ciclo ainda não abriu.
   *
   * Sai do exibido inteira, sem animar — é o que impede o número de cair na
   * virada das 10h. Ver o termo `pendente` de `valorExibido`.
   */
  pendente?: number
  grandeza: 'moeda' | 'contagem'
  size?: 'hero' | 'md' | 'sm'
  tone?: 'default' | 'accent'
}) {
  const { fracao } = useFracaoCiclo()
  const v = valorExibido(real, incremento, fracao, grandeza, pendente)
  const figura = grandeza === 'moeda' ? figuraMoeda(v) : figuraQuantidade(v)

  return <Figure figura={figura} size={size} tone={tone} />
}
