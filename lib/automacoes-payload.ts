/**
 * Traducao do payload da tela de Automacoes para o formato do banco.
 *
 * Fica em lib e nao no route.ts porque o App Router so aceita exports de
 * metodo HTTP num route file — e porque a criacao e a edicao precisam da mesma
 * regra, sem duplicar validacao em dois lugares.
 */

import { GATILHOS, ACOES, validarConfiguracao, type Gatilho, type Acao } from '@/lib/automacoes'
import { Prisma, type Role } from '@prisma/client'

const ROLES: Role[] = ['ADMIN', 'OPERACIONAL', 'COMERCIAL', 'GESTOR']

export function validarPayloadAutomacao(b: Record<string, unknown>): string | null {
  if (!String(b.nome ?? '').trim()) return 'Informe o nome da automação.'
  if (!GATILHOS.includes(b.gatilho as Gatilho)) return 'Gatilho inválido.'
  if (!ACOES.includes(b.acao as Acao)) return 'Ação inválida.'
  if (b.destinatarioRole && !ROLES.includes(b.destinatarioRole as Role)) return 'Perfil de destinatário inválido.'

  return validarConfiguracao({
    acao: b.acao as Acao,
    funilDestinoId: (b.funilDestinoId as string) || null,
    etapaDestinoId: (b.etapaDestinoId as string) || null,
    destinatarioRole: (b.destinatarioRole as string) || null,
    destinatarioUserId: (b.destinatarioUserId as string) || null,
    titulo: (b.titulo as string) || null,
    mensagem: (b.mensagem as string) || null,
  })
}

export function montarDadosAutomacao(b: Record<string, unknown>): Prisma.AutomacaoUncheckedCreateInput {
  return {
    nome: String(b.nome).trim().slice(0, 160),
    ativo: b.ativo === undefined ? true : Boolean(b.ativo),
    gatilho: b.gatilho as Gatilho,
    funilId: (b.funilId as string) || null,
    etapaId: (b.etapaId as string) || null,
    acao: b.acao as Acao,
    funilDestinoId: (b.funilDestinoId as string) || null,
    etapaDestinoId: (b.etapaDestinoId as string) || null,
    destinatarioRole: (b.destinatarioRole as Role) || null,
    destinatarioUserId: (b.destinatarioUserId as string) || null,
    condicao: (b.condicao as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    titulo: b.titulo ? String(b.titulo).slice(0, 200) : null,
    mensagem: b.mensagem ? String(b.mensagem).slice(0, 1000) : null,
  }
}
