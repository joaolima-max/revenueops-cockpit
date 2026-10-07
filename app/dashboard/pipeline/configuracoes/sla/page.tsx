export const dynamic = 'force-dynamic'

import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Button from '@/components/ui/Button'
import SlaClient from './SlaClient'

/**
 * PIPELINE › CONFIGURAÇÕES › SLA.
 *
 * ── NAVEGAÇÃO PROFUNDA, COMO O PEDIDO EXIGE ─────────────────────────────
 *
 * A configuração de SLA não fica na tela principal do Pipeline. O quadro é
 * operado todo dia por quem move cards; o SLA é definido uma vez e revisto de
 * vez em quando, por quem administra o funil. São frequências e públicos
 * diferentes, e dezenas de campos numéricos no topo do quadro roubariam espaço
 * permanente de quem só quer arrastar um card.
 *
 * ── A AUTORIZAÇÃO ───────────────────────────────────────────────────────
 *
 * Esta rota vive sob `/dashboard/pipeline/configuracoes/`, e é a ENTRADA
 * `comercial.pipeline.configuracoes` de `lib/modules.ts` que a mantém restrita
 * a ADMIN — registrada e OCULTA, como a administração de funis.
 *
 * O registro é o que protege: caminho não registrado é caminho LIBERADO para
 * qualquer usuário autenticado (ver `checkAccess`). A API (`/api/pipeline/sla`)
 * confere a alçada por conta própria no handler — esconder a tela nunca é o que
 * protege o dado.
 *
 * Quem NÃO administra, mas enxerga o funil, abre a tela em modo leitura: saber
 * o prazo da própria etapa é informação de quem opera o card. O que a alçada
 * governa é a ESCRITA.
 */
export default async function PipelineSlaPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="SLA por etapa"
        sub="O prazo de permanência de cada etapa, por funil. O relógio reinicia a cada mudança de etapa."
        actions={
          <Link href="/dashboard/pipeline">
            <Button>Voltar ao quadro</Button>
          </Link>
        }
      />

      <SlaClient />
    </div>
  )
}
