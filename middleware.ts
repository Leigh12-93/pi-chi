import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const path = request.nextUrl.pathname

  // Build CSP directives
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.github.com https://*.supabase.co https://api.vercel.com https://registry.npmjs.org https://api.npmjs.org https://api.unsplash.com https://api.anthropic.com https://*.v0.dev https://cdn.jsdelivr.net`,
    `frame-src 'self' blob: https://*.v0.dev https://*.vercel.app https://*.vusercontent.net https://*.webcontainer.io https://*.webcontainer-api.io https://*.local-credentialless.webcontainer.io https://*.local-credentialless.webcontainer-api.io https://stackblitz.com https://*.stackblitz.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
  ].join('; ')

  const response = NextResponse.next()
  response.headers.set('x-nonce', nonce)
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  // Route-scoped cross-origin isolation for WebContainer (SharedArrayBuffer)
  // ONLY workspace/shared routes get isolation headers.
  // Auth routes stay clean so GitHub OAuth redirects work.
  if (path === '/' || path.startsWith('/shared')) {
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
  }

  return response
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|icons/).*)',
  ],
}
