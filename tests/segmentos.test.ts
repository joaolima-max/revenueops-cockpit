/**
 * SEGMENTOS — o slug e a leitura com retaguarda.
 *
 * O enum `Segmento` continua gravado nas colunas antigas de Cliente, Lead e
 * Deal: um enum não se apaga sem reescrever os dados que o usam. A tabela
 * nasceu semeada com os mesmos valores, e o SLUG é o que casa os dois.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slugDeSegmento, nomeDoSegmento, chaveDoSegmento } from '../lib/segmentos'

test('o slug sai no formato do enum antigo, nao num hash', () => {
  // E o que torna o slug legivel ao lado dos semeados.
  assert.equal(slugDeSegmento('Cripto Exchanges'), 'CRIPTO_EXCHANGES')
  assert.equal(slugDeSegmento('Remessa / FX'), 'REMESSA_FX')
  assert.equal(slugDeSegmento('iGaming'), 'IGAMING')
})

test('acento e pontuacao nao entram no slug', () => {
  assert.equal(slugDeSegmento('Sustentação & Serviços'), 'SUSTENTACAO_SERVICOS')
  assert.equal(slugDeSegmento('E-commerce'), 'E_COMMERCE')
})

test('nome vazio nao produz slug vazio', () => {
  // Slug vazio colidiria com o proximo nome vazio no indice unico.
  assert.equal(slugDeSegmento('   '), 'SEGMENTO')
  assert.equal(slugDeSegmento('!!!'), 'SEGMENTO')
})

test('o slug nao passa de 60 caracteres', () => {
  assert.ok(slugDeSegmento('a'.repeat(200)).length <= 60)
})

test('o VINCULO vence o enum antigo', () => {
  const nome = nomeDoSegmento(
    { id: 's1', nome: 'Cripto Exchanges', slug: 'CRYPTO_EXCHANGES' },
    'CRYPTO_EXCHANGES',
    { CRYPTO_EXCHANGES: 'Rotulo antigo' },
  )
  assert.equal(nome, 'Cripto Exchanges')
})

test('sem vinculo, vale o enum antigo com o rotulo legado', () => {
  // E a retaguarda dos registros anteriores a esta rodada.
  assert.equal(
    nomeDoSegmento(null, 'CRYPTO_EXCHANGES', { CRYPTO_EXCHANGES: 'Cripto Exchanges' }),
    'Cripto Exchanges',
  )
})

test('enum sem rotulo conhecido aparece como o proprio valor', () => {
  assert.equal(nomeDoSegmento(null, 'ALGO_NOVO', {}), 'ALGO_NOVO')
})

test('AUSENCIA de segmento devolve NULL — nunca "Outros"', () => {
  // Substituir a ausencia por um valor faria o registro parecer classificado.
  assert.equal(nomeDoSegmento(null, null), null)
  assert.equal(nomeDoSegmento(undefined, undefined), null)
})

test('a chave de agrupamento e o id quando ha vinculo, o slug legado quando nao', () => {
  assert.equal(
    chaveDoSegmento({ id: 's1', nome: 'X', slug: 'X' }, 'OUTROS'), 's1',
  )
  assert.equal(chaveDoSegmento(null, 'OUTROS'), 'OUTROS')
  assert.equal(chaveDoSegmento(null, null), null)
})
