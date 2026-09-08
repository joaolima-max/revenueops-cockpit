import type { Metadata } from 'next'
import { Onest } from 'next/font/google'
import './globals.css'

/** Fonte da marca — a mesma carregada pelo site institucional. */
const onest = Onest({
  variable: '--font-onest',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Bass Pago · RevOps',
  description: 'Revenue Operations Platform — Bass Pago',
  icons: { icon: '/icon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${onest.variable} h-full`}>
      <body className="h-full bg-ink text-fg font-sans antialiased">{children}</body>
    </html>
  )
}
