import { loadBrainState, saveBrainState } from './lib/brain/brain-state'
import { runDeployPipeline } from './lib/brain/deploy-pipeline'
import { writeFileSync, readFileSync } from 'fs'

async function main() {
  console.log('[test] Loading brain state...')
  const state = await loadBrainState()

  const testFile = '/home/pi/pi-chi/lib/brain/deploy-types.ts'
  const original = readFileSync(testFile, 'utf-8')
  const stamp = new Date().toISOString()
  writeFileSync(testFile, original + '\n// deploy test: ' + stamp + '\n')

  console.log('[test] Added test comment to deploy-types.ts')
  console.log('[test] Running deploy pipeline...')

  const startMs = Date.now()
  try {
    const result = await runDeployPipeline(state, { piChiDir: '/home/pi/pi-chi' })

    if (result) {
      console.log('[test] === RESULT ===')
      console.log('[test] Outcome:', result.outcome)
      console.log('[test] Commit hash:', result.commitHash)
      console.log('[test] Change class:', result.changeClass)
      console.log('[test] Build time:', result.buildTimeMs, 'ms')
      console.log('[test] Type check time:', result.typeCheckTimeMs, 'ms')
      console.log('[test] Total duration:', Math.round(result.durationMs / 1000), 's')
      console.log('[test] Steps:')
      for (const s of result.steps) {
        const detail = s.detail ? ' - ' + s.detail.slice(0, 100) : ''
        console.log('  - ' + s.name + ': ' + s.outcome + ' (' + Math.round(s.durationMs / 1000) + 's)' + detail)
      }
      if (result.fixAttempts.length > 0) {
        console.log('[test] Fix attempts:', result.fixAttempts.length)
      }
      if (result.healthResults.length > 0) {
        console.log('[test] Health results:', result.healthResults.length)
      }
      if (result.rollbackLevel) {
        console.log('[test] Rollback level:', result.rollbackLevel)
      }
      if (result.lessons.length > 0) {
        console.log('[test] Lessons:', JSON.stringify(result.lessons))
      }
    } else {
      console.log('[test] No changes detected (null result)')
    }

    await saveBrainState(state)
    console.log('[test] State saved with deploy history')
    console.log('[test] Total wall time:', Math.round((Date.now() - startMs) / 1000), 's')
  } catch (err) {
    console.error('[test] Pipeline error:', err)
    writeFileSync(testFile, original)
    console.log('[test] Reverted test change')
  }
}

main().catch(console.error)
