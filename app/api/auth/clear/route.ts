import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const all = cookieStore.getAll()

  // Delete all auth-related cookies
  const response = NextResponse.redirect(new URL('/', 'https://forge-six-chi.vercel.app'))
  for (const cookie of all) {
    response.cookies.delete(cookie.name)
  }

  return response
}
