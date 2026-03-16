import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Know Which Marketing Actually Works — For Australian Tradies',
  description: 'Quick 60-second survey. Help us build a dead-simple tool that tells tradies exactly which marketing brings them jobs and which to cancel.',
  openGraph: {
    title: 'Stop Wasting Money on Marketing That Doesn\'t Work',
    description: 'We\'re building a tool for Australian tradies. Take 60 seconds to help shape it.',
    type: 'website',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
