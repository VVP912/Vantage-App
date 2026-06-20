import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VANTAGE — Alternative Data Intelligence',
  description: 'What does the hedge fund know that you don\'t?',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
