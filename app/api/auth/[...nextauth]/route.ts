import { handlers } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// Wrap the GET handler to log callback errors
async function wrappedGET(req: NextRequest) {
  const url = new URL(req.url)

  // If this is the callback, log what we receive
  if (url.pathname.includes('/callback/')) {
    console.log('[Auth Callback]', {
      pathname: url.pathname,
      hasCode: url.searchParams.has('code'),
      hasState: url.searchParams.has('state'),
      hasError: url.searchParams.has('error'),
      error: url.searchParams.get('error'),
      cookies: req.cookies.getAll().map(c => c.name),
    })
  }

  try {
    const response = await handlers.GET(req)

    // Log the response for callbacks
    if (url.pathname.includes('/callback/')) {
      const location = response?.headers?.get('location')
      console.log('[Auth Callback Response]', {
        status: response?.status,
        location: location?.substring(0, 200),
        setCookie: response?.headers?.get('set-cookie')?.substring(0, 100),
      })
    }

    return response
  } catch (error: any) {
    console.error('[Auth Handler Error]', error.message, error.stack?.substring(0, 500))
    // Return error details as JSON for debugging
    if (url.pathname.includes('/callback/')) {
      return NextResponse.json({
        error: 'Auth callback failed',
        message: error.message,
        stack: error.stack?.substring(0, 500),
      }, { status: 500 })
    }
    throw error
  }
}

export const GET = wrappedGET
export const POST = handlers.POST
