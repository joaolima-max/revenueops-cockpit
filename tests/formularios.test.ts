/** Definicao, validacao de resposta e ciclo de vida do link publico. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validarDefinicao, validarResposta, camposQueColetam, ehDecorativo, aceitaOpcoes,
  gerarToken, linkUtilizavel, DEFINICAO_VAZIA,
  type DefinicaoFormulario,
} from '../lib/formularios'

const def = (campos: DefinicaoFormulario['secoes'][number]['campos']): DefinicaoFormulario => ({
  aparencia: {},
  secoes: [{ id: 's1', titulo: 'Dados', campos }],
})

test('definicao vazia nao passa: precisa de ao menos um campo que colete', () => {
  assert.match(validarDefinicao(DEFINICAO_VAZIA)!, /pelo menos um campo/)
  assert.match(validarDefinicao({ secoes: [] })!, /pelo menos uma seção/)
  assert.match(validarDefinicao(null)!, /inválida/)
})

test('definicao valida passa', () => {
  assert.equal(validarDefinicao(def([{ id: 'c1', tipo: 'TEXTO', rotulo: 'Nome' }])), null)
})

test('campo de selecao sem opcoes nao passa', () => {
  assert.match(
    validarDefinicao(def([{ id: 'c1', tipo: 'SELECT', rotulo: 'Porte' }]))!,
    /precisa de pelo menos uma opção/,
  )
  assert.equal(
    validarDefinicao(def([{ id: 'c1', tipo: 'SELECT', rotulo: 'Porte', opcoes: ['A'] }])),
    null,
  )
})

test('ids repetidos sao recusados', () => {
  assert.match(
    validarDefinicao(def([
      { id: 'c1', tipo: 'TEXTO', rotulo: 'A' },
      { id: 'c1', tipo: 'TEXTO', rotulo: 'B' },
    ]))!,
    /dois campos com o identificador/,
  )
})

test('campos decorativos nao contam como pergunta', () => {
  assert.ok(ehDecorativo('SECAO'))
  assert.ok(ehDecorativo('TEXTO_INFORMATIVO'))
  assert.ok(ehDecorativo('IMAGEM'))
  assert.ok(!ehDecorativo('TEXTO'))
  assert.ok(aceitaOpcoes('RADIO'))
  assert.ok(!aceitaOpcoes('TEXTO'))

  const d = def([
    { id: 'i1', tipo: 'TEXTO_INFORMATIVO', rotulo: 'Aviso' },
    { id: 'c1', tipo: 'TEXTO', rotulo: 'Nome' },
  ])
  assert.equal(camposQueColetam(d).length, 1)
  assert.match(validarDefinicao(def([{ id: 'i1', tipo: 'IMAGEM', rotulo: 'Capa' }]))!, /pelo menos um campo/)
})

test('campo obrigatorio vazio gera erro; opcional vazio nao', () => {
  const d = def([
    { id: 'c1', tipo: 'TEXTO', rotulo: 'Nome', obrigatorio: true },
    { id: 'c2', tipo: 'TEXTO', rotulo: 'Apelido' },
  ])
  assert.deepEqual(validarResposta(d, {}), { c1: 'Campo obrigatório.' })
  assert.deepEqual(validarResposta(d, { c1: 'Ana' }), {})
})

test('aceite obrigatorio exige marcar, nao so preencher', () => {
  const d = def([{ id: 'a', tipo: 'ACEITE', rotulo: 'Termos', obrigatorio: true }])
  assert.match(validarResposta(d, { a: false }).a, /aceitar/)
  assert.deepEqual(validarResposta(d, { a: true }), {})
})

test('formatos: email, telefone, CNPJ/CPF e data', () => {
  const d = def([
    { id: 'e', tipo: 'EMAIL', rotulo: 'E-mail' },
    { id: 't', tipo: 'TELEFONE', rotulo: 'Celular' },
    { id: 'doc', tipo: 'DOCUMENTO', rotulo: 'CNPJ' },
    { id: 'dt', tipo: 'DATA', rotulo: 'Data' },
  ])
  const erros = validarResposta(d, { e: 'nao-email', t: '123', doc: '123', dt: 'ontem' })
  assert.ok(erros.e && erros.t && erros.doc && erros.dt)

  assert.deepEqual(validarResposta(d, {
    e: 'a@b.com', t: '(11) 99999-0000', doc: '12345678000199', dt: '2026-09-09',
  }), {})
  assert.deepEqual(validarResposta(d, { doc: '12345678901' }), {}, 'CPF de 11 digitos tambem vale')
})

test('numero respeita minimo, maximo e faixa do percentual', () => {
  const d = def([
    { id: 'n', tipo: 'NUMERO', rotulo: 'Qtd', min: 10, max: 20 },
    { id: 'p', tipo: 'PERCENTUAL', rotulo: 'Taxa' },
    { id: 'v', tipo: 'VOLUMETRIA', rotulo: 'Volume' },
  ])
  assert.match(validarResposta(d, { n: '5' }).n, /Mínimo 10/)
  assert.match(validarResposta(d, { n: '25' }).n, /Máximo 20/)
  assert.match(validarResposta(d, { p: '120' }).p, /entre 0 e 100/)
  assert.match(validarResposta(d, { v: '-1' }).v, /negativa/)
  assert.deepEqual(validarResposta(d, { n: '15', p: '2.5', v: '1000' }), {})
})

test('selecao so aceita valores da lista', () => {
  const d = def([
    { id: 's', tipo: 'SELECT', rotulo: 'Porte', opcoes: ['PME', 'Enterprise'] },
    { id: 'm', tipo: 'MULTIPLA', rotulo: 'Canais', opcoes: ['API', 'WL'] },
  ])
  assert.match(validarResposta(d, { s: 'Outro' }).s, /Opção inválida/)
  assert.match(validarResposta(d, { m: ['API', 'Xis'] }).m, /Opção inválida/)
  assert.deepEqual(validarResposta(d, { s: 'PME', m: ['API'] }), {})
})

test('token do link e aleatorio e nao parece um id', () => {
  const a = gerarToken()
  const b = gerarToken()
  assert.notEqual(a, b)
  assert.equal(a.length, 24)
  assert.match(a, /^[A-Za-z0-9]+$/)
})

test('link so vale enquanto nao foi revogado, nao expirou e tem uso', () => {
  const agora = new Date('2026-09-09T12:00:00Z')
  const base = { revogadoEm: null, expiraEm: null, usos: 0, usosMax: null }

  assert.equal(linkUtilizavel(base, agora), null)
  assert.equal(linkUtilizavel({ ...base, revogadoEm: new Date('2026-09-01') }, agora), 'REVOGADO')
  assert.equal(linkUtilizavel({ ...base, expiraEm: '2026-09-01' }, agora), 'EXPIRADO')
  assert.equal(linkUtilizavel({ ...base, expiraEm: '2026-12-01' }, agora), null)
  assert.equal(linkUtilizavel({ ...base, usos: 3, usosMax: 3 }, agora), 'ESGOTADO')
  assert.equal(linkUtilizavel({ ...base, usos: 2, usosMax: 3 }, agora), null)
})

// ────────────────────────────────────────────────────────────── anexos

import { prepararAnexos, camposDeUpload, type ArquivoRecebido } from '../lib/formularios'
import { validarArquivo } from '../lib/arquivos'

const pdf = (nome = 'contrato.pdf', size = 1000): ArquivoRecebido =>
  ({ name: nome, type: 'application/pdf', size })

const defComUpload = (obrigatorio = false, multiplo = false) => def([
  { id: 'nome', tipo: 'TEXTO', rotulo: 'Nome' },
  { id: 'doc', tipo: multiplo ? 'UPLOAD_MULTIPLO' : 'UPLOAD', rotulo: 'Documento', obrigatorio },
])

test('camposDeUpload isola so os campos de arquivo', () => {
  assert.deepEqual(camposDeUpload(defComUpload()).map((c) => c.id), ['doc'])
  assert.deepEqual(camposDeUpload(def([{ id: 'a', tipo: 'TEXTO', rotulo: 'A' }])), [])
})

test('anexo valido e preparado', () => {
  const r = prepararAnexos(defComUpload(), { doc: [pdf()] }, 'cli-1', validarArquivo)
  assert.equal(r.erro, null)
  assert.equal(r.anexos.length, 1)
  assert.equal(r.anexos[0].campoId, 'doc')
})

test('link sem cliente nao aceita anexo — Documento pertence a um Cliente', () => {
  const r = prepararAnexos(defComUpload(), { doc: [pdf()] }, null, validarArquivo)
  assert.match(r.erro!, /não está vinculado a um cliente/)
  assert.equal(r.anexos.length, 0)
})

test('link sem cliente segue aceitando resposta SEM anexo', () => {
  const r = prepararAnexos(defComUpload(), {}, null, validarArquivo)
  assert.equal(r.erro, null)
  assert.equal(r.anexos.length, 0)
})

test('campo de upload obrigatorio exige arquivo', () => {
  const r = prepararAnexos(defComUpload(true), {}, 'cli-1', validarArquivo)
  assert.match(r.errosPorCampo.doc, /ao menos um arquivo/)
  assert.match(r.erro!, /Confira os arquivos/)
})

test('UPLOAD aceita um arquivo; UPLOAD_MULTIPLO aceita varios', () => {
  const dois = { doc: [pdf('a.pdf'), pdf('b.pdf')] }
  assert.match(prepararAnexos(defComUpload(false, false), dois, 'cli-1', validarArquivo).errosPorCampo.doc, /um arquivo só/)
  assert.equal(prepararAnexos(defComUpload(false, true), dois, 'cli-1', validarArquivo).erro, null)
})

test('arquivo invalido e recusado antes de qualquer byte subir', () => {
  const r = prepararAnexos(defComUpload(), {
    doc: [{ name: 'malicioso.exe', type: 'application/octet-stream', size: 10 }],
  }, 'cli-1', validarArquivo)
  assert.match(r.errosPorCampo.doc, /não é aceita/)
  assert.equal(r.anexos.length, 0)
})

test('arquivo grande demais e recusado', () => {
  const r = prepararAnexos(defComUpload(), { doc: [pdf('grande.pdf', 999_000_000)] }, 'cli-1', validarArquivo)
  assert.match(r.errosPorCampo.doc, /maior que o limite/)
})

test('arquivo para campo inexistente e payload forjado, nao engano', () => {
  const r = prepararAnexos(defComUpload(), { fantasma: [pdf()] }, 'cli-1', validarArquivo)
  assert.match(r.erro!, /campo que não existe/)
  assert.equal(r.anexos.length, 0)
})

test('validarResposta ignora campos de upload — quem os valida e prepararAnexos', () => {
  // Sem isso, um upload obrigatorio seria reprovado como "campo vazio", ja que
  // os arquivos viajam fora de `valores`.
  assert.deepEqual(validarResposta(defComUpload(true), { nome: 'Ana' }), {})
})
