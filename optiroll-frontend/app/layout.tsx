import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  metadataBase: new URL('https://optiroll.app'),

  title: {
    default: 'OptiRoll  Roll Cutting Optimisation',
    template: '%s | OptiRoll',
  },
  description:
    'OptiRoll is a professional roll-cutting optimisation platform for blinds manufacturers. Minimise fabric waste, auto-select roll widths, and generate cut maps for roller and zebra blinds  all in one place.',
  keywords: [
    'blinds manufacturing',
    'roll cutting optimisation',
    'fabric waste reduction',
    'roller blinds',
    'zebra blinds',
    'cut map generator',
    'bin packing',
    'work order management',
    'OptiRoll',
  ],
  authors: [{ name: 'OptiRoll' }],
  creator: 'OptiRoll',
  publisher: 'OptiRoll',
  applicationName: 'OptiRoll',
  category: 'Manufacturing Software',

  robots: {
    index: false,
    follow: false,
  },

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://optiroll.app',
    siteName: 'OptiRoll',
    title: 'OptiRoll  Roll Cutting Optimisation for Blinds Manufacturers',
    description:
      'Minimise fabric waste and generate precise cut maps for roller & zebra blinds. Smart roll-width selection, leftover reuse, and A3 PDF export.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'OptiRoll  Roll Cutting Optimisation',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'OptiRoll  Roll Cutting Optimisation',
    description:
      'Smart fabric cutting optimisation for blinds manufacturers. Reduce waste, reuse leftovers, export A3 cut maps.',
    images: ['/og-image.png'],
  },

  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  )
}
