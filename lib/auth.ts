import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const authSecret = (process.env.AUTH_SECRET || '').trim()
if (!authSecret && process.env.NODE_ENV === 'production') {
  console.error('[forge] FATAL: AUTH_SECRET is not set in production. Authentication is disabled.')
}
if (authSecret.length > 0 && authSecret.length < 32) {
  console.warn('[forge] AUTH_SECRET is shorter than 32 characters. This is insecure.')
}
const SECRET = new TextEncoder().encode(authSecret)
const COOKIE_NAME = 'forge-session'

export interface ForgeSession {
  user: {
    name: string
    email: string
    image: string
  }
  accessToken: string
  githubUsername: string
}

export async function createSession(data: ForgeSession): Promise<string> {
  if (!authSecret) {
    throw new Error('Cannot create session: AUTH_SECRET is not configured')
  }
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .sign(SECRET)
}

export async function getSession(): Promise<ForgeSession | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null

    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as ForgeSession
  } catch {
    return null
  }
}

export { COOKIE_NAME }
