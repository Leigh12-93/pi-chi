import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('[forge] Missing Supabase credentials — project persistence disabled')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Type definitions for our tables
export interface ForgeProject {
  id: string
  name: string
  github_username: string
  description: string
  framework: string
  github_repo_url: string | null
  vercel_url: string | null
  vercel_project_id: string | null
  memory: Record<string, string> | null
  last_deploy_at: string | null
  created_at: string
  updated_at: string
}

export interface ForgeProjectFile {
  id: string
  project_id: string
  path: string
  content: string
  created_at: string
  updated_at: string
}

export interface ForgeChatMessage {
  id: string
  project_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_invocations: unknown
  created_at: string
}

export interface ForgeDeployment {
  id: string
  project_id: string
  provider: 'vercel' | 'github'
  url: string | null
  status: 'pending' | 'building' | 'ready' | 'error'
  metadata: Record<string, unknown>
  created_at: string
}
