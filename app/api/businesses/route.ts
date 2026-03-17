import { NextResponse } from 'next/server'
import { VERCEL_TOKEN, VERCEL_TEAM } from '@/lib/vercel'
import { cheapskipSupabase } from '@/lib/cheapskip-supabase'

/* ─── Types ──────────────────────────────────────── */

export interface BusinessMetrics {
  id: string
  name: string
  domain: string
  health: 'healthy' | 'warning' | 'critical' | 'unknown'
  lastDeployAt: string | null
  deployStatus: string | null
  lastCommitAt: string | null
  lastCommitMessage: string | null
  vercelProjectId: string | null
  httpStatus: number | null
  responseTimeMs: number | null
  siteUp: boolean | null
  leadCount: number | null
  leadCountToday: number | null
}

/* ─── Business registry ──────────────────────────── */

interface BusinessConfig {
  id: string
  name: string
  domain: string
  vercelProject: string
  githubRepo: string
}

const BUSINESS_CONFIGS: BusinessConfig[] = [
{
    id: 'bonkr',
    name: 'Bonkr',
    domain: 'bonkr.com.au',
    vercelProject: 'bonkr',
    githubRepo: 'Bonkr',
  },
  {
    id: 'aussiesms',
    name: 'AussieSMS Gateway',
    domain: 'aussiesms.vercel.app',
    vercelProject: 'sms-gateway-web',
    githubRepo: 'sms-gateway-web',
  },
  {
    id: 'cheapskips',
    name: 'Bin Hire Australia',
    domain: 'binhireaustralia.com.au',
    vercelProject: 'cheapskipbinsnearme',
    githubRepo: 'cheapskipbinsnearme',
  },
  {
    id: 'pichi',
    name: 'Pi-Chi',
    domain: 'pi-chi.vercel.app',
    vercelProject: 'pi-chi',
    githubRepo: 'pi-chi',
  },
]

/* ─── In-memory cache ────────────────────────────── */

let cachedResponse: BusinessMetrics[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60_000 // 60 seconds

/* ─── Health logic ───────────────────────────────── */

function computeHealth(
  deployAt: string | null,
  deployStatus: string | null,
  siteUp: boolean | null,
): BusinessMetrics['health'] {
  // Site is actively down — critical regardless of deploy age
  if (siteUp === false) return 'critical'

  if (!deployAt) return 'unknown'

  // Failed or errored deploys are critical
  if (deployStatus === 'ERROR' || deployStatus === 'CANCELED') return 'critical'

  const age = Date.now() - new Date(deployAt).getTime()
  const days = age / (1000 * 60 * 60 * 24)

  if (days <= 7) return 'healthy'
  if (days <= 30) return 'warning'
  return 'critical'
}

/* ─── HTTP: health check ─────────────────────────── */

async function checkSiteHealth(
  domain: string,
): Promise<{ httpStatus: number | null; responseTimeMs: number | null; siteUp: boolean | null }> {
  const url = `https://${domain}`
  const start = Date.now()

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5_000),
      redirect: 'follow',
    })
    const responseTimeMs = Date.now() - start
    const httpStatus = res.status
    const siteUp = httpStatus >= 200 && httpStatus < 500
    return { httpStatus, responseTimeMs, siteUp }
  } catch {
    return { httpStatus: null, responseTimeMs: null, siteUp: false }
  }
}

/* ─── Vercel: fetch latest deploy ────────────────── */

async function fetchLatestDeploy(
  projectName: string,
  token: string,
): Promise<{ deployAt: string | null; status: string | null; projectId: string | null }> {
  const teamParam = VERCEL_TEAM ? `&teamId=${VERCEL_TEAM}` : ''
  const url = `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectName)}&limit=1&target=production${teamParam}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    // Try by project name lookup instead
    const projUrl = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}${teamParam ? `?${teamParam.slice(1)}` : ''}`
    const projRes = await fetch(projUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })

    if (!projRes.ok) return { deployAt: null, status: null, projectId: null }

    const proj = await projRes.json()
    const projectId = proj.id

    // Retry with actual project ID
    const retryUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1&target=production${teamParam}`
    const retryRes = await fetch(retryUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })

    if (!retryRes.ok) return { deployAt: null, status: null, projectId }

    const retryData = await retryRes.json()
    const deploy = retryData.deployments?.[0]
    if (!deploy) return { deployAt: null, status: null, projectId }

    return {
      deployAt: deploy.createdAt ? new Date(deploy.createdAt).toISOString() : null,
      status: deploy.readyState || deploy.state || null,
      projectId,
    }
  }

  const data = await res.json()
  const deploy = data.deployments?.[0]
  if (!deploy) return { deployAt: null, status: null, projectId: null }

  return {
    deployAt: deploy.createdAt ? new Date(deploy.createdAt).toISOString() : null,
    status: deploy.readyState || deploy.state || null,
    projectId: deploy.projectId || null,
  }
}

/* ─── GitHub: fetch latest commit ────────────────── */

async function fetchLatestCommit(
  repo: string,
  token: string,
): Promise<{ commitAt: string | null; message: string | null }> {
  const url = `https://api.github.com/repos/Leigh12-93/${repo}/commits?per_page=1`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) return { commitAt: null, message: null }

  const data = await res.json()
  const commit = Array.isArray(data) ? data[0] : null
  if (!commit) return { commitAt: null, message: null }

  return {
    commitAt: commit.commit?.author?.date || commit.commit?.committer?.date || null,
    message: commit.commit?.message?.split('\n')[0] || null,
  }
}

/* ─── CheapSkip: fetch lead counts ────────────────── */

async function fetchLeadCounts(): Promise<{ total: number; today: number }> {
  try {
    // Total leads (exclude test entries)
    const { count: total } = await cheapskipSupabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'test')

    // Today's leads (ACST = UTC+9:30)
    const now = new Date()
    const acstOffset = 9.5 * 60 * 60 * 1000
    const acstNow = new Date(now.getTime() + acstOffset)
    const todayStart = new Date(acstNow)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayStartUtc = new Date(todayStart.getTime() - acstOffset)

    const { count: today } = await cheapskipSupabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'test')
      .gte('created_at', todayStartUtc.toISOString())

    return { total: total ?? 0, today: today ?? 0 }
  } catch {
    return { total: 0, today: 0 }
  }
}

/* ─── GET /api/businesses ────────────────────────── */

export async function GET() {
  // Return cached response if fresh
  if (cachedResponse && Date.now() - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json(cachedResponse)
  }

  const vercelToken = VERCEL_TOKEN
  const githubToken = (process.env.GITHUB_TOKEN || '').trim()

  // Fetch lead counts in parallel with business metrics
  const leadCountsPromise = fetchLeadCounts()

  const results: BusinessMetrics[] = await Promise.all(
    BUSINESS_CONFIGS.map(async (biz) => {
      let deployAt: string | null = null
      let deployStatus: string | null = null
      let vercelProjectId: string | null = null
      let commitAt: string | null = null
      let commitMessage: string | null = null
      let httpStatus: number | null = null
      let responseTimeMs: number | null = null
      let siteUp: boolean | null = null

      // Run Vercel, GitHub, and HTTP health check in parallel
      const [vercelResult, commitResult, healthResult] = await Promise.allSettled([
        vercelToken ? fetchLatestDeploy(biz.vercelProject, vercelToken) : Promise.resolve(null),
        githubToken ? fetchLatestCommit(biz.githubRepo, githubToken) : Promise.resolve(null),
        checkSiteHealth(biz.domain),
      ])

      if (vercelResult.status === 'fulfilled' && vercelResult.value) {
        deployAt = vercelResult.value.deployAt
        deployStatus = vercelResult.value.status
        vercelProjectId = vercelResult.value.projectId
      }

      if (commitResult.status === 'fulfilled' && commitResult.value) {
        commitAt = commitResult.value.commitAt
        commitMessage = commitResult.value.message
      }

      if (healthResult.status === 'fulfilled') {
        httpStatus = healthResult.value.httpStatus
        responseTimeMs = healthResult.value.responseTimeMs
        siteUp = healthResult.value.siteUp
      }

      return {
        id: biz.id,
        name: biz.name,
        domain: biz.domain,
        health: computeHealth(deployAt, deployStatus, siteUp),
        lastDeployAt: deployAt,
        deployStatus: deployStatus,
        lastCommitAt: commitAt,
        lastCommitMessage: commitMessage,
        vercelProjectId: vercelProjectId,
        httpStatus,
        responseTimeMs,
        siteUp,
        leadCount: null as number | null,
        leadCountToday: null as number | null,
      }
    }),
  )

  // Attach lead counts to the cheapskips business
  const leadCounts = await leadCountsPromise
  const cheapskips = results.find(r => r.id === 'cheapskips')
  if (cheapskips) {
    cheapskips.leadCount = leadCounts.total
    cheapskips.leadCountToday = leadCounts.today
  }

  // Cache the response
  cachedResponse = results
  cacheTimestamp = Date.now()

  return NextResponse.json(results)
}
