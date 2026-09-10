/** Validacao de arquivo e montagem da chave no bucket privado. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validarArquivo, nomeSeguro, chaveDocumento, extensaoDe,
  EXTENSOES_ACEITAS, TAMANHO_MAX,
} from '../lib/arquivos'

test('os 11 formatos combinados sao aceitos', () => {
  for (const ext of ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'zip']) {
    assert.ok(EXTENSOES_ACEITAS.includes(ext), `${ext} deveria ser aceito`)
  }
})

test('extensao desconhecida e recusada', () => {
  assert.match(validarArquivo('malicioso.exe', 'application/octet-stream', 100)!, /não é aceita/)
  assert.match(validarArquivo('sem-extensao', 'text/plain', 100)!, /precisa ter extensão/)
})

test('MIME precisa bater com a extensao — extensao sozinha se falsifica', () => {
  assert.match(validarArquivo('contrato.pdf', 'application/x-msdownload', 100)!, /não corresponde/)
  assert.equal(validarArquivo('contrato.pdf', 'application/pdf', 100), null)
})

test('tamanho: vazio e acima do limite sao recusados', () => {
  assert.match(validarArquivo('a.pdf', 'application/pdf', 0)!, /vazio/)
  assert.match(validarArquivo('a.pdf', 'application/pdf', TAMANHO_MAX + 1)!, /maior que o limite/)
  assert.equal(validarArquivo('a.pdf', 'application/pdf', TAMANHO_MAX), null)
})

test('extensao e lida em minusculas', () => {
  assert.equal(extensaoDe('CONTRATO.PDF'), 'pdf')
  assert.equal(validarArquivo('CONTRATO.PDF', 'application/pdf', 10), null)
})

test('nome do arquivo nao escapa do prefixo do cliente', () => {
  assert.ok(!nomeSeguro('../../etc/passwd').includes('/'))
  assert.ok(!nomeSeguro('..\\windows\\system32').includes('\\'))
  assert.equal(nomeSeguro('Relatório Final (2026).pdf'), 'Relatorio_Final_2026_.pdf')
  assert.ok(!nomeSeguro('../fuga.pdf').startsWith('.'), 'pontos iniciais sao cortados')
  assert.equal(nomeSeguro('...'), 'arquivo', 'nome que some vira um nome utilizavel')
})

test('a chave sempre fica sob o prefixo do cliente', () => {
  const chave = chaveDocumento('cli-1', 'doc-9', '../fuga.pdf')
  assert.ok(chave.startsWith('clientes/cli-1/doc-9/'))
  assert.ok(!chave.includes('..'))
})
