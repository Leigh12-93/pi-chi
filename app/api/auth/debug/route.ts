import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    AUTH_SECRET: process.env.AUTH_SECRET ? `${process.env.AUTH_SECRET.length} chars, starts: ${process.env.AUTH_SECRET.substring(0, 4)}, ends: ${JSON.stringify(process.env.AUTH_SECRET.slice(-4))}` : 'MISSING',
    AUTH_URL: process.env.AUTH_URL || 'MISSING',
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ? `${process.env.GITHUB_CLIENT_ID.length} chars: ${JSON.stringify(process.env.GITHUB_CLIENT_ID)}` : 'MISSING',
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? `${process.env.GITHUB_CLIENT_SECRET.length} chars` : 'MISSING',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
  })
}
