'use client'

import {
  createContext, useCallback, useContext, useMemo, useSyncExternalStore,
} from 'react'
import { fracaoDoCiclo, type Ciclo } from '@/lib/projecao-intradiaria'
import {
  assinar, medirDesvio, segundoCorrente, semCliente,
} from '@/lib/relogio-ciclo'

/**
 * O RELÓGIO DA PROJEÇÃO — um timer para a aplicação inteira.
 *
 * ── POR QUE UM PROVEDOR, E NÃO UM TIMER POR NÚMERO ──────────────────────
 *
 * A Home tem cinco números projetados e o Conselho, cinco. Um `setInterval`
 * por número seriam dez timers acordando em instantes ligeiramente diferentes
 * — dez re-renderizações por segundo, e números do mesmo painel atualizando
 * fora de passo.
 *
 * Aqui há UM intervalo, em escopo de módulo, compartilhado por todos os
 * provedores montados. Ele é criado no primeiro assinante e DESTRUÍDO no
 * último a sair: sem isso, navegar entre Home e Conselho deixaria um timer
 * vivo por tela visitada.
 *
 * O intervalo em si vive em `lib/relogio-ciclo.ts`, fora do React: é a parte
 * arriscada — vazamento de timer, instantâneo instável, desvio remedido — e
 * fora de um componente ela é verificável sem navegador.
 *
 * ── POR QUE `useSyncExternalStore`, E NÃO `useEffect` + `setState` ──────
 *
 * Porque o relógio é, literalmente, um sistema externo. Ler `Date.now()`
 * durante a renderização é impuro, e atualizar estado dentro de um efeito a
 * cada segundo produz renderizações em cascata — as duas coisas que as regras
 * do React proíbem, e por boas razões.
 *
 * O instantâneo da store é o SEGUNDO corrente (um número). Entre dois ticks
 * dentro do mesmo segundo ele é idêntico, então o React não re-renderiza
 * nada; quando muda, só os consumidores da fração se re-renderizam. É o mesmo
 * padrão que `DashboardCharts` já usa para a ordem dos gráficos.
 *
 * `getServerSnapshot` devolve `null`: no servidor e no primeiro quadro do
 * cliente a fração vem do instante do SERVIDOR, que é o que está no HTML.
 * Começar pelo relógio local acusaria divergência de hidratação.
 *
 * ── A FRAÇÃO VEM DO RELÓGIO, NÃO DE UM CONTADOR ─────────────────────────
 *
 * Nada aqui acumula. A cada segundo a fração é RECALCULADA do zero, pela
 * mesma função pura que o servidor usa. É isso que faz o número sobreviver a
 * recarregar a página, trocar de tela, voltar de uma aba suspensa e abrir em
 * outro dispositivo: não existe estado a preservar.
 *
 * ── O DESVIO DE RELÓGIO ─────────────────────────────────────────────────
 *
 * O servidor manda o instante dele junto com o ciclo. A diferença contra o
 * relógio local é medida UMA VEZ, na primeira assinatura, e aplicada em todos
 * os ticks. Um navegador com a hora errada em três horas calcularia outro
 * ponto da curva, e dois usuários veriam números diferentes para o mesmo
 * segundo — o oposto do pedido.
 *
 * Uma medição só, e nenhuma requisição adicional: o erro de ida e volta da
 * requisição que já aconteceu é de centenas de milissegundos, e a curva anda
 * poucas unidades por segundo. Sincronizar melhor custaria tráfego para
 * corrigir um erro invisível.
 *
 * ── A VIRADA DO CICLO COM A PÁGINA ABERTA ───────────────────────────────
 *
 * Às 10h a fração chega a 1 e PARA ali. O número fica no valor real — que é
 * exatamente onde o ciclo deve terminar. O incremento do ciclo seguinte só
 * aparece na próxima navegação, porque é o servidor que o apura; até lá o
 * painel mostra o acumulado real e não finge que há dado novo.
 */

/* ========================================================================= *
 * O CONTEXTO
 * ========================================================================= */

export interface EstadoProjecao {
  /** 0..1. Quanto do incremento do ciclo já deve estar visível. */
  fracao: number
  /** O ciclo já terminou e a página não recarregou desde então? */
  encerrado: boolean
}

const Ctx = createContext<EstadoProjecao>({ fracao: 1, encerrado: false })

/**
 * A fração vigente do ciclo.
 *
 * Fora de um provedor devolve 1 — o valor REAL, inteiro. É o padrão certo:
 * um número que não está sob projeção deve aparecer como o banco o reporta.
 */
export function useFracaoCiclo(): EstadoProjecao {
  return useContext(Ctx)
}

export default function ProjecaoProvider({
  inicio, fim, agoraServidor, ativo, children,
}: {
  /** Início do ciclo (10h do fuso operacional), em ISO. Vem do servidor. */
  inicio: string
  /** Fim EXCLUSIVO do ciclo (10h do dia seguinte), em ISO. */
  fim: string
  /** O relógio do servidor no instante da resposta, em ISO. */
  agoraServidor: string
  /**
   * Há incremento a projetar neste ciclo?
   *
   * `false` quando nenhum lançamento entrou no ciclo. Aí a fração é 1, o
   * número mostra o acumulado real e o timer NÃO é assinado — um intervalo
   * rodando para multiplicar zero é só consumo de bateria.
   */
  ativo: boolean
  children: React.ReactNode
}) {
  const ciclo: Ciclo = useMemo(
    () => ({ inicio: new Date(inicio), fim: new Date(fim) }),
    [inicio, fim],
  )

  const assinatura = useCallback((aviso: () => void) => {
    if (!ativo) return () => {}
    medirDesvio(agoraServidor)
    return assinar(aviso)
  }, [ativo, agoraServidor])

  const segundo = useSyncExternalStore(assinatura, segundoCorrente, semCliente)

  const valor = useMemo<EstadoProjecao>(() => {
    const agora = segundo === null ? new Date(agoraServidor) : new Date(segundo * 1000)
    return {
      fracao: ativo ? fracaoDoCiclo(agora, ciclo) : 1,
      encerrado: agora.getTime() >= ciclo.fim.getTime(),
    }
  }, [segundo, agoraServidor, ativo, ciclo])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
