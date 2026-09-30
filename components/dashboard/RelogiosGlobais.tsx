'use client'

import { useEffect, useState } from 'react'

/**
 * HORÁRIOS GLOBAIS — as quatro praças que a operação acompanha.
 *
 * Os offsets NÃO são fixados em código: cada horário é formatado com o
 * `timeZone` real da IANA, então horário de verão, mudanças de fuso e anos
 * bissextos são resolvidos pelo runtime. Um offset numérico gravado aqui
 * estaria errado duas vezes por ano em Madri e Nova York.
 */
export const PRACAS = [
  { regiao: 'LATAM', cidade: 'São Paulo', tz: 'America/Sao_Paulo', curto: 'SP' },
  { regiao: 'AMÉRICA', cidade: 'New York', tz: 'America/New_York', curto: 'NY' },
  { regiao: 'ÁSIA', cidade: 'Hong Kong', tz: 'Asia/Hong_Kong', curto: 'HK' },
  { regiao: 'EUROPA', cidade: 'Madrid', tz: 'Europe/Madrid', curto: 'MAD' },
] as const

const FORMATADORES = PRACAS.map((p) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: p.tz,
  }),
)

/** "--:--" até montar: o relógio do servidor não é o do usuário. */
const VAZIO = PRACAS.map(() => '--:--')

export default function RelogiosGlobais() {
  const [horas, setHoras] = useState<string[]>(VAZIO)

  // Só depois de montar, e por isso o estado começa vazio: renderizar a hora
  // no servidor produziria HTML diferente do que o cliente pinta um segundo
  // depois, que é exatamente o erro de hidratação.
  useEffect(() => {
    const tick = () => {
      const agora = new Date()
      setHoras(FORMATADORES.map((f) => f.format(agora)))
    }
    tick()
    // Minuto a minuto basta: o relógio mostra HH:MM. Um intervalo de 1s
    // redesenharia 60× para o mesmo texto.
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      {/* Desktop: as quatro praças, em linha. */}
      <div className="hidden xl:flex items-stretch rounded-lg border border-line bg-[var(--bp-hover)] overflow-hidden"
        aria-label="Horários globais">
        {PRACAS.map((p, i) => (
          <div key={p.tz}
            className="px-3 py-1 flex flex-col justify-center border-l border-line first:border-l-0">
            <span className="t-label text-subtle/70 leading-none">{p.regiao}</span>
            <span className="flex items-baseline gap-1.5 mt-1">
              <span className="t-label text-muted leading-none">{p.cidade}</span>
              <span className="t-mono text-fg tabular-nums leading-none">{horas[i]}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Mobile e telas médias: a mesma informação, compacta — sigla + hora,
          sem a linha de região, que é o que polui a barra no estreito. */}
      <div className="xl:hidden flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border border-line bg-[var(--bp-hover)] overflow-x-auto"
        aria-label="Horários globais">
        {PRACAS.map((p, i) => (
          <span key={p.tz} className="flex items-baseline gap-1 whitespace-nowrap"
            title={`${p.regiao} · ${p.cidade}`}>
            <span className="t-label text-subtle">{p.curto}</span>
            <span className="t-mono text-fg tabular-nums">{horas[i]}</span>
          </span>
        ))}
      </div>
    </>
  )
}
