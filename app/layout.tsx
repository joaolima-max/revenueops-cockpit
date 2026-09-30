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

/**
 * FAVICON — derivado da LOGO OFICIAL, não de um desenho novo.
 *
 * `public/icon.png` é o símbolo "b" com o arco azul, recortado do próprio
 * arquivo da marca (`public/logo-bass-pago-original.png`, preservado). A
 * variante clara existe porque a tipografia da marca é cinza-escuro e
 * desapareceria numa aba em tema escuro; o arco azul é o mesmo nas duas.
 *
 * O ícone padrão do Next saiu, junto com os demais arquivos de exemplo.
 */
export const metadata: Metadata = {
  title: 'Bass Pago',
  description: 'Revenue Operations Platform — Bass Pago',
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '128x128', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark.png', type: 'image/png', sizes: '128x128', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.png', type: 'image/png', sizes: '128x128' },
    ],
    apple: '/icon.png',
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
