'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

/**
 * Casca do Cockpit: navegação + barra superior + área de conteúdo.
 * O padding e a largura máxima moram aqui — antes eram repetidos à mão
 * em 20 páginas como `min-h-screen bg-ink p-6`.
 */
export default function DashboardShell({
  role, userName, userEmail, children,
}: { role: string; userName: string; userEmail: string; children: React.ReactNode }) {
  // O drawer fecha no clique do link (onNavigate) e no overlay — sem efeito.
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-ink">
      <Sidebar
        role={role}
        userName={userName}
        userEmail={userEmail}
        open={open}
        onNavigate={() => setOpen(false)}
      />

      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[var(--bp-shell)] px-4 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
