/**
 * SEGMENTOS — o slug e a leitura com retaguarda.
 *
 * O enum `Segmento` continua gravado nas colunas antigas de Cliente, Lead e
 * Deal. A tabela `SegmentoComercial` nasceu semeada com os mesmos valores, e
 * o SLUG é o que casa os dois: nos segmentos semeados, o slug é o próprio
 * valor do enum (`CRYPTO_EXCHANGES`).
 *
 * Por isso a leitura tem retaguarda: quando `segmentoComercialId` está nulo —
 * registro anterior à rodada, ou vínculo que não casou —, vale a coluna enum.
 */

/**
 * Slug de um nome de segmento.
 *
 * Maiúsculas com `_`, no mesmo formato dos valores do enum: um segmento novo
 * chamado "Cripto Exchanges" produz `CRIPTO_EXCHANGES`, legível ao lado dos
 * semeados em vez de um hash.
 */
export function slugDeSegmento(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    || 'SEGMENTO'
}

export interface SegmentoRef {
  id: string
  nome: string
  slug: string
}

/**
 * O nome do segmento de um registro, com retaguarda no enum.
 *
 * Devolve null quando não há segmento nenhum — nunca "Outros" nem um texto
 * inventado: ausência de segmento é informação, e substituí-la por um valor
 * faria o registro parecer classificado.
 */
export function nomeDoSegmento(
  vinculo: SegmentoRef | null | undefined,
  enumAntigo: string | null | undefined,
  rotulosLegados: Record<string, string> = {},
): string | null {
  if (vinculo) return vinculo.nome
  if (enumAntigo) return rotulosLegados[enumAntigo] ?? enumAntigo
  return null
}

/** A chave de agrupamento: id quando há vínculo, slug legado quando não há. */
export function chaveDoSegmento(
  vinculo: SegmentoRef | null | undefined,
  enumAntigo: string | null | undefined,
): string | null {
  return vinculo?.id ?? enumAntigo ?? null
}
