import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'OPTIC-SHIELD Dashboard',
  description: 'Enterprise Wildlife Detection & Monitoring System',
  keywords: ['wildlife', 'detection', 'monitoring', 'AI', 'computer vision'],
  authors: [{ name: 'OPTIC-SHIELD Team' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#0f172a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
