import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // Build CSP directives
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`, // Tailwind + Monaco CDN
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.github.com https://*.supabase.co https://api.vercel.com https://registry.npmjs.org https://api.npmjs.org https://api.unsplash.com https://api.anthropic.com https://*.v0.dev https://cdn.jsdelivr.net`,
    `frame-src 'self' blob: https://*.v0.dev https://*.vercel.app https://*.vusercontent.net`, // Preview + v0 sandbox
    `object-src 'none'`,
    `base-uri 'self'`,
  ].join('; ')

  const response = NextResponse.next()
  response.headers.set('x-nonce', nonce)
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  return response
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}
