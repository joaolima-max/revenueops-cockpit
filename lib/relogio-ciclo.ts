/**
 * O RELÓGIO COMPARTILHADO — um laço de animação para a aplicação inteira.
 *
 * ── O DEFEITO QUE ESTA VERSÃO CORRIGE ───────────────────────────────────
 *
 * O instantâneo era o SEGUNDO corrente (`Math.floor(ms / 1000)`). Ele só
 * mudava uma vez por segundo, então o número exibido avançava de um salto o
 * crescimento de um segundo inteiro:
 *
 *   transações   +7 por salto     1 → 8 → 15 …
 *   TPV          +R$ 3.001,55     120 → 3.121 → 6.123 …
 *
 * Em produção, na faixa de pico, era exatamente o "de 1 para 6" e o "de 120
 * para 150" relatados. Não é um defeito de cálculo: a curva sempre esteve
 * certa — o que estava grosso era a AMOSTRAGEM dela.
 *
 * ── A CORREÇÃO É AMOSTRAR MAIS FINO, NÃO INTERPOLAR ─────────────────────
 *
 * O instantâneo passou a ser o INSTANTE corrente, em milissegundos, atualizado
 * a cada quadro de animação. Nada é interpolado, estimado ou suavizado: cada
 * quadro recalcula `valorExibido` do relógio, pela mesma função pura, e
 * portanto cada quadro mostra o valor CORRETO para aquele instante.
 *
 * É o que o pedido exige — "não pode mudar o resultado matemático nem fazer a
 * tela divergir do instante atual" — e é mais simples que interpolar: não há
 * estado de animação, não há fila de valores pendentes, não há como atrasar.
 *
 * ── E POR QUE ISSO JÁ RESOLVE "SEM SALTAR INTEIROS" ─────────────────────
 *
 * `projetarContagem` é `floor` de uma curva contínua e crescente. Se entre
 * duas amostras o valor subjacente cresce MENOS de 1, o `floor` só pode
 * repetir ou avançar exatamente 1 — nunca dois. Então a garantia é aritmética,
 * não visual:
 *
 *   passo < 1  ⟹  nenhum inteiro é pulado
 *
 * A 60 quadros por segundo, com o lançamento real de 07/10 (265.483
 * transações), o passo no pico é de 0,12 — oito quadros por inteiro, e a
 * contagem sai 1, 2, 3, 4, 5, 6. Ver `intervaloMaximoSemSalto` para o limite
 * exato e `tests/projecao-animacao.test.ts` para a prova.
 *
 * O LIMITE EXISTE E ESTÁ DECLARADO: a 60 Hz o passo só alcança 1 inteiro com
 * um lançamento de ~2,22 milhões de transações no dia — 8,4× o de hoje. Acima
 * disso um quadro avança dois, e isso NÃO é um limite desta implementação: uma
 * tela que pinta 60 vezes por segundo não tem onde mostrar 70 números. A
 * alternativa — um contador que ande um inteiro por quadro, atrás do relógio —
 * é justamente o que o pedido proíbe. Ver `saltoMinimoInevitavel`.
 *
 * ── CENTAVOS NÃO ENTRAM NESSA GARANTIA, E NÃO DEVEM ─────────────────────
 *
 * O TPV cresce R$ 3.001,55 por segundo — 300.155 centavos. Nenhuma taxa de
 * quadros mostra cada centavo, e mostrar não seria desejável: o pedido é que
 * "os dígitos avancem suavemente", e é isso que 60 quadros por segundo
 * produzem. A garantia de inteiro-a-inteiro é das CONTAGENS, que é onde o
 * pedido a coloca.
 *
 * ── POR QUE `requestAnimationFrame` E NÃO UM `setInterval` CURTO ────────
 *
 * Porque é a cadência que o navegador já usa para pintar, então não há
 * trabalho fora de quadro, e porque ele PARA sozinho quando a aba fica
 * oculta — um `setInterval(16)` continuaria acordando a aba de fundo 60 vezes
 * por segundo para recalcular algo que ninguém está vendo.
 *
 * Ao voltar para a aba, o primeiro quadro recalcula do relógio e o número
 * aparece certo de imediato. Não há animação atrasada a "tocar": não existe
 * estado a recuperar.
 *
 * No servidor e nos testes (Node) não há `requestAnimationFrame`; o laço cai
 * para `setInterval(INTERVALO_FALLBACK_MS)`, que é o mesmo contrato.
 *
 * ── O CONTRATO ──────────────────────────────────────────────────────────
 *
 * É o de `useSyncExternalStore`: `assinar` devolve o cancelamento, e
 * `instanteCorrente` é um instantâneo ESTÁVEL — o mesmo número para qualquer
 * chamada entre dois quadros. Estável importa: um instantâneo novo a cada
 * leitura seria lido pelo React como "mudou" e renderizaria sem parar.
 *
 * ── UM LAÇO, CRIADO NO PRIMEIRO E APAGADO NO ÚLTIMO ─────────────────────
 *
 * A Home tem cinco números projetados e o Conselho, cinco. Navegar entre as
 * duas monta e desmonta provedores; o laço é criado quando aparece o primeiro
 * assinante e destruído quando sai o último. Sem isso, cada tela visitada
 * deixaria um laço vivo.
 */

/**
 * O passo do relógio quando não há `requestAnimationFrame` — servidor e
 * testes. 16 ms é a cadência de 60 quadros por segundo, para que o
 * comportamento testado seja o mesmo do navegador.
 */
export const INTERVALO_FALLBACK_MS = 16

let desvioMs = 0
let desvioMedido = false
const ouvintes = new Set<() => void>()

/** O instante corrente, já corrigido. `null` = ainda não amostrado. */
let carimbo: number | null = null

let quadro: number | null = null
let timer: ReturnType<typeof setInterval> | null = null

const temRaf = () =>
  typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function'

/**
 * Mede, UMA VEZ, a diferença entre o relógio do servidor e o do navegador.
 *
 * ── POR QUE UMA VEZ, E POR QUE FORA DA RENDERIZAÇÃO ───────────────────
 *
 * Uma vez porque remedir a cada quadro faria o desvio variar com a latência de
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
  // O carimbo guardado é de antes da correção: refazê-lo evita um primeiro
  // quadro com o relógio local cru.
  carimbo = Date.now() + desvioMs
}

/** O desvio vigente, em milissegundos. Exportado para os testes. */
export function desvioAtual(): number {
  return desvioMs
}

/** Quantos assinantes há agora. Exportado para os testes. */
export function assinantes(): number {
  return ouvintes.size
}

/** O laço está armado? Exportado para os testes. */
export function temTimer(): boolean {
  return quadro !== null || timer !== null
}

/**
 * Esquece o desvio e desarma tudo.
 *
 * Existe para os testes poderem partir de um estado limpo. Em produção nada
 * chama isto: o módulo vive enquanto a aba vive.
 */
export function reiniciarRelogio(): void {
  if (quadro !== null && temRaf()) cancelAnimationFrame(quadro)
  if (timer !== null) clearInterval(timer)
  quadro = null
  timer = null
  ouvintes.clear()
  desvioMs = 0
  desvioMedido = false
  carimbo = null
}

function avisarTodos(): void {
  carimbo = Date.now() + desvioMs
  for (const o of ouvintes) o()
}

function armar(): void {
  if (temTimer()) return
  if (temRaf()) {
    const passo = () => {
      avisarTodos()
      // Reagenda SEMPRE a partir do callback: é o que faz o laço seguir a
      // cadência de pintura do navegador e PARAR quando a aba fica oculta.
      quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
  } else {
    timer = setInterval(avisarTodos, INTERVALO_FALLBACK_MS)
  }
}

function desarmar(): void {
  if (quadro !== null && temRaf()) cancelAnimationFrame(quadro)
  if (timer !== null) clearInterval(timer)
  quadro = null
  timer = null
}

export function assinar(aviso: () => void): () => void {
  ouvintes.add(aviso)
  armar()
  return () => {
    ouvintes.delete(aviso)
    // O ÚLTIMO A SAIR APAGA A LUZ. Um laço sobrevivente por tela visitada é o
    // vazamento clássico deste tipo de componente.
    if (ouvintes.size === 0) desarmar()
  }
}

/**
 * O INSTANTE corrente em milissegundos, já corrigido pelo desvio.
 *
 * Instantâneo ESTÁVEL: entre dois quadros devolve sempre o mesmo número. A
 * primeira chamada — que o React faz antes de assinar — amostra o relógio e
 * guarda; dali em diante quem atualiza é o laço.
 */
export function instanteCorrente(): number {
  if (carimbo === null) carimbo = Date.now() + desvioMs
  return carimbo
}

/**
 * No servidor não há relógio do cliente: a fração vem do instante enviado.
 *
 * Devolver `null` é o que faz a primeira renderização usar o instante do
 * SERVIDOR, que é o que está no HTML. Começar pelo relógio local acusaria
 * divergência de hidratação — e o número daria um pulo visível ao hidratar.
 */
export function semCliente(): null {
  return null
}
