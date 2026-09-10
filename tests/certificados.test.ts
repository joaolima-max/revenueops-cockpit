/** Estoque de 50, numeracao 1-50 por versao, envio unico e lote de 10. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CERTIFICADOS_POR_VERSAO, numerosDaVersao, quantidadeDoTipo, parseIntervalo,
  validarEnvio, proximoIntervalo, rotuloIntervalo,
} from '../lib/certificados'
import { cifrar, decifrar, gerarSenha } from '../lib/crypto-certificado'

process.env.CERTIFICADO_ENCRYPTION_KEY ??= 'a'.repeat(64)

const TODOS = numerosDaVersao()

test('uma versao tem exatamente 50 certificados, numerados de 1 a 50', () => {
  assert.equal(CERTIFICADOS_POR_VERSAO, 50)
  assert.equal(TODOS.length, 50)
  assert.equal(TODOS[0], 1)
  assert.equal(TODOS[49], 50)
})

test('unico vale 1 certificado, lote vale 10', () => {
  assert.equal(quantidadeDoTipo('UNICO'), 1)
  assert.equal(quantidadeDoTipo('LOTE'), 10)
})

test('parseIntervalo entende "1 - 10", "1-10", "1 a 10" e "11"', () => {
  assert.deepEqual(parseIntervalo('1 - 10'), { inicial: 1, final: 10 })
  assert.deepEqual(parseIntervalo('1-10'), { inicial: 1, final: 10 })
  assert.deepEqual(parseIntervalo('1 a 10'), { inicial: 1, final: 10 })
  assert.deepEqual(parseIntervalo('11'), { inicial: 11, final: 11 })
  assert.equal(parseIntervalo('10 - 1'), null, 'intervalo invertido nao passa')
  assert.equal(parseIntervalo('abc'), null)
})

test('envio unico aceita 1 numero e recusa intervalo', () => {
  assert.equal(validarEnvio({ tipo: 'UNICO', inicial: 11, final: 11, disponiveis: TODOS }), null)
  assert.match(validarEnvio({ tipo: 'UNICO', inicial: 1, final: 10, disponiveis: TODOS })!, /exatamente 1/)
})

test('lote aceita exatamente 10 e recusa 9 ou 11', () => {
  assert.equal(validarEnvio({ tipo: 'LOTE', inicial: 1, final: 10, disponiveis: TODOS }), null)
  assert.match(validarEnvio({ tipo: 'LOTE', inicial: 1, final: 9, disponiveis: TODOS })!, /exatamente 10/)
  assert.match(validarEnvio({ tipo: 'LOTE', inicial: 1, final: 11, disponiveis: TODOS })!, /exatamente 10/)
})

test('numeracao e relativa a versao: nada passa de 50', () => {
  assert.match(
    validarEnvio({ tipo: 'LOTE', inicial: 45, final: 54, disponiveis: TODOS })!,
    /entre 1 e 50/,
  )
  assert.match(
    validarEnvio({ tipo: 'UNICO', inicial: 0, final: 0, disponiveis: TODOS })!,
    /entre 1 e 50/,
  )
})

test('certificado ja enviado nao pode sair de novo', () => {
  const semOs5Primeiros = TODOS.filter((n) => n > 5)
  assert.match(
    validarEnvio({ tipo: 'UNICO', inicial: 3, final: 3, disponiveis: semOs5Primeiros })!,
    /certificado 3 desta versão já foi enviado/,
  )
  assert.match(
    validarEnvio({ tipo: 'LOTE', inicial: 1, final: 10, disponiveis: semOs5Primeiros })!,
    /1, 2, 3, 4, 5/,
  )
})

test('proximoIntervalo acha a primeira faixa contigua livre', () => {
  assert.deepEqual(proximoIntervalo(TODOS, 'LOTE'), { inicial: 1, final: 10 })
  assert.deepEqual(proximoIntervalo(TODOS.filter((n) => n > 10), 'LOTE'), { inicial: 11, final: 20 })
  assert.deepEqual(proximoIntervalo([7], 'UNICO'), { inicial: 7, final: 7 })
  assert.equal(proximoIntervalo([1, 2, 3], 'LOTE'), null, 'sem 10 contiguos, nao ha faixa')
})

test('o rotulo sempre cita a versao: 1-10 existe em todas', () => {
  assert.equal(rotuloIntervalo('002', 1, 10), 'Versão 002 — certificados 1–10')
  assert.equal(rotuloIntervalo('002', 11, 11), 'Versão 002 — certificado 11')
})

test('senha e cifrada de forma reversivel e nao fica em claro', () => {
  const senha = gerarSenha()
  const guardado = cifrar(senha)
  assert.notEqual(guardado, senha)
  assert.ok(!guardado.includes(senha), 'o texto cifrado nao pode conter a senha')
  assert.equal(decifrar(guardado), senha)
})

test('cifrar duas vezes a mesma senha da resultados diferentes', () => {
  // IV aleatorio por operacao: senhas iguais nao podem ser identificaveis no banco.
  assert.notEqual(cifrar('mesma-senha'), cifrar('mesma-senha'))
})

test('texto cifrado adulterado falha em vez de devolver lixo', () => {
  const guardado = cifrar('segredo')
  const [iv, tag, dados] = guardado.split(':')
  const adulterado = [iv, tag, dados.slice(0, -2) + 'AA'].join(':')
  assert.throws(() => decifrar(adulterado))
  assert.throws(() => decifrar('formato-errado'))
})

test('gerarSenha evita caracteres que se confundem', () => {
  const senha = gerarSenha(200)
  assert.equal(senha.length, 200)
  assert.ok(!/[0O1lI]/.test(senha))
})
