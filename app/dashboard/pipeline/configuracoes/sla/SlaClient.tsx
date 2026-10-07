'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState, { Alert } from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { SLA_MAX_DIAS, FRACAO_PROXIMO } from '@/lib/sla'

/**
 * CONFIGURAÇÃO DE SLA — por funil e etapa.
 *
 * ── POR QUE ESTA TELA NÃO MORA NO QUADRO ────────────────────────────────
 *
 * O pedido é explícito: navegação profunda, e não dezenas de campos de
 * configuração na tela principal do Pipeline.
 *
 * A razão é de uso. O quadro é operado todo dia por quem move cards; o SLA é
 * definido uma vez e revisto de vez em quando, por quem administra o funil. São
 * frequências e públicos diferentes — e cinco campos numéricos por funil no
 * topo do quadro roubariam espaço permanente de quem só quer arrastar um card.
 *
 * ── UM FORMULÁRIO POR FUNIL, SALVO EM LOTE ──────────────────────────────
 *
 * Configurar SLA é tarefa de funil inteiro: define-se Prospecção 3,
 * Qualificação 5, Proposta 7, Negociação 5 e Fechamento 3 numa sentada. Salvar
 * campo a campo faria cinco requisições e deixaria o funil em estado parcial se
 * a terceira falhasse — e um funil com três etapas configuradas e duas não é
 * pior que um sem configuração, porque parece configurado.
 *
 * ── CAMPO VAZIO É "SEM SLA", E É ASSIM QUE SE REMOVE ────────────────────
 *
 * Zero NÃO é aceito: ele seria lido como um prazo de zero dias e faria todo
 * card vencer no instante em que entrasse na etapa. A tela diz isso no rodapé.
 */

interface EtapaSla {
  id: string
  funilId: string
  nome: string
  ordem: number
  ativo: boolean
  tipo: string
  slaDias: number | null
}

interface FunilSla {
  id: string
  nome: string
  area: string | null
  ativo: boolean
  etapas: EtapaSla[]
}

export default function SlaClient() {
  const [funis, setFunis] = useState<FunilSla[]>([])
  const [podeGerenciar, setPodeGerenciar] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvandoFunil, setSalvandoFunil] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState('')

  /**
   * O que está DIGITADO, por etapa.
   *
   * Guardado como STRING e não como número: o campo precisa poder estar vazio
   * ("sem SLA"), e `number | null` obrigaria a inventar um valor para o estado
   * intermediário de quem apagou o conteúdo para digitar outro.
   */
  const [rascunho, setRascunho] = useState<Record<string, string>>({})

  const buscar = useCallback(async () => {
    const res = await fetch('/api/pipeline/sla')
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Não foi possível carregar os funis.')
    }
    return res.json() as Promise<{ funis: FunilSla[]; podeGerenciar: boolean }>
  }, [])

  const aplicar = useCallback((d: { funis: FunilSla[]; podeGerenciar: boolean }) => {
    setFunis(d.funis)
    setPodeGerenciar(d.podeGerenciar)
    // O rascunho nasce do que está GRAVADO: assim "salvar" sem mexer em nada é
    // uma operação sem efeito, e a API não registra mudança na auditoria.
    const inicial: Record<string, string> = {}
    for (const f of d.funis) {
      for (const e of f.etapas) inicial[e.id] = e.slaDias === null ? '' : String(e.slaDias)
    }
    setRascunho(inicial)
  }, [])

  useEffect(() => {
    let vivo = true
    buscar()
      .then((d) => { if (vivo) { aplicar(d); setErro('') } })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar.')
      })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [buscar, aplicar])

  async function salvar(funil: FunilSla) {
    setSalvandoFunil(funil.id); setErro(''); setSucesso('')

    const slas = funil.etapas.map((e) => ({
      etapaId: e.id,
      // String vazia → `null`, que é "sem SLA". `Number('')` daria 0, e zero é
      // recusado pela validação — o campo vazio tem de virar nulo aqui.
      slaDias: rascunho[e.id]?.trim() ? Number(rascunho[e.id]) : null,
    }))

    const res = await fetch('/api/pipeline/sla', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slas }),
    })

    if (res.ok) {
      const d = await res.json()
      setSucesso(
        d.alteradas > 0
          ? `${funil.nome}: ${d.alteradas} ${d.alteradas === 1 ? 'etapa' : 'etapas'} atualizada${d.alteradas === 1 ? '' : 's'}.`
          : `${funil.nome}: nada mudou.`,
      )
      try {
        aplicar(await buscar())
      } catch { /* a lista continua a que estava; o salvamento já foi feito. */ }
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar o SLA.')
    }
    setSalvandoFunil(null)
  }

  /** Alguma etapa deste funil tem valor diferente do gravado? */
  const temMudanca = useCallback((funil: FunilSla) => funil.etapas.some((e) => {
    const digitado = rascunho[e.id]?.trim() ?? ''
    const gravado = e.slaDias === null ? '' : String(e.slaDias)
    return digitado !== gravado
  }), [rascunho])

  const totalEtapas = useMemo(
    () => funis.reduce((a, f) => a + f.etapas.length, 0),
    [funis],
  )
  const comSla = useMemo(
    () => funis.reduce((a, f) => a + f.etapas.filter((e) => e.slaDias !== null).length, 0),
    [funis],
  )

  if (carregando) return <p className="t-sm text-subtle">Carregando…</p>

  if (funis.length === 0) {
    return (
      <Panel padded={false}>
        <EmptyState
          title="Nenhum funil disponível"
          description="O SLA é configurado por funil e etapa. Sem funil ao qual você tenha acesso, não há o que configurar."
        />
      </Panel>
    )
  }

  const inp = 'bp-field'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="t-sm text-muted max-w-2xl">
          O prazo de permanência de cada etapa, em dias corridos. O relógio{' '}
          <span className="text-fg">reinicia</span> a cada vez que o card entra numa
          etapa nova — não é medido desde a criação do card.
        </p>
        <Badge tone="neutral">
          {comSla} de {totalEtapas} {totalEtapas === 1 ? 'etapa' : 'etapas'} com SLA
        </Badge>
      </div>

      {erro && <Alert tone="error">{erro}</Alert>}
      {sucesso && <Alert tone="success">{sucesso}</Alert>}

      {!podeGerenciar && (
        <Alert tone="info">
          Você tem acesso somente de leitura: definir o SLA de uma etapa é configurar o
          funil, e essa alçada é de quem administra funis. O prazo da sua etapa aparece
          abaixo e no indicador de cada card.
        </Alert>
      )}

      {funis.map((funil) => (
        <Panel key={funil.id} padded={false}>
          <div className="p-5 sm:p-6 pb-3">
            <PanelHeader
              title={funil.nome}
              sub={
                [
                  funil.area,
                  funil.ativo ? null : 'funil inativo',
                  `${funil.etapas.length} ${funil.etapas.length === 1 ? 'etapa' : 'etapas'}`,
                ].filter(Boolean).join(' · ')
              }
              actions={podeGerenciar ? (
                <Button
                  variant="primary"
                  disabled={salvandoFunil === funil.id || !temMudanca(funil)}
                  onClick={() => salvar(funil)}
                >
                  {salvandoFunil === funil.id ? 'Salvando…' : 'Salvar SLA'}
                </Button>
              ) : undefined}
            />
          </div>

          <TableShell>
            <Table>
              <THead>
                <HeadRow>
                  <Th className="pl-5">Etapa</Th>
                  <Th>Situação</Th>
                  <Th align="right">SLA (dias)</Th>
                  <Th align="right">Aviso de aproximação</Th>
                </HeadRow>
              </THead>
              <tbody>
                {funil.etapas.length === 0 ? (
                  <EmptyRow colSpan={4}>
                    Este funil não tem etapas. Crie etapas na administração do funil.
                  </EmptyRow>
                ) : funil.etapas.map((e) => {
                  const digitado = rascunho[e.id] ?? ''
                  const n = digitado.trim() ? Number(digitado) : null
                  return (
                    <Row key={e.id}>
                      <Td className="pl-5">
                        <span className={`block t-body font-medium ${e.ativo ? 'text-fg' : 'text-subtle'}`}>
                          {e.nome}
                        </span>
                        {e.tipo !== 'NORMAL' && (
                          <span className="t-label text-subtle">
                            etapa de {e.tipo === 'GANHO' ? 'ganho' : 'perda'}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {e.ativo
                          ? <Badge tone="neutral">Ativa</Badge>
                          : <Badge>Inativa</Badge>}
                      </Td>
                      <Td align="right">
                        <input
                          type="number"
                          min={1}
                          max={SLA_MAX_DIAS}
                          step={1}
                          value={digitado}
                          disabled={!podeGerenciar}
                          placeholder="sem SLA"
                          aria-label={`SLA de ${e.nome}, em dias`}
                          className={`${inp} w-28 text-right`}
                          onChange={(ev) => setRascunho((p) => ({ ...p, [e.id]: ev.target.value }))}
                        />
                      </Td>
                      {/* O AVISO DE APROXIMAÇÃO É DERIVADO, não configurável.
                          Um segundo campo por etapa dobraria a configuração
                          para uma decisão que não varia por etapa — e a
                          pergunta "com quantos dias avisar" é a mesma em todas:
                          quando ainda dá tempo de agir. */}
                      <Td align="right" className="text-subtle t-num">
                        {n === null || n <= 0
                          ? '—'
                          : `a partir de ${Math.max(1, Math.floor(n * FRACAO_PROXIMO))}d`}
                      </Td>
                    </Row>
                  )
                })}
              </tbody>
            </Table>
          </TableShell>
        </Panel>
      ))}

      <Panel>
        <PanelHeader
          title="Como o SLA funciona"
          sub="Três coisas que mudam a leitura do indicador."
        />
        <ul className="mt-4 space-y-3 t-sm text-subtle">
          <li>
            <span className="text-fg">O relógio reinicia a cada etapa.</span> Um card que
            passou 3 dias em Prospecção e avançou para Qualificação começa a Qualificação
            com o relógio em zero. Medir desde a criação acusaria atraso de quem acabou de
            receber o card.
          </li>
          <li>
            <span className="text-fg">Campo em branco é &quot;sem SLA&quot;.</span> É
            assim que se remove o prazo de uma etapa. Zero não é aceito: ele seria lido
            como um prazo de zero dias e faria todo card vencer ao entrar.
          </li>
          <li>
            <span className="text-fg">O aviso de aproximação sai a{' '}
            {Math.round(FRACAO_PROXIMO * 100)}% do prazo.</span> Num SLA de 4 dias, avisa
            no dia 3 — sobra um dia para agir. A 90% o aviso chegaria quando já não há o
            que fazer; a 50% ele dispararia na metade de todos os cards, e um alerta
            sempre aceso deixa de ser lido.
          </li>
        </ul>
      </Panel>
    </div>
  )
}
