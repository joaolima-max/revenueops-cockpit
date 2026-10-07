'use client'

import { cn } from '@/lib/utils'
import {
  slaDoCard, diasTexto, ESTADO_SLA_LABEL, type EstadoSla,
} from '@/lib/sla'

/**
 * O INDICADOR DE SLA no card do Pipeline.
 *
 * ── DISCRETO DE PROPÓSITO ───────────────────────────────────────────────
 *
 * Uma linha de texto com um ponto de status, no pé do card. Não é um badge
 * colorido, não é uma barra de progresso e não pinta o card inteiro.
 *
 * O pedido é explícito — "sem quebrar o layout", "não usar cores excessivas" —
 * e a razão é estrutural: o card já carrega resultado, segmento e responsável.
 * Um quarto badge colorido brigaria com os três e o card cresceria uma linha,
 * empurrando o conteúdo dos vizinhos na mesma coluna.
 *
 * ── A COR APARECE SÓ QUANDO HÁ O QUE FAZER ──────────────────────────────
 *
 * DENTRO     cinza, como o nome do responsável. Está tudo bem; não precisa
 *            de atenção, e colorir de verde treinaria o olho a ignorar cor.
 * PROXIMO    âmbar. Ainda dá para agir — é o único momento em que o aviso
 *            muda algo.
 * VENCIDO    vermelho. Já passou.
 * SEM_SLA    não desenha nada. Uma etapa sem prazo não tem o que informar, e
 *            escrever "sem SLA" em todo card de um funil não configurado
 *            viraria ruído em cada linha do quadro.
 *
 * É a mesma regra do `Badge` do produto: cor comunica STATUS, nunca categoria.
 *
 * ── POR QUE O CÁLCULO ACONTECE AQUI, NO CLIENTE ─────────────────────────
 *
 * Porque ele depende de AGORA. Um card com 4,9 dias num SLA de 5 vira
 * "vencido" sozinho, sem nenhuma ação do usuário — e um estado calculado no
 * servidor ficaria congelado no instante da requisição, mostrando "dentro do
 * SLA" numa aba aberta desde ontem.
 *
 * O servidor manda os dois FATOS (quando entrou, qual o prazo); a leitura é
 * derivada deles por `slaDoCard`, que é pura e é a mesma função que o alerta
 * do cron usa. Uma segunda implementação aqui faria o card e a notificação
 * discordarem sobre o mesmo prazo.
 */

const TOM: Record<EstadoSla, string> = {
  DENTRO: 'text-subtle',
  PROXIMO: 'text-warn',
  VENCIDO: 'text-neg',
  SEM_SLA: 'text-subtle',
}

const PONTO: Record<EstadoSla, string> = {
  DENTRO: 'bg-subtle',
  PROXIMO: 'bg-warn',
  VENCIDO: 'bg-neg',
  SEM_SLA: 'bg-subtle',
}

export default function SlaIndicador({
  entradaEm, slaDias, className,
}: {
  entradaEm: string | null
  slaDias: number | null
  className?: string
}) {
  const sla = slaDoCard(entradaEm, slaDias)

  // SEM SLA não desenha nada: escrever "sem SLA" em todo card de um funil não
  // configurado viraria ruído em cada linha do quadro.
  if (sla.estado === 'SEM_SLA') return null

  const texto = sla.estado === 'VENCIDO'
    ? `${diasTexto(sla.atrasoDias ?? 0)} de atraso`
    : sla.estado === 'PROXIMO'
      ? `vence em ${diasTexto(Math.max(0, sla.diasRestantes ?? 0))}`
      : `${diasTexto(sla.diasNaEtapa)} de ${diasTexto(sla.slaDias ?? 0)}`

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 t-label', TOM[sla.estado], className)}
      // O TÍTULO TRAZ A CONTA INTEIRA, porque a linha é curta de propósito.
      // Quem precisa do detalhe passa o mouse; quem só precisa do estado lê a
      // cor e o texto.
      title={
        `${ESTADO_SLA_LABEL[sla.estado]} · SLA ${diasTexto(sla.slaDias ?? 0)}`
        + ` · ${diasTexto(sla.diasNaEtapa)} nesta etapa`
        + (sla.estado === 'VENCIDO' ? ` · atraso de ${diasTexto(sla.atrasoDias ?? 0)}` : '')
      }
    >
      {/* O losango de 5px — o mesmo ponto de status do `Badge` e do rodapé do
          site. Não é um ícone novo: é o recurso que o produto já usa. */}
      <span aria-hidden
        className={cn('w-[5px] h-[5px] rotate-45 rounded-[1px] flex-none', PONTO[sla.estado])} />
      <span className="truncate">{texto}</span>
    </span>
  )
}
