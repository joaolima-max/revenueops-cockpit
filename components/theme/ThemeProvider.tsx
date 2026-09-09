'use client'

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

/** Chave única, compartilhada com o script anti-flash do layout. */
export const THEME_KEY = 'bp-theme'
const EVENTO = 'bp-theme-change'

interface Ctx { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }

const ThemeContext = createContext<Ctx>({ theme: 'dark', setTheme: () => {}, toggle: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

/* O <html data-theme> é a fonte da verdade — quem escreve nele é o script
   inline, antes da primeira pintura. Lemos de lá com useSyncExternalStore em
   vez de sincronizar por efeito: sem setState em effect, sem render em cascata. */
function subscribe(cb: () => void) {
  window.addEventListener(EVENTO, cb)
  return () => window.removeEventListener(EVENTO, cb)
}
function snapshot(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}
function snapshotServidor(): Theme {
  return 'dark'
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, snapshot, snapshotServidor)

  // Só depois de montar liberamos a transição de cor: sem isso o primeiro
  // paint animaria do tema errado para o certo.
  useEffect(() => {
    document.documentElement.classList.add('bp-theme-ready')
  }, [])

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t
    try { localStorage.setItem(THEME_KEY, t) } catch {}
    window.dispatchEvent(new Event(EVENTO))
  }, [])

  const toggle = useCallback(() => {
    setTheme(snapshot() === 'light' ? 'dark' : 'light')
  }, [setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Script anti-flash. Roda antes da primeira pintura: lê a preferência salva
 * (ou a do sistema) e carimba data-theme no <html>.
 */
export const themeBootstrap = `(function(){try{
var t=localStorage.getItem('${THEME_KEY}');
if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}
document.documentElement.dataset.theme=t;
}catch(e){document.documentElement.dataset.theme='dark'}})()`
