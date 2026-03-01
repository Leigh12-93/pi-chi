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

// ─── AES-GCM token encryption ────────────────────────────────
// Derives a 256-bit AES-GCM key from AUTH_SECRET via SHA-256.
// Encrypted format: hex(iv):hex(ciphertext) where iv is 12 bytes.

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.digest('SHA-256', SECRET)
  return crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes.buffer as ArrayBuffer
}

export async function encryptToken(token: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(token)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return `${bufToHex(iv.buffer as ArrayBuffer)}:${bufToHex(ciphertext)}`
}

export async function decryptToken(encrypted: string): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(':')
  if (!ivHex || !ciphertextHex) throw new Error('Invalid encrypted token format')
  const key = await getEncryptionKey()
  const iv = hexToBuf(ivHex)
  const ciphertext = hexToBuf(ciphertextHex)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(decrypted)
}

// ─── Session types and functions ─────────────────────────────

export interface ForgeSession {
  user: {
    name: string
    email: string
    image: string
  }
  accessToken: string
  githubUsername: string
}

/** JWT payload stores encrypted token, not plaintext */
interface JWTPayload {
  user: ForgeSession['user']
  encryptedAccessToken: string
  githubUsername: string
}

export async function createSession(data: ForgeSession): Promise<string> {
  if (!authSecret) {
    throw new Error('Cannot create session: AUTH_SECRET is not configured')
  }
  const encryptedAccessToken = await encryptToken(data.accessToken)
  const payload: JWTPayload = {
    user: data.user,
    encryptedAccessToken,
    githubUsername: data.githubUsername,
  }
  return new SignJWT({ ...payload })
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
    const jwtData = payload as unknown as JWTPayload
    const accessToken = await decryptToken(jwtData.encryptedAccessToken)
    return {
      user: jwtData.user,
      accessToken,
      githubUsername: jwtData.githubUsername,
    }
  } catch {
    return null
  }
}

export { COOKIE_NAME }
