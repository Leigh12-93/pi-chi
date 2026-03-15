import { NextResponse } from 'next/server'
import { VERCEL_TOKEN, VERCEL_TEAM } from '@/lib/vercel'

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
    name: 'CheapSkipBinsNearMe',
    domain: 'cheapskipbinsnearme.com.au',
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

function computeHealth(deployAt: string | null, deployStatus: string | null): BusinessMetrics['health'] {
  if (!deployAt) return 'unknown'

  // Failed or errored deploys are critical
  if (deployStatus === 'ERROR' || deployStatus === 'CANCELED') return 'critical'

  const age = Date.now() - new Date(deployAt).getTime()
  const days = age / (1000 * 60 * 60 * 24)

  if (days <= 7) return 'healthy'
  if (days <= 30) return 'warning'
  return 'critical'
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

/* ─── GET /api/businesses ────────────────────────── */

export async function GET() {
  // Return cached response if fresh
  if (cachedResponse && Date.now() - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json(cachedResponse)
  }

  const vercelToken = VERCEL_TOKEN
  const githubToken = (process.env.GITHUB_TOKEN || '').trim()

  const results: BusinessMetrics[] = await Promise.all(
    BUSINESS_CONFIGS.map(async (biz) => {
      let deployAt: string | null = null
      let deployStatus: string | null = null
      let vercelProjectId: string | null = null
      let commitAt: string | null = null
      let commitMessage: string | null = null

      // Fetch Vercel deploy info
      if (vercelToken) {
        try {
          const deploy = await fetchLatestDeploy(biz.vercelProject, vercelToken)
          deployAt = deploy.deployAt
          deployStatus = deploy.status
          vercelProjectId = deploy.projectId
        } catch {
          // Vercel fetch failed — health will be 'unknown'
        }
      }

      // Fetch GitHub commit info
      if (githubToken) {
        try {
          const commit = await fetchLatestCommit(biz.githubRepo, githubToken)
          commitAt = commit.commitAt
          commitMessage = commit.message
        } catch {
          // GitHub fetch failed — commit fields stay null
        }
      }

      return {
        id: biz.id,
        name: biz.name,
        domain: biz.domain,
        health: computeHealth(deployAt, deployStatus),
        lastDeployAt: deployAt,
        deployStatus: deployStatus,
        lastCommitAt: commitAt,
        lastCommitMessage: commitMessage,
        vercelProjectId: vercelProjectId,
      }
    }),
  )

  // Cache the response
  cachedResponse = results
  cacheTimestamp = Date.now()

  return NextResponse.json(results)
}
