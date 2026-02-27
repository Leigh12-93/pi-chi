import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SECRET = new TextEncoder().encode((process.env.AUTH_SECRET || '').trim())
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
