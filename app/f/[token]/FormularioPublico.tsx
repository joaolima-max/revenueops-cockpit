'use client'

/* eslint-disable @next/next/no-img-element -- capa, logo e imagem do formulario
   sao URLs arbitrarias informadas pelo usuario. Usar next/image exigiria abrir
   `images.remotePatterns` para qualquer host, o que troca uma otimizacao por
   uma superficie de risco maior. */

import { useState, useEffect } from 'react'
import RenderCampo, { largura } from '@/components/formularios/RenderCampo'
import {
  validarResposta, camposQueColetam, camposDeUpload, ehUpload,
  type DefinicaoFormulario,
} from '@/lib/formularios'

/**
 * Página pública do formulário. Sem sessão, sem navegação do cockpit — quem
 * abre é o respondente, não um usuário do sistema.
 */
export default function FormularioPublico({ token }: { token: string }) {
  const [def, setDef] = useState<DefinicaoFormulario | null>(null)
  const [nome, setNome] = useState('')
  const [cliente, setCliente] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [indisponivel, setIndisponivel] = useState<string | null>(null)

  const [valores, setValores] = useState<Record<string, unknown>>({})
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [erroGeral, setErroGeral] = useState('')
  const [concluido, setConcluido] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/formularios/publico/${token}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!vivo) return
        if (!ok) { setIndisponivel(d.error ?? 'Formulário indisponível.'); return }
        setDef(d.definicao)
        setNome(d.nome)
        setCliente(d.cliente?.nome ?? null)
      })
      .catch(() => { if (vivo) setIndisponivel('Não foi possível carregar o formulário.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [token])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!def) return

    // Valida no navegador para dar retorno imediato; a validação que decide é
    // a do servidor, com a mesma função.
    const locais = validarResposta(def, valores)
    setErros(locais)
    if (Object.keys(locais).length > 0) {
      setErroGeral('Confira os campos destacados.')
      return
    }

    setEnviando(true); setErroGeral('')
    const assinaturaCampo = camposQueColetam(def).find((c) => c.tipo === 'ASSINATURA')
    const aceiteCampo = camposQueColetam(def).find((c) => c.tipo === 'ACEITE')

    // Os arquivos saem de `valores` e viram partes do multipart; o resto vai
    // como JSON no campo `dados`.
    const semArquivos: Record<string, unknown> = {}
    for (const [chave, v] of Object.entries(valores)) {
      const campo = def.secoes.flatMap((s) => s.campos).find((c) => c.id === chave)
      if (campo && ehUpload(campo.tipo)) continue
      semArquivos[chave] = v
    }

    const dados = {
      valores: semArquivos,
      assinatura: assinaturaCampo ? valores[assinaturaCampo.id] : null,
      aceite: aceiteCampo ? valores[aceiteCampo.id] === true : false,
    }

    const arquivos = camposDeUpload(def).flatMap((campo) => {
      const lista = valores[campo.id]
      return Array.isArray(lista) ? (lista as File[]).map((f) => ({ campoId: campo.id, file: f })) : []
    })

    let res: Response
    if (arquivos.length > 0) {
      const form = new FormData()
      form.append('dados', JSON.stringify(dados))
      for (const { campoId, file } of arquivos) form.append(`anexo:${campoId}`, file)
      res = await fetch(`/api/formularios/publico/${token}`, { method: 'POST', body: form })
    } else {
      res = await fetch(`/api/formularios/publico/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
    }

    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErros(d.erros ?? {})
      setErroGeral(d.error ?? 'Não foi possível enviar.')
      setEnviando(false)
      return
    }
    setConcluido(d.mensagem ?? 'Recebemos sua resposta. Obrigado!')
    setEnviando(false)
  }

  if (carregando) {
    return (
      <main className="min-h-dvh bg-bg flex items-center justify-center p-6">
        <p className="t-sm text-subtle">Carregando...</p>
      </main>
    )
  }

  if (indisponivel) {
    return (
      <main className="min-h-dvh bg-bg flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="t-h1 text-fg">Formulário indisponível</h1>
          <p className="t-body text-muted mt-3">{indisponivel}</p>
        </div>
      </main>
    )
  }

  if (concluido) {
    return (
      <main className="min-h-dvh bg-bg flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <span className="bp-rule mx-auto mb-6 block" aria-hidden />
          <h1 className="t-h1 text-fg">Tudo certo</h1>
          <p className="t-body text-muted mt-3">{concluido}</p>
        </div>
      </main>
    )
  }

  if (!def) return null

  const ap = def.aparencia ?? {}

  return (
    <main className="min-h-dvh bg-bg py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {ap.capaUrl && (
          <img src={ap.capaUrl} alt="" className="w-full rounded-2xl border border-line mb-6 object-cover max-h-56" />
        )}

        <header className="mb-8">
          {ap.logoUrl && <img src={ap.logoUrl} alt="" className="h-9 mb-5" />}
          <h1 className="t-h1 text-fg">{ap.titulo || nome}</h1>
          {ap.subtitulo && <p className="t-body text-muted mt-2">{ap.subtitulo}</p>}
          {cliente && <p className="t-sm text-subtle mt-2">Cliente: {cliente}</p>}
          {ap.introducao && <p className="t-sm text-muted mt-4 whitespace-pre-line">{ap.introducao}</p>}
        </header>

        {erroGeral && (
          <div className="bg-neg/10 border border-neg/25 text-neg px-4 py-3 rounded-xl t-sm mb-6">{erroGeral}</div>
        )}

        <form onSubmit={enviar} className="space-y-8">
          {def.secoes.map((secao) => (
            <section key={secao.id} className="bg-surface border border-line rounded-2xl p-5 sm:p-6">
              {secao.titulo && <h2 className="t-h2 text-fg mb-1">{secao.titulo}</h2>}
              {secao.descricao && <p className="t-sm text-muted mb-4">{secao.descricao}</p>}

              <div className="grid grid-cols-12 gap-4 mt-4">
                {secao.campos.map((campo) => (
                  <div key={campo.id} className={largura(campo)}>
                    <RenderCampo
                      campo={campo}
                      valor={valores[campo.id]}
                      erro={erros[campo.id]}
                      onChange={(v) => {
                        setValores((p) => ({ ...p, [campo.id]: v }))
                        setErros((p) => { const n = { ...p }; delete n[campo.id]; return n })
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="flex items-center justify-between gap-4 flex-wrap">
            {ap.rodape && <p className="t-sm text-subtle">{ap.rodape}</p>}
            <button type="submit" disabled={enviando}
              className="ml-auto px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-white text-[0.875rem] font-medium disabled:opacity-40 transition-colors duration-[180ms]">
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
