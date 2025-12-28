import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers/Providers'
import { GlobalEffects } from '@/components/GlobalEffects'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'OPTIC-SHIELD Dashboard',
  description: 'Enterprise Wildlife Detection & Monitoring System',
  keywords: ['wildlife', 'detection', 'monitoring', 'AI', 'computer vision'],
  authors: [{ name: 'OPTIC-SHIELD Team' }],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased text-white selection:bg-nexus-accent selection:text-white`}>
        <Providers>
          {/* GLOBAL BACKDROP */}
          <div className="fixed inset-0 bg-background -z-50 transition-colors duration-300"></div>

          {/* DYNAMIC BACKGROUND EFFECTS */}
          <GlobalEffects />

          {children}
        </Providers>
      </body>
    </html>
  )
}
