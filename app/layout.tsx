import type { Metadata } from 'next'
import { Inter, Inter_Tight } from 'next/font/google'
import './globals.css'
import ThemeProvider, { themeBootstrap } from '@/components/theme/ThemeProvider'

/**
 * PAREAMENTO TIPOGRÁFICO
 * Inter Tight — títulos, KPIs e todo número financeiro (variante estreita).
 * Inter — corpo, tabelas, labels, navegação e formulários.
 */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Bass Pago · RevOps',
  description: 'Revenue Operations Platform — Bass Pago',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${interTight.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Antes da primeira pintura: evita o flash de tema errado. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="h-full bg-ink text-fg font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
