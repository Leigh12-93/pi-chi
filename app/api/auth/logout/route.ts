import { NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'

export async function POST() {
  const baseUrl = (process.env.AUTH_URL || 'https://forge-six-chi.vercel.app').trim()
  const response = NextResponse.redirect(baseUrl)
  response.cookies.delete(COOKIE_NAME)
  return response
}
