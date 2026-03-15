#!/usr/bin/env node
/**
 * Add API keys to pi_user_settings.global_env_vars
 * Scoped to github_username = 'Leigh12-93' ONLY.
 * Uses same AES-GCM encryption as Pi-Chi's lib/auth.ts
 *
 * All secrets are read from .env.local and scripts/.env.keys (both gitignored).
 * NEVER hardcode secrets in this file.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { webcrypto } from 'crypto'
const crypto = webcrypto

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

// ─── Load secrets from .env files ───

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const content = readFileSync(filePath, 'utf8')
  const vars = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    vars[key] = value
  }
  return vars
}

// Load from .env.local (main project env) and scripts/.env.keys (extra secrets)
const envLocal = loadEnvFile(resolve(PROJECT_ROOT, '.env.local'))
const envKeys = loadEnvFile(resolve(PROJECT_ROOT, 'scripts', '.env.keys'))
const allEnv = { ...envLocal, ...envKeys }

function requireEnv(key) {
  const val = allEnv[key]
  if (!val) {
    console.error(`Missing required env var: ${key}`)
    console.error(`Add it to .env.local or scripts/.env.keys`)
    process.exit(1)
  }
  return val.trim()
}

function optionalEnv(key) {
  return allEnv[key]?.trim() || ''
}

// ─── Config (from env) ───

const AUTH_SECRET = requireEnv('AUTH_SECRET')
const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

// ─── All API keys to store (values from env files) ───
const variables = [
  // AussieSMS Gateway
  { key: 'AUSSIESMS_API_KEY', value: optionalEnv('AUSSIESMS_API_KEY') },

  // Google Service Accounts
  { key: 'GOOGLE_SA_EMAIL_ACCOUNTS', value: optionalEnv('GOOGLE_SA_EMAIL_ACCOUNTS') },
  { key: 'GOOGLE_SA_EMAIL_MAIN', value: optionalEnv('GOOGLE_SA_EMAIL_MAIN') },

  // Email
  { key: 'ADMIN_EMAIL', value: optionalEnv('ADMIN_EMAIL') },
  { key: 'ADMIN_EMAIL_APP_PASSWORD', value: optionalEnv('ADMIN_EMAIL_APP_PASSWORD') },
].filter(v => v.value) // Remove any with empty values

// ─── AES-GCM encryption (mirrors lib/auth.ts) ───

async function encrypt(plaintext) {
  const subtle = crypto.subtle
  const secretBytes = new TextEncoder().encode(AUTH_SECRET)
  const keyMaterial = await subtle.digest('SHA-256', secretBytes)
  const key = await subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
  const ctHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `v1:${ivHex}:${ctHex}`
}

async function main() {
  if (variables.length === 0) {
    console.error('No API keys found. Add them to .env.local or scripts/.env.keys')
    process.exit(1)
  }

  console.log(`Encrypting ${variables.length} API keys for Leigh12-93...`)

  const encrypted = await encrypt(JSON.stringify(variables))
  console.log(`Encrypted payload: ${encrypted.length} chars`)

  // PATCH into pi_user_settings for Leigh12-93 ONLY
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pi_user_settings?github_username=eq.Leigh12-93`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ global_env_vars: encrypted }),
    }
  )

  if (res.ok) {
    console.log(`Done — saved ${variables.length} API keys to global_env_vars for Leigh12-93`)
    console.log('Keys stored:')
    variables.forEach(v => console.log(`  - ${v.key}: ${v.value.substring(0, 12)}...`))
  } else {
    const text = await res.text()
    console.error(`Failed: ${res.status} ${text}`)
  }
}

main().catch(console.error)
