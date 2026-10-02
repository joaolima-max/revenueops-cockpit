/**
 * GOVERNANÇA — Conselho, Auditoria, Lixeira e Gestor de Conta.
 *
 * Quatro autorizações, QUATRO EIXOS INDEPENDENTES, e é a independência que
 * estes testes protegem:
 *
 *   CONSELHO        `isPartner` — ser sócio;
 *   AUDITORIA       chave restrita `view_auditoria`;
 *   LIXEIRA         hierarquia DIRETOR;
 *   GESTOR DE CONTA nenhuma das três — só estar ativo.
 *
 * Cada confusão entre eles já aconteceu ou é fácil de acontecer: ser ADMIN
 * liberando tudo (`hasPermission` tinha esse atalho), Diretor sendo lido como
 * sócio, departamento CONSELHO sendo lido como sócio, e Gestor de Conta
 * virando cargo.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasPermission, permissaoRestrita, PERMISSOES_RESTRITAS,
  ALL_PERMISSIONS, DEFAULT_PERMISSIONS,
  perfilDe, roleDoPerfil, DEPARTAMENTOS, HIERARQUIAS,
  DEPARTAMENTO_LABEL, HIERARQUIA_LABEL, PERFIL_LABEL,
  DEPARTAMENTO_DA_ORIGEM,
  ehSocio, podeVerLixeira, podeSerGestorDeConta,
  podeVerUsuarios, podeGerenciarUsuarios,
} from '../lib/permissions'
import { navigationFor, checkAccess, activeFeatures } from '../lib/modules'

const PERFIS_TECNICOS = ['ADMIN', 'OPERACIONAL', 'COMERCIAL', 'GESTOR']

/* ========================================================================= *
 * AS CHAVES RESTRITAS
 * ========================================================================= */

test('AUDITORIA e CONSELHO sao chaves RESTRITAS', () => {
  assert.ok(permissaoRestrita('view_auditoria'))
  assert.ok(permissaoRestrita('manage_auditoria'))
  assert.ok(!permissaoRestrita('view_dashboard'))

  // `view_conselho` e restrita: ser ADMIN nao a concede. A condicao de socio
  // e a OUTRA metade, e as duas sao exigidas — ver `podeVerConselho`, que e o
  // unico lugar que as combina.
  assert.ok(permissaoRestrita('view_conselho'))
  assert.ok(ALL_PERMISSIONS.some((p) => p.key === 'view_conselho'))
})

test('SER ADMIN NAO LIBERA chave restrita', () => {
  for (const chave of PERMISSOES_RESTRITAS) {
    assert.equal(
      hasPermission(null, chave, 'ADMIN'), false,
      `o atalho de ADMIN voltou e liberou ${chave}`,
    )
  }
})

test('nenhum perfil tecnico libera chave restrita por default', () => {
  for (const role of PERFIS_TECNICOS) {
    for (const chave of PERMISSOES_RESTRITAS) {
      assert.equal(hasPermission(null, chave, role), false, `${role} liberou ${chave}`)
      assert.equal(hasPermission([], chave, role), false, `${role} liberou ${chave} com lista vazia`)
    }
  }
})

test('a chave restrita vale quando esta GRAVADA no usuario', () => {
  assert.equal(hasPermission(['view_conselho'], 'view_conselho', 'COMERCIAL'), true)
  // E vale pela chave, nao pelo cargo: um colaborador autorizado entra.
  assert.equal(hasPermission(['view_auditoria'], 'view_auditoria', 'OPERACIONAL'), true)
})

test('a chave da Auditoria nao abre a de administracao dela', () => {
  assert.equal(hasPermission(['view_auditoria'], 'manage_auditoria', 'ADMIN'), false)
  assert.equal(hasPermission(['manage_auditoria'], 'manage_auditoria', 'ADMIN'), true)
})

test('as restritas estao FORA de todos os defaults', () => {
  // Um default as devolveria pela porta de trás no primeiro usuário sem lista.
  for (const [role, chaves] of Object.entries(DEFAULT_PERMISSIONS)) {
    for (const chave of PERMISSOES_RESTRITAS) {
      assert.ok(!chaves.includes(chave), `${role} recebe ${chave} por default`)
    }
  }
})

test('as restritas estao no CATALOGO — e preciso poder conceder', () => {
  const catalogo = ALL_PERMISSIONS.map((p) => p.key)
  for (const chave of PERMISSOES_RESTRITAS) {
    assert.ok(catalogo.includes(chave), `${chave} nao aparece na tela de Usuarios`)
  }
})

/* ========================================================================= *
 * NAVEGAÇÃO E ROTA
 * ========================================================================= */

test('sem autorizacao, Conselho e Auditoria NAO aparecem — nem para ADMIN', () => {
  for (const role of PERFIS_TECNICOS) {
    const itens = navigationFor(role, null, false).flatMap((s) => s.items.map((i) => i.label))
    assert.ok(!itens.includes('Conselho'), `Conselho apareceu para ${role}`)
    assert.ok(!itens.includes('Auditoria'), `Auditoria apareceu para ${role}`)
  }
})

test('cada tela tem a SUA chave: Conselho e Auditoria nao se confundem', () => {
  const menu = (chaves: string[] | null, socio: boolean) =>
    navigationFor('ADMIN', chaves, socio).flatMap((s) => s.items.map((i) => i.label))

  // As duas chaves + socio: as duas telas.
  const ambas = menu(['view_conselho', 'view_auditoria'], true)
  assert.ok(ambas.includes('Conselho'))
  assert.ok(ambas.includes('Auditoria'))

  // Socio com a chave do Conselho so: nao ve Auditoria. Ser socio nao e ser
  // auditor.
  const soConselho = menu(['view_conselho'], true)
  assert.ok(soConselho.includes('Conselho'))
  assert.ok(!soConselho.includes('Auditoria'), 'ser socio nao e ser auditor')

  // Socio sem chave nenhuma: nenhuma das duas.
  const nenhuma = menu(null, true)
  assert.ok(!nenhuma.includes('Conselho'), 'socio sem view_conselho entrou')
  assert.ok(!nenhuma.includes('Auditoria'))

  // Auditor que nao e socio: ve Auditoria, nao ve Conselho.
  const soAuditoria = menu(['view_auditoria', 'view_conselho'], false)
  assert.ok(!soAuditoria.includes('Conselho'), 'nao socio com a chave entrou')
  assert.ok(soAuditoria.includes('Auditoria'))
})

test('URL DIRETA bloqueada sem autorizacao, inclusive para ADMIN', () => {
  // `doBanco: true` — e a lista ATUAL que decide chave restrita. O proxy, que
  // so tem o token, nao opina: a autoridade e a pagina, que le o banco (ver
  // "o PROXY nao decide chave restrita" em tests/conselho).
  for (const rota of ['/dashboard/conselho', '/dashboard/auditoria']) {
    assert.equal(
      checkAccess(rota, 'ADMIN', null, false, true), 'forbidden',
      `${rota} abriu sem autorizacao`,
    )
    assert.equal(checkAccess(rota, 'ADMIN', [], false, true), 'forbidden')
  }
})

test('API bloqueada sem autorizacao', () => {
  // As APIs restritas conferem com `autorizado()`, que le o banco — logo
  // `doBanco: true` reproduz a decisao que de fato acontece no handler.
  assert.equal(checkAccess('/api/auditoria', 'ADMIN', null, false, true), 'forbidden')
  assert.equal(checkAccess('/api/conselho', 'ADMIN', null, false, true), 'forbidden')
})

test('o Conselho exige socio E a chave; a Auditoria exige a dela', () => {
  // As duas condicoes juntas abrem. `doBanco` em todas: e a lista atual que
  // decide chave restrita.
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', ['view_conselho'], true, true), 'allow')
  assert.equal(checkAccess('/api/conselho', 'ADMIN', ['view_conselho'], true, true), 'allow')
  // Cada uma sozinha nao abre.
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', null, true, true), 'forbidden',
    'socio sem a chave entrou')
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', ['view_conselho'], false, true), 'forbidden',
    'a chave sem ser socio entrou')
  // A Auditoria segue com a chave dela, independente de socio.
  assert.equal(checkAccess('/api/auditoria', 'ADMIN', ['view_auditoria'], false, true), 'allow')
})

test('NAO ser socio barra o Conselho mesmo com todas as chaves', () => {
  const todas = ALL_PERMISSIONS.map((p) => p.key)
  assert.equal(checkAccess('/dashboard/conselho', 'ADMIN', todas, false, true), 'forbidden')
})

test('a CHAVE e o gate da Auditoria — nao o perfil', () => {
  // A funcao lista os quatro perfis de proposito: herdar `roles: ['ADMIN']`
  // da secao impediria conceder auditoria a quem nao e administrador do
  // sistema, e a chave restrita existe justamente para isso.
  assert.equal(checkAccess('/dashboard/auditoria', 'COMERCIAL', ['view_auditoria'], false, true), 'allow')
  assert.equal(checkAccess('/dashboard/auditoria', 'COMERCIAL', null, false, true), 'forbidden')
  assert.equal(checkAccess('/dashboard/auditoria', 'ADMIN', null, false, true), 'forbidden',
    'ser ADMIN nunca libera chave restrita')
})

test('USUARIOS tem alcada propria: view OU manage abrem a tela', () => {
  for (const chaves of [['view_usuarios'], ['manage_usuarios'], ['view_usuarios', 'manage_usuarios']]) {
    assert.equal(
      checkAccess('/dashboard/usuarios', 'OPERACIONAL', chaves, false), 'allow',
      `${chaves.join('+')} deveria abrir`,
    )
  }
  assert.equal(checkAccess('/dashboard/usuarios', 'OPERACIONAL', null, false), 'forbidden')
  assert.equal(checkAccess('/dashboard/usuarios', 'OPERACIONAL', ['view_leads'], false), 'forbidden')
})

test('ADMIN sem lista explicita CONTINUA vendo Usuarios', () => {
  // A regressao que isto trava: `permissaoConcedida` comparava a lista com
  // `includes` cru, e `null.includes` nunca encontra nada — um ADMIN sem
  // lista (o caso da maioria em Production) perdia o menu.
  assert.equal(checkAccess('/dashboard/usuarios', 'ADMIN', null), 'allow')
  const itens = navigationFor('ADMIN', null, false).flatMap((s) => s.items.map((i) => i.label))
  assert.ok(itens.includes('Usuários'))
})

test('ver e EDITAR usuarios sao alcadas separadas', () => {
  // Consultar quem tem acesso a que e trabalho de auditoria; alterar e de
  // quem responde pelas alcadas. Com uma chave so, quem precisa conferir
  // ganharia o poder de conceder qualquer outra — inclusive a si mesmo.
  assert.equal(podeVerUsuarios(['view_usuarios'], 'OPERACIONAL'), true)
  assert.equal(podeGerenciarUsuarios(['view_usuarios'], 'OPERACIONAL'), false)

  assert.equal(podeVerUsuarios(['manage_usuarios'], 'OPERACIONAL'), true,
    'quem edita tambem le')
  assert.equal(podeGerenciarUsuarios(['manage_usuarios'], 'OPERACIONAL'), true)

  assert.equal(podeVerUsuarios(null, 'OPERACIONAL'), false)
  assert.equal(podeGerenciarUsuarios(null, 'OPERACIONAL'), false)
})

test('cada funcao declara os eixos que a governam', () => {
  const conselho = activeFeatures().find((f) => f.key === 'conselho')!
  const auditoria = activeFeatures().find((f) => f.key === 'admin.auditoria')!

  // CONSELHO: os dois eixos, e ambos obrigatorios.
  assert.equal(conselho.socio, true, 'o Conselho exige socio')
  assert.equal(conselho.permissao, 'view_conselho', 'o Conselho exige a chave explicita')

  // AUDITORIA: chave, e so. Ser socio nao tem nada a ver com auditar.
  assert.equal(auditoria.permissao, 'view_auditoria')
  assert.equal(auditoria.socio, undefined, 'a Auditoria nao exige socio')
})

/* ========================================================================= *
 * OS QUATRO EIXOS NÃO SE CONFUNDEM
 * ========================================================================= */

test('SOCIO e eixo proprio: perfil, departamento e hierarquia nao implicam', () => {
  assert.equal(ehSocio({ isPartner: true }), true)
  assert.equal(ehSocio({ isPartner: false }), false)
  assert.equal(ehSocio(null), false)
  assert.equal(ehSocio(undefined), false)
  // O objeto nao tem nem como expressar "e ADMIN logo e socio".
  assert.equal(ehSocio({} as { isPartner?: boolean }), false)
})

test('LIXEIRA e DIRETOR — hierarquia, nao perfil', () => {
  // Um Diretor Colaborador ve a lixeira; um Admin Operador nao.
  assert.equal(podeVerLixeira({ hierarquia: 'DIRETOR' }), true)
  assert.equal(podeVerLixeira({ hierarquia: 'OPERADOR' }), false)
  assert.equal(podeVerLixeira({ hierarquia: null }), false)
  assert.equal(podeVerLixeira(null), false)
})

test('GESTOR DE CONTA nao e cargo: basta estar ativo', () => {
  // Nao e Diretor, nao e socio, nao e Admin. Filtrar por hierarquia aqui
  // transformaria uma atribuicao operacional numa questao de cargo.
  assert.equal(podeSerGestorDeConta({ active: true }), true)
  assert.equal(podeSerGestorDeConta({ active: false }), false)
  assert.equal(podeSerGestorDeConta(null), false)
})

test('ser DIRETOR nao e ser SOCIO, e vice-versa', () => {
  const diretorNaoSocio = { hierarquia: 'DIRETOR', isPartner: false }
  const socioOperador = { hierarquia: 'OPERADOR', isPartner: true }

  assert.equal(podeVerLixeira(diretorNaoSocio), true)
  assert.equal(ehSocio(diretorNaoSocio), false, 'Diretor virou socio')

  assert.equal(ehSocio(socioOperador), true)
  assert.equal(podeVerLixeira(socioOperador), false, 'socio virou Diretor')
})

test('o departamento CONSELHO nao faz ninguem socio', () => {
  // Trabalhar com o conselho nao e ser dono da empresa.
  assert.equal(ehSocio({ isPartner: false }), false)
})

/* ========================================================================= *
 * PERFIL · DEPARTAMENTO · HIERARQUIA
 * ========================================================================= */

test('perfil e DERIVADO da role — dois na tela, quatro no banco', () => {
  assert.equal(perfilDe('ADMIN'), 'ADMIN')
  for (const r of ['OPERACIONAL', 'COMERCIAL', 'GESTOR']) {
    assert.equal(perfilDe(r), 'COLABORADOR', `${r} deveria ser Colaborador`)
  }
})

test('rebaixar a Colaborador PRESERVA a role tecnica atual', () => {
  // Existem tres roles nao-admin, e regravar ao acaso trocaria as alcadas de
  // funil da pessoa. Cada salvamento da tela faria isso.
  assert.equal(roleDoPerfil('COLABORADOR', 'COMERCIAL', 'GESTOR'), 'GESTOR')
  assert.equal(roleDoPerfil('COLABORADOR', null, 'OPERACIONAL'), 'OPERACIONAL')
})

test('promover a Admin e inequivoco', () => {
  assert.equal(roleDoPerfil('ADMIN', null, 'COMERCIAL'), 'ADMIN')
  assert.equal(roleDoPerfil('ADMIN', 'FINANCEIRO', 'GESTOR'), 'ADMIN')
})

test('rebaixar um ADMIN usa o departamento — a unica pista disponivel', () => {
  assert.equal(roleDoPerfil('COLABORADOR', 'COMERCIAL', 'ADMIN'), 'COMERCIAL')
  assert.equal(roleDoPerfil('COLABORADOR', 'OPERACOES', 'ADMIN'), 'OPERACIONAL')
  assert.equal(roleDoPerfil('COLABORADOR', null, 'ADMIN'), 'OPERACIONAL')
})

test('os cinco departamentos e as duas hierarquias da especificacao', () => {
  assert.deepEqual(
    [...DEPARTAMENTOS],
    ['FINANCEIRO', 'COMERCIAL', 'COMPLIANCE', 'OPERACOES', 'CONSELHO'],
  )
  assert.deepEqual([...HIERARQUIAS], ['DIRETOR', 'OPERADOR'])
})

test('todo departamento e hierarquia tem rotulo — nunca o enum cru na tela', () => {
  for (const d of DEPARTAMENTOS) assert.ok(DEPARTAMENTO_LABEL[d])
  for (const h of HIERARQUIAS) assert.ok(HIERARQUIA_LABEL[h])
  assert.equal(PERFIL_LABEL.ADMIN, 'Admin')
  assert.equal(PERFIL_LABEL.COLABORADOR, 'Colaborador')
})

test('os avisos financeiros vao para o FINANCEIRO', () => {
  assert.equal(DEPARTAMENTO_DA_ORIGEM.CONTA_PAGAR, 'FINANCEIRO')
  assert.equal(DEPARTAMENTO_DA_ORIGEM.CONTA_RECEBER, 'FINANCEIRO')
  assert.equal(DEPARTAMENTO_DA_ORIGEM.LANCAMENTO_DIARIO, 'FINANCEIRO')
  assert.equal(DEPARTAMENTO_DA_ORIGEM.COMPLIANCE, 'COMPLIANCE')
})

test('a HIERARQUIA nao concede chave restrita nenhuma', () => {
  for (const chave of PERMISSOES_RESTRITAS) {
    assert.equal(hasPermission(null, chave, 'ADMIN'), false)
  }
})
