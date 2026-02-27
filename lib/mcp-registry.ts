/**
 * MCP Server Registry
 *
 * Known MCP servers that users can connect to.
 * These are templates — users provide their own URLs and credentials.
 *
 * Only includes servers that use HTTP transport (compatible with Vercel serverless).
 * stdio-based servers (filesystem, git, etc.) can't run on serverless.
 */

import type { MCPServerConfig } from './mcp-client'

export interface MCPServerTemplate {
  id: string
  name: string
  description: string
  urlTemplate: string      // Template URL — user fills in their details
  urlPlaceholder: string   // Placeholder text for the URL input
  authType: 'bearer' | 'header' | 'none'
  authHint?: string        // Hint for what credential to use
  tags: string[]
  docsUrl?: string
}

export const MCP_SERVER_TEMPLATES: MCPServerTemplate[] = [
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Database operations, auth management, storage, and real-time subscriptions via Supabase MCP',
    urlTemplate: 'https://{project-ref}.supabase.co/functions/v1/mcp',
    urlPlaceholder: 'https://your-project.supabase.co/functions/v1/mcp',
    authType: 'bearer',
    authHint: 'Supabase Service Role Key',
    tags: ['database', 'auth', 'storage'],
    docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp',
  },
  {
    id: 'neon',
    name: 'Neon Postgres',
    description: 'Serverless Postgres with branching, schema management, and SQL execution',
    urlTemplate: 'https://mcp.neon.tech/v1',
    urlPlaceholder: 'https://mcp.neon.tech/v1',
    authType: 'bearer',
    authHint: 'Neon API Key',
    tags: ['database', 'postgres'],
    docsUrl: 'https://neon.tech/docs/ai/mcp',
  },
  {
    id: 'upstash',
    name: 'Upstash Redis',
    description: 'Serverless Redis operations — cache, rate limiting, pub/sub',
    urlTemplate: 'https://mcp.upstash.com',
    urlPlaceholder: 'https://mcp.upstash.com',
    authType: 'bearer',
    authHint: 'Upstash API Key',
    tags: ['database', 'redis', 'cache'],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Workers, KV, R2 storage, D1 database, and DNS management',
    urlTemplate: 'https://mcp.cloudflare.com',
    urlPlaceholder: 'https://mcp.cloudflare.com',
    authType: 'bearer',
    authHint: 'Cloudflare API Token',
    tags: ['hosting', 'storage', 'dns'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payment processing, subscriptions, invoicing, and customer management',
    urlTemplate: 'https://mcp.stripe.com',
    urlPlaceholder: 'https://mcp.stripe.com',
    authType: 'bearer',
    authHint: 'Stripe Secret Key (sk_live_... or sk_test_...)',
    tags: ['payments', 'billing'],
  },
  {
    id: 'resend',
    name: 'Resend',
    description: 'Transactional email sending, templates, and domain management',
    urlTemplate: 'https://mcp.resend.com',
    urlPlaceholder: 'https://mcp.resend.com',
    authType: 'bearer',
    authHint: 'Resend API Key',
    tags: ['email', 'communication'],
  },
  {
    id: 'custom',
    name: 'Custom MCP Server',
    description: 'Connect to any MCP-compatible server using HTTP transport',
    urlTemplate: '',
    urlPlaceholder: 'https://your-server.com/mcp',
    authType: 'none',
    tags: ['custom'],
  },
]

/** Server categories for UI grouping */
export const MCP_CATEGORIES: Record<string, string[]> = {
  'Database & Storage': ['supabase', 'neon', 'upstash'],
  'Infrastructure': ['cloudflare'],
  'Business': ['stripe', 'resend'],
  'Custom': ['custom'],
}

/** Get templates by tag */
export function getTemplatesByTag(tag: string): MCPServerTemplate[] {
  return MCP_SERVER_TEMPLATES.filter(t => t.tags.includes(tag))
}

/** Create a server config from a template + user input */
export function createServerFromTemplate(
  template: MCPServerTemplate,
  url: string,
  token?: string,
): MCPServerConfig {
  const config: MCPServerConfig = {
    id: `${template.id}-${Date.now()}`,
    name: template.name,
    description: template.description,
    url,
    enabled: true,
    tags: template.tags,
  }

  if (template.authType === 'bearer' && token) {
    config.auth = { type: 'bearer', token }
  } else if (template.authType === 'header' && token) {
    config.auth = { type: 'header', headerName: 'x-api-key', headerValue: token }
  }

  return config
}
