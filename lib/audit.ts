import { prisma } from './prisma'

export async function logAudit(
  userId: string,
  acao: string,
  entidade: string,
  entidadeId?: string,
  detalhes?: string,
) {
  try {
    await prisma.auditoria.create({
      data: {
        acao,
        entidade,
        entidadeId: entidadeId ?? null,
        detalhes: detalhes ?? null,
        userId,
      },
    })
  } catch {}
}
