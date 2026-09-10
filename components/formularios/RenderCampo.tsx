'use client'

/* eslint-disable @next/next/no-img-element -- capa, logo e imagem do formulario
   sao URLs arbitrarias informadas pelo usuario. Usar next/image exigiria abrir
   `images.remotePatterns` para qualquer host, o que troca uma otimizacao por
   uma superficie de risco maior. */

import type { CampoDefinicao } from '@/lib/formularios'
import { ehDecorativo } from '@/lib/formularios'
import { EXTENSOES_ACEITAS, TAMANHO_MAX } from '@/lib/arquivos'
import { formatBytes } from '@/lib/utils'

/**
 * Desenha UM campo a partir da definicao. Usado tanto pela previa do
 * construtor quanto pela pagina publica — assim o que o administrador vê
 * montando é literalmente o que o respondente vê.
 */
export default function RenderCampo({ campo, valor, erro, onChange, somenteLeitura }: {
  campo: CampoDefinicao
  valor: unknown
  erro?: string
  onChange?: (v: unknown) => void
  somenteLeitura?: boolean
}) {
  const inp = `w-full bg-bg border rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent ${
    erro ? 'border-neg' : 'border-line'
  }`
  const set = (v: unknown) => onChange?.(v)
  const texto = valor === undefined || valor === null ? '' : String(valor)
  const desabilitado = somenteLeitura || !onChange

  if (campo.tipo === 'SECAO') {
    return (
      <div className="pt-2">
        <h3 className="t-h2 text-fg">{campo.rotulo}</h3>
        {campo.conteudo && <p className="t-sm text-muted mt-1">{campo.conteudo}</p>}
        <hr className="border-line mt-3" />
      </div>
    )
  }

  if (campo.tipo === 'TEXTO_INFORMATIVO') {
    return <p className="t-sm text-muted whitespace-pre-line">{campo.conteudo ?? campo.rotulo}</p>
  }

  if (campo.tipo === 'IMAGEM') {
    return campo.conteudo
      ? <img src={campo.conteudo} alt={campo.rotulo} className="max-w-full rounded-xl border border-line" />
      : <div className="border border-dashed border-line rounded-xl p-6 text-center t-sm text-subtle">Imagem sem URL</div>
  }

  if (campo.tipo === 'OCULTO') return null

  const rotulo = (
    <label htmlFor={campo.id} className="block t-label text-subtle mb-1.5">
      {campo.rotulo}{campo.obrigatorio && ' *'}
    </label>
  )

  const controle = (() => {
    switch (campo.tipo) {
      case 'TEXTO_LONGO':
        return <textarea id={campo.id} rows={4} className={inp} value={texto} disabled={desabilitado}
          placeholder={campo.placeholder} onChange={(e) => set(e.target.value)} />

      case 'NUMERO': case 'MOEDA': case 'PERCENTUAL': case 'VOLUMETRIA':
        return <input id={campo.id} type="number" className={`${inp} tabular-nums`} value={texto} disabled={desabilitado}
          placeholder={campo.placeholder} min={campo.min} max={campo.max}
          step={campo.tipo === 'MOEDA' ? '0.01' : campo.tipo === 'VOLUMETRIA' ? '1' : 'any'}
          onChange={(e) => set(e.target.value)} />

      case 'DATA':
        return <input id={campo.id} type="date" className={inp} value={texto} disabled={desabilitado}
          onChange={(e) => set(e.target.value)} />

      case 'DATA_HORA':
        return <input id={campo.id} type="datetime-local" className={inp} value={texto} disabled={desabilitado}
          onChange={(e) => set(e.target.value)} />

      case 'EMAIL':
        return <input id={campo.id} type="email" className={inp} value={texto} disabled={desabilitado}
          placeholder={campo.placeholder} onChange={(e) => set(e.target.value)} />

      case 'TELEFONE':
        return <input id={campo.id} type="tel" className={inp} value={texto} disabled={desabilitado}
          placeholder={campo.placeholder ?? '(00) 00000-0000'} onChange={(e) => set(e.target.value)} />

      case 'DOCUMENTO':
        return <input id={campo.id} inputMode="numeric" className={inp} value={texto} disabled={desabilitado}
          placeholder={campo.placeholder ?? 'CNPJ ou CPF'} onChange={(e) => set(e.target.value)} />

      case 'SELECT': case 'DROPDOWN':
        return (
          <select id={campo.id} className={inp} value={texto} disabled={desabilitado}
            onChange={(e) => set(e.target.value)}>
            <option value="">{campo.placeholder ?? 'Selecione'}</option>
            {(campo.opcoes ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )

      case 'RADIO':
        return (
          <div className="space-y-2">
            {(campo.opcoes ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2 t-body text-muted cursor-pointer">
                <input type="radio" name={campo.id} value={o} checked={texto === o} disabled={desabilitado}
                  onChange={() => set(o)} />
                {o}
              </label>
            ))}
          </div>
        )

      case 'MULTIPLA': {
        const lista = Array.isArray(valor) ? (valor as string[]) : []
        return (
          <div className="space-y-2">
            {(campo.opcoes ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2 t-body text-muted cursor-pointer">
                <input type="checkbox" checked={lista.includes(o)} disabled={desabilitado}
                  onChange={(e) => set(e.target.checked ? [...lista, o] : lista.filter((x) => x !== o))} />
                {o}
              </label>
            ))}
          </div>
        )
      }

      case 'CHECKBOX': case 'ACEITE':
        return (
          <label className="flex items-start gap-2.5 t-body text-muted cursor-pointer">
            <input type="checkbox" className="mt-1" checked={valor === true} disabled={desabilitado}
              onChange={(e) => set(e.target.checked)} />
            <span>{campo.conteudo ?? campo.rotulo}</span>
          </label>
        )

      case 'ASSINATURA':
        return (
          <input id={campo.id} className={inp} value={texto} disabled={desabilitado}
            placeholder={campo.placeholder ?? 'Digite seu nome completo como assinatura'}
            onChange={(e) => set(e.target.value)} />
        )

      case 'UPLOAD': case 'UPLOAD_MULTIPLO': {
        // Guarda os File de verdade: sao eles que sobem no envio. Guardar so o
        // nome era o que fazia o anexo nunca chegar ao servidor.
        const escolhidos = Array.isArray(valor) ? (valor as File[]) : []
        return (
          <div>
            <input id={campo.id} type="file" multiple={campo.tipo === 'UPLOAD_MULTIPLO'} disabled={desabilitado}
              accept={EXTENSOES_ACEITAS.map((e) => `.${e}`).join(',')}
              className="block w-full t-sm text-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-line file:bg-surface-2 file:text-fg file:t-sm"
              onChange={(e) => set(Array.from(e.target.files ?? []))} />
            {escolhidos.length > 0 && (
              <ul className="mt-2 space-y-1">
                {escolhidos.map((f, i) => (
                  <li key={i} className="t-label text-subtle">{f.name} · {formatBytes(f.size)}</li>
                ))}
              </ul>
            )}
            <p className="t-label text-subtle mt-1.5">
              {EXTENSOES_ACEITAS.join(' · ')} · até {formatBytes(TAMANHO_MAX)}
            </p>
          </div>
        )
      }

      default:
        return <input id={campo.id} className={inp} value={texto} disabled={desabilitado}
          placeholder={campo.placeholder} onChange={(e) => set(e.target.value)} />
    }
  })()

  const semRotuloProprio = campo.tipo === 'CHECKBOX' || campo.tipo === 'ACEITE'

  return (
    <div>
      {!semRotuloProprio && rotulo}
      {controle}
      {campo.ajuda && <p className="t-sm text-subtle mt-1">{campo.ajuda}</p>}
      {erro && <p className="t-sm text-neg mt-1">{erro}</p>}
    </div>
  )
}

export function largura(campo: CampoDefinicao): string {
  if (ehDecorativo(campo.tipo)) return 'col-span-12'
  const c = campo.colunas ?? 12
  return c <= 4 ? 'col-span-12 sm:col-span-4' : c <= 6 ? 'col-span-12 sm:col-span-6' : 'col-span-12'
}
