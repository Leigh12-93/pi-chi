import { handlers } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

async function wrappedGET(req: NextRequest) {
  const url = new URL(req.url)
  const isCallback = url.pathname.includes('/callback/')

  if (isCallback) {
    console.log('[Auth Callback] Incoming:', {
      hasCode: url.searchParams.has('code'),
      codeLength: url.searchParams.get('code')?.length,
      hasState: url.searchParams.has('state'),
      cookies: req.cookies.getAll().map(c => c.name),
    })
  }

  try {
    const response = await handlers.GET(req)

    if (isCallback && response) {
      const location = response.headers?.get('location') || ''
      const isError = location.includes('/error')

      console.log('[Auth Callback] Response:', {
        status: response.status,
        location,
        isError,
      })

      // If callback redirects to error page, show the error instead of silently redirecting
      if (isError) {
        const errorUrl = new URL(location, req.url)
        return NextResponse.json({
          debug: 'Auth callback failed — redirected to error page',
          errorRedirect: location,
          errorType: errorUrl.searchParams.get('error'),
          incomingCookies: req.cookies.getAll().map(c => c.name),
          hasCode: url.searchParams.has('code'),
          hasState: url.searchParams.has('state'),
        }, { status: 500 })
      }
    }

    return response
  } catch (error: any) {
    console.error('[Auth Error]', error.message)
    if (isCallback) {
      return NextResponse.json({
        debug: 'Auth callback threw an exception',
        error: error.message,
        stack: error.stack?.substring(0, 800),
      }, { status: 500 })
    }
    throw error
  }
}

export const GET = wrappedGET
export const POST = handlers.POST
