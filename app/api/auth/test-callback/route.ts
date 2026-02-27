import { NextResponse } from 'next/server'

// This endpoint captures what the callback receives to debug OAuth flow
export async function GET(req: Request) {
  const url = new URL(req.url)
  return NextResponse.json({
    searchParams: Object.fromEntries(url.searchParams),
    hasCode: url.searchParams.has('code'),
    hasState: url.searchParams.has('state'),
    hasError: url.searchParams.has('error'),
    error: url.searchParams.get('error'),
    errorDescription: url.searchParams.get('error_description'),
  })
}
