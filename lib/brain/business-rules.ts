/* ─── Pi-Chi Business Rules — Single Source of Truth ──────────
 * Business definitions, pricing, and boundaries.
 * Code enforces these — not memories that can be misremembered.
 * ─────────────────────────────────────────────────────────── */

export interface BusinessDefinition {
  id: string
  name: string
  domain: string
  type: string
  pricing: string | null
  supabaseProjectId: string | null
  vercelProject: string | null
  codebase: string
}

export const BUSINESSES: readonly BusinessDefinition[] = [
  {
    id: 'cheapskips',
    name: 'CheapSkipBinsNearMe',
    domain: 'cheapskipbinsnearme.com.au',
    type: 'skip bin price comparison aggregator with AI chatbot',
    pricing: '$2 AUD per verified lead, no upfront fees, monthly invoicing',
    supabaseProjectId: 'pocoystpkrdmobplazhd',
    vercelProject: 'cheapskipbinsnearme',
    codebase: '~/pi-chi',
  },
  {
    id: 'aussiesms',
    name: 'AussieSMS',
    domain: 'aussiesms.com.au',
    type: 'SMS gateway SaaS service',
    pricing: null, // pricing TBD
    supabaseProjectId: null,
    vercelProject: null,
    codebase: '~/pi-chi-projects/aussiesms',
  },
  {
    id: 'bonkr',
    name: 'Bonkr',
    domain: 'bonkr.com.au',
    type: 'adult content platform',
    pricing: null,
    supabaseProjectId: 'unsqcfflbedqclgkuknq',
    vercelProject: 'bonkr-com-au',
    codebase: '~/pi-chi-projects/bonkr',
  },
] as const

/** Businesses Pi-Chi does NOT own and must NEVER touch */
export const NOT_OUR_BUSINESSES = [
  'binhireaustralia',
  'AWB',
  'adelaide-wheelie-bins',
  'adelaidewheeliebins',
  'navigate-your-ship',
] as const

/** Per-lead price in dollars — the one true pricing constant */
export const LEAD_PRICE_AUD = 2

export function getBusinessByDomain(domain: string): BusinessDefinition | undefined {
  const d = domain.toLowerCase().replace(/^www\./, '')
  return BUSINESSES.find(b => b.domain === d)
}

export function getBusinessById(id: string): BusinessDefinition | undefined {
  return BUSINESSES.find(b => b.id === id)
}

export function isOurBusiness(name: string): boolean {
  const lower = name.toLowerCase().replace(/[\s_-]/g, '')
  return BUSINESSES.some(b =>
    b.id === lower ||
    b.name.toLowerCase().replace(/[\s_-]/g, '') === lower ||
    b.domain.replace(/\./g, '') === lower.replace(/\./g, ''),
  )
}

export function isNotOurBusiness(name: string): boolean {
  const lower = name.toLowerCase().replace(/[\s_-]/g, '')
  return NOT_OUR_BUSINESSES.some(nob =>
    lower.includes(nob.toLowerCase().replace(/[\s_-]/g, '')),
  )
}

export function getPricingStatement(): string {
  return `$${LEAD_PRICE_AUD} AUD per verified lead, no upfront fees, monthly invoicing`
}
