/**
 * O RELÓGIO COMPARTILHADO — um intervalo para a aplicação inteira.
 *
 * ── POR QUE ISTO NÃO MORA NO COMPONENTE ─────────────────────────────────
 *
 * Porque é a parte arriscada, e risco não testado é risco. Um timer que não é
 * limpo vaza a cada navegação; um que é criado por consumidor multiplica as
 * re-renderizações; um instantâneo que muda a cada chamada faz o React
 * re-renderizar em laço.
 *
 * Em módulo, sem React, as três coisas são verificáveis sem navegador — e é o
 * que `tests/relogio-ciclo.test.ts` faz.
 *
 * ── O CONTRATO ──────────────────────────────────────────────────────────
 *
 * É o de `useSyncExternalStore`: `assinar` devolve o cancelamento, e
 * `segundoCorrente` é um instantâneo ESTÁVEL — o mesmo número para qualquer
 * chamada dentro do mesmo segundo. Estável importa: um instantâneo novo a cada
 * leitura seria lido pelo React como "mudou" e renderizaria sem parar.
 *
 * ── UM INTERVALO, CRIADO NO PRIMEIRO E APAGADO NO ÚLTIMO ────────────────
 *
 * A Home tem cinco números projetados e o Conselho, cinco. Navegar entre as
 * duas monta e desmonta provedores; o intervalo é criado quando aparece o
 * primeiro assinante e destruído quando sai o último. Sem isso, cada tela
 * visitada deixaria um timer vivo.
 */

/** O passo do relógio. Um segundo: a curva anda poucas unidades nesse tempo. */
export const INTERVALO_MS = 1000

let desvioMs = 0
let desvioMedido = false
const ouvintes = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

/**
 * Mede, UMA VEZ, a diferença entre o relógio do servidor e o do navegador.
 *
 * ── POR QUE UMA VEZ, E POR QUE FORA DA RENDERIZAÇÃO ───────────────────
 *
 * Uma vez porque remedir a cada tick faria o desvio variar com a latência de
 * cada medição, e a curva tremeria. Fora da renderização porque `Date.now()` é
 * impuro: lê-lo durante o render dá resultados que mudam a cada re-render, e é
 * exatamente o que as regras do React proíbem.
 *
 * Nenhuma requisição é feita aqui. O instante do servidor já veio no payload
 * da página; o erro de ida e volta é de centenas de milissegundos, e a curva
 * anda poucas unidades por segundo. Sincronizar melhor custaria tráfego para
 * corrigir um erro invisível.
 */
export function medirDesvio(agoraServidor: string): void {
  if (desvioMedido) return
  const t = Date.parse(agoraServidor)
  if (!Number.isFinite(t)) return
  desvioMs = t - Date.now()
  desvioMedido = true
}

/** O desvio vigente, em milissegundos. Exportado para os testes. */
export function desvioAtual(): number {
  return desvioMs
}

/** Quantos assinantes há agora. Exportado para os testes. */
export function assinantes(): number {
  return ouvintes.size
}

/** O intervalo está armado? Exportado para os testes. */
export function temTimer(): boolean {
  return timer !== null
}

/**
 * Esquece o desvio e desarma tudo.
 *
 * Existe para os testes poderem partir de um estado limpo. Em produção nada
 * chama isto: o módulo vive enquanto a aba vive.
 */
export function reiniciarRelogio(): void {
  if (timer) clearInterval(timer)
  timer = null
  ouvintes.clear()
  desvioMs = 0
  desvioMedido = false
}

export function assinar(aviso: () => void): () => void {
  ouvintes.add(aviso)
  if (!timer) {
    timer = setInterval(() => {
      for (const o of ouvintes) o()
    }, INTERVALO_MS)
    // Sem `unref` de propósito: no navegador não existe, e no servidor este
    // caminho não é percorrido (ver `semCliente`).
  }
  return () => {
    ouvintes.delete(aviso)
    // O ÚLTIMO A SAIR APAGA A LUZ.
    if (ouvintes.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** O segundo corrente, já corrigido pelo desvio. Instantâneo ESTÁVEL. */
export function segundoCorrente(): number {
  return Math.floor((Date.now() + desvioMs) / 1000)
}

/**
 * O instantâneo do SERVIDOR: `null`.
 *
 * No servidor e no primeiro quadro do cliente a fração vem do instante que o
 * servidor já colocou no HTML. Começar pelo relógio local acusaria divergência
 * de hidratação — e o número daria um pulo visível ao hidratar.
 */
export function semCliente(): null {
  return null
}
