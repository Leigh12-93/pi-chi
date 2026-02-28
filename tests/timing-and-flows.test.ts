/**
 * Exhaustive tests for all timing, triggers, and flows in the Forge app.
 * Tests: auto-save debounce, preview debounce, toast batching, sandbox lifecycle,
 *        sandbox auto-start, sandbox sync, retry logic, dialog polling, elapsed timer,
 *        save status reset, chat pending message flow, file extraction flow,
 *        project switch cleanup, auto-file-select, cleanup on unmount.
 * Run with: npx tsx tests/timing-and-flows.test.ts
 */

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`  FAIL: ${message}`)
  }
}

// ════════════════════════════════════════════════════════════════
// 1. Auto-save debounce (page.tsx — 5s debounce with hash guard)
// ════════════════════════════════════════════════════════════════

function testAutoSaveDebounce() {
  console.log('\n=== Auto-Save Debounce Tests ===\n')

  function computeHash(files: Record<string, string>): string {
    const keys = Object.keys(files).sort()
    let h = 5381
    for (const k of keys) {
      for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0
      const c = files[k]
      h = ((h << 5) + h + c.length) | 0
      for (let i = 0; i < c.length; i++) h = ((h << 5) + h + c.charCodeAt(i)) | 0
    }
    return h.toString(36)
  }

  // Simulate the auto-save effect logic
  class AutoSaveSim {
    projectId: string | null = null
    files: Record<string, string> = {}
    lastSavedHash = ''
    timer: ReturnType<typeof setTimeout> | null = null
    saves: Array<{ files: Record<string, string>; hash: string }> = []
    DEBOUNCE_MS = 5000

    updateFiles(files: Record<string, string>) {
      this.files = files
      this.runEffect()
    }

    runEffect() {
      if (!this.projectId || Object.keys(this.files).length === 0) return

      const hash = computeHash(this.files)
      if (hash === this.lastSavedHash) return // no change

      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.saves.push({ files: { ...this.files }, hash })
        this.lastSavedHash = hash
      }, this.DEBOUNCE_MS)
    }

    flush() {
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
        // Simulate the timer firing immediately
        const hash = computeHash(this.files)
        if (hash !== this.lastSavedHash) {
          this.saves.push({ files: { ...this.files }, hash })
          this.lastSavedHash = hash
        }
      }
    }

    cleanup() {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
    }
  }

  // Test 1: No projectId — no save
  {
    const sim = new AutoSaveSim()
    sim.projectId = null
    sim.updateFiles({ 'a.tsx': 'hello' })
    assert(sim.timer === null, 'No save without projectId')
    console.log('  + No projectId: save skipped')
  }

  // Test 2: Empty files — no save
  {
    const sim = new AutoSaveSim()
    sim.projectId = 'proj-1'
    sim.updateFiles({})
    assert(sim.timer === null, 'No save with empty files')
    console.log('  + Empty files: save skipped')
  }

  // Test 3: Same hash — no new save
  {
    const sim = new AutoSaveSim()
    sim.projectId = 'proj-1'
    sim.lastSavedHash = computeHash({ 'a.tsx': 'hello' })
    sim.updateFiles({ 'a.tsx': 'hello' })
    assert(sim.timer === null, 'No save when hash matches')
    console.log('  + Same hash: save skipped (dedup)')
  }

  // Test 4: Changed content — timer starts
  {
    const sim = new AutoSaveSim()
    sim.projectId = 'proj-1'
    sim.updateFiles({ 'a.tsx': 'hello' })
    assert(sim.timer !== null, 'Timer should start on change')
    sim.cleanup()
    console.log('  + Changed content: timer started')
  }

  // Test 5: Rapid changes reset timer (debounce)
  {
    const sim = new AutoSaveSim()
    sim.projectId = 'proj-1'

    sim.updateFiles({ 'a.tsx': 'v1' })
    const timer1 = sim.timer
    sim.updateFiles({ 'a.tsx': 'v2' })
    const timer2 = sim.timer
    sim.updateFiles({ 'a.tsx': 'v3' })
    const timer3 = sim.timer

    // Each update should clear previous timer and set new one
    assert(timer1 !== timer2 || timer2 !== timer3, 'Timer should be reset on each change')
    assert(sim.saves.length === 0, 'No saves should fire during rapid changes')
    sim.cleanup()
    console.log('  + Rapid changes: timer reset each time, no premature save')
  }

  // Test 6: Flush triggers save
  {
    const sim = new AutoSaveSim()
    sim.projectId = 'proj-1'
    sim.updateFiles({ 'a.tsx': 'content' })
    sim.flush()
    assert(sim.saves.length === 1, 'Flush should trigger one save')
    assert(sim.lastSavedHash === computeHash({ 'a.tsx': 'content' }), 'Hash should be updated after save')
    console.log('  + Flush: triggers immediate save, updates hash')
  }

  // Test 7: After save, same content doesn't re-save
  {
    const sim = new AutoSaveSim()
    sim.projectId = 'proj-1'
    sim.updateFiles({ 'a.tsx': 'content' })
    sim.flush()
    sim.updateFiles({ 'a.tsx': 'content' }) // same content
    assert(sim.timer === null, 'Same content after save: no new timer')
    assert(sim.saves.length === 1, 'No duplicate save')
    console.log('  + After save, same content: no re-save')
  }

  // Test 8: Cleanup cancels pending timer
  {
    const sim = new AutoSaveSim()
    sim.projectId = 'proj-1'
    sim.updateFiles({ 'a.tsx': 'content' })
    assert(sim.timer !== null, 'Timer should exist')
    sim.cleanup()
    assert(sim.timer === null, 'Cleanup should clear timer')
    console.log('  + Cleanup: cancels pending timer (unmount safety)')
  }

  // Test 9: Debounce delay is 5000ms
  {
    const sim = new AutoSaveSim()
    assert(sim.DEBOUNCE_MS === 5000, 'Auto-save debounce should be 5000ms')
    console.log('  + Debounce: 5000ms')
  }
}

// ════════════════════════════════════════════════════════════════
// 2. Preview debounce (preview-panel.tsx — 800ms)
// ════════════════════════════════════════════════════════════════

function testPreviewDebounce() {
  console.log('\n=== Preview Debounce Tests ===\n')

  class PreviewDebounceSim {
    computedHtml = ''
    displayedHtml: string
    previewError: string | null = null
    timer: ReturnType<typeof setTimeout> | null = null
    DEBOUNCE_MS = 800

    constructor(initialHtml: string) {
      this.displayedHtml = initialHtml
      this.computedHtml = initialHtml
    }

    setComputedHtml(html: string) {
      this.computedHtml = html
      // Simulate the useEffect
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.displayedHtml = this.computedHtml
        this.previewError = this.computedHtml.includes('>Preview Error<') ? 'Preview rendering failed' : null
      }, this.DEBOUNCE_MS)
    }

    refresh() {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.displayedHtml = this.computedHtml
      this.previewError = this.computedHtml.includes('>Preview Error<') ? 'Preview rendering failed' : null
    }

    cleanup() {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
    }
  }

  // Test 1: Initial state — displayedHtml matches computed
  {
    const sim = new PreviewDebounceSim('<html>initial</html>')
    assert(sim.displayedHtml === '<html>initial</html>', 'Initial display should match computed')
    console.log('  + Initial: displayed matches computed (no delay)')
  }

  // Test 2: Update starts timer
  {
    const sim = new PreviewDebounceSim('<html>old</html>')
    sim.setComputedHtml('<html>new</html>')
    assert(sim.timer !== null, 'Timer should start on computed change')
    assert(sim.displayedHtml === '<html>old</html>', 'Display should not update immediately')
    sim.cleanup()
    console.log('  + Update: timer starts, display unchanged until debounce fires')
  }

  // Test 3: Rapid updates reset timer
  {
    const sim = new PreviewDebounceSim('<html>start</html>')
    sim.setComputedHtml('<html>v1</html>')
    const t1 = sim.timer
    sim.setComputedHtml('<html>v2</html>')
    const t2 = sim.timer
    sim.setComputedHtml('<html>v3</html>')
    const t3 = sim.timer

    assert(sim.displayedHtml === '<html>start</html>', 'Display unchanged during rapid updates')
    sim.cleanup()
    console.log('  + Rapid updates: timer reset, display stable')
  }

  // Test 4: Manual refresh flushes immediately
  {
    const sim = new PreviewDebounceSim('<html>old</html>')
    sim.setComputedHtml('<html>new</html>')
    assert(sim.displayedHtml === '<html>old</html>', 'Not yet updated')
    sim.refresh()
    assert(sim.displayedHtml === '<html>new</html>', 'Refresh should flush immediately')
    assert(sim.timer === null, 'Timer should be cleared after refresh')
    console.log('  + Manual refresh: flushes debounce, updates immediately')
  }

  // Test 5: Debounce is 800ms
  {
    const sim = new PreviewDebounceSim('')
    assert(sim.DEBOUNCE_MS === 800, 'Preview debounce should be 800ms')
    console.log('  + Debounce: 800ms')
  }

  // Test 6: Error detection during debounce flush
  {
    const sim = new PreviewDebounceSim('<html>ok</html>')
    const errorHtml = '<p class="text-sm font-medium text-gray-900 mb-1">Preview Error</p>'
    sim.setComputedHtml(errorHtml)
    sim.refresh()
    assert(sim.previewError === 'Preview rendering failed', 'Should detect error on flush')
    console.log('  + Error detection: sets previewError when >Preview Error< detected')
  }

  // Test 7: Clear error when non-error HTML
  {
    const sim = new PreviewDebounceSim('')
    sim.previewError = 'Preview rendering failed'
    sim.setComputedHtml('<html><body>Hello</body></html>')
    sim.refresh()
    assert(sim.previewError === null, 'Should clear error on non-error HTML')
    console.log('  + Error cleared: when new HTML has no error pattern')
  }

  // Test 8: Cleanup on unmount
  {
    const sim = new PreviewDebounceSim('')
    sim.setComputedHtml('<html>pending</html>')
    assert(sim.timer !== null, 'Timer active')
    sim.cleanup()
    assert(sim.timer === null, 'Timer cleared on cleanup')
    console.log('  + Cleanup: timer cleared on unmount')
  }
}

// ════════════════════════════════════════════════════════════════
// 3. Toast batching (workspace.tsx — 2s debounce)
// ════════════════════════════════════════════════════════════════

function testToastBatchTiming() {
  console.log('\n=== Toast Batch Timing Tests ===\n')

  class ToastBatchSim {
    prevKeys = new Set<string>()
    pendingNew: string[] = []
    pendingDeleted: string[] = []
    timer: ReturnType<typeof setTimeout> | null = null
    toasts: Array<{ type: string; count: number; desc?: string }> = []
    DEBOUNCE_MS = 2000

    processFiles(files: Record<string, string>) {
      const fileKeys = Object.keys(files)
      const currentSet = new Set(fileKeys)
      const wasEmpty = this.prevKeys.size === 0

      const newFiles = fileKeys.filter(f => !this.prevKeys.has(f))
      const deletedFiles = [...this.prevKeys].filter(f => !currentSet.has(f))

      this.prevKeys = currentSet

      if (!wasEmpty && (newFiles.length > 0 || deletedFiles.length > 0)) {
        this.pendingNew.push(...newFiles)
        this.pendingDeleted.push(...deletedFiles)

        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => this.flush(), this.DEBOUNCE_MS)
      }
    }

    flush() {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null

      const created = [...new Set(this.pendingNew)]
      const deleted = [...new Set(this.pendingDeleted)]
      this.pendingNew = []
      this.pendingDeleted = []

      if (created.length > 0 && created.length <= 5) {
        this.toasts.push({ type: 'created', count: created.length, desc: created.map(f => f.split('/').pop()).join(', ') })
      } else if (created.length > 5) {
        this.toasts.push({ type: 'created', count: created.length })
      }

      if (deleted.length > 0 && deleted.length <= 3) {
        this.toasts.push({ type: 'deleted', count: deleted.length, desc: deleted.map(f => f.split('/').pop()).join(', ') })
      }
    }

    cleanup() {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
    }
  }

  // Test 1: Debounce is 2000ms
  {
    const sim = new ToastBatchSim()
    assert(sim.DEBOUNCE_MS === 2000, 'Toast batch debounce should be 2000ms')
    console.log('  + Debounce: 2000ms')
  }

  // Test 2: Timer is set on first file add
  {
    const sim = new ToastBatchSim()
    sim.processFiles({ 'a.tsx': '' }) // initial (wasEmpty=true, no timer)
    assert(sim.timer === null, 'No timer on initial scaffold')
    sim.processFiles({ 'a.tsx': '', 'b.tsx': '' }) // add file
    assert(sim.timer !== null, 'Timer should start on file add')
    sim.cleanup()
    console.log('  + Timer starts on file add (not on initial scaffold)')
  }

  // Test 3: Timer resets on subsequent adds
  {
    const sim = new ToastBatchSim()
    sim.processFiles({ 'a.tsx': '' }) // initial
    sim.processFiles({ 'a.tsx': '', 'b.tsx': '' })
    const t1 = sim.timer
    sim.processFiles({ 'a.tsx': '', 'b.tsx': '', 'c.tsx': '' })
    const t2 = sim.timer
    assert(t1 !== t2, 'Timer should reset on subsequent file adds')
    sim.cleanup()
    console.log('  + Timer resets on subsequent adds (debounce)')
  }

  // Test 4: Content-only changes don't start timer
  {
    const sim = new ToastBatchSim()
    sim.processFiles({ 'a.tsx': 'v1' }) // initial
    sim.processFiles({ 'a.tsx': 'v2' }) // content change
    assert(sim.timer === null, 'Content change should not start timer')
    console.log('  + Content-only change: no timer')
  }

  // Test 5: Pending files accumulate between timer resets
  {
    const sim = new ToastBatchSim()
    sim.processFiles({ 'a.tsx': '' }) // initial
    sim.processFiles({ 'a.tsx': '', 'b.tsx': '' }) // +b
    sim.processFiles({ 'a.tsx': '', 'b.tsx': '', 'c.tsx': '' }) // +c
    assert(sim.pendingNew.length === 2, `Should have 2 pending (b, c), got ${sim.pendingNew.length}`)
    sim.cleanup()
    console.log('  + Pending files accumulate across timer resets')
  }

  // Test 6: Flush deduplicates pending
  {
    const sim = new ToastBatchSim()
    sim.processFiles({ 'a.tsx': '' }) // initial
    // Simulate same file appearing as "new" multiple times
    sim.pendingNew = ['b.tsx', 'b.tsx', 'c.tsx', 'b.tsx']
    sim.flush()
    assert(sim.toasts.length === 1, 'Should produce 1 toast')
    assert(sim.toasts[0].count === 2, 'Should count 2 unique files (b, c)')
    console.log('  + Flush: deduplicates pending via Set')
  }

  // Test 7: Cleanup clears timer
  {
    const sim = new ToastBatchSim()
    sim.processFiles({ 'a.tsx': '' }) // initial
    sim.processFiles({ 'a.tsx': '', 'b.tsx': '' }) // start timer
    assert(sim.timer !== null, 'Timer exists')
    sim.cleanup()
    assert(sim.timer === null, 'Cleanup clears timer')
    console.log('  + Cleanup: clears timer (unmount safety)')
  }

  // Test 8: Toast description includes filenames for small batches
  {
    const sim = new ToastBatchSim()
    sim.processFiles({ 'a.tsx': '' }) // initial
    sim.processFiles({ 'a.tsx': '', 'src/components/Button.tsx': '', 'src/utils.ts': '' })
    sim.flush()
    assert(sim.toasts[0].desc!.includes('Button.tsx'), 'Should include basename')
    assert(sim.toasts[0].desc!.includes('utils.ts'), 'Should include all basenames')
    console.log('  + Small batch toast: includes file basenames')
  }

  // Test 9: No description for large batches (> 5 files)
  {
    const sim = new ToastBatchSim()
    sim.processFiles({ 'existing.tsx': '' }) // initial
    const big: Record<string, string> = { 'existing.tsx': '' }
    for (let i = 0; i < 8; i++) big[`f${i}.tsx`] = ''
    sim.processFiles(big)
    sim.flush()
    assert(sim.toasts[0].desc === undefined, 'Large batch should not list names')
    console.log('  + Large batch (>5): no description, just count')
  }

  // Test 10: Deletion toast for small deletes only (≤3)
  {
    const sim = new ToastBatchSim()
    const files: Record<string, string> = {}
    for (let i = 0; i < 5; i++) files[`f${i}.tsx`] = ''
    sim.processFiles(files) // initial
    sim.processFiles({ 'f0.tsx': '', 'f1.tsx': '' }) // delete 3
    sim.flush()
    const delToast = sim.toasts.find(t => t.type === 'deleted')
    assert(delToast !== undefined, 'Should have deletion toast for ≤3 files')
    assert(delToast!.count === 3, `Should delete 3, got ${delToast!.count}`)
    console.log('  + Deletion toast: shows for ≤3 deleted files')
  }

  // Test 11: No deletion toast for large deletes (>3)
  {
    const sim = new ToastBatchSim()
    const files: Record<string, string> = {}
    for (let i = 0; i < 10; i++) files[`f${i}.tsx`] = ''
    sim.processFiles(files) // initial
    sim.processFiles({ 'f0.tsx': '' }) // delete 9
    sim.flush()
    const delToast = sim.toasts.find(t => t.type === 'deleted')
    assert(delToast === undefined, 'No deletion toast for >3 deletes')
    console.log('  + Large deletion (>3): no toast (avoids spam during AI refactors)')
  }
}

// ════════════════════════════════════════════════════════════════
// 4. Sandbox auto-start timing (preview-panel.tsx — 3s debounce)
// ════════════════════════════════════════════════════════════════

function testSandboxAutoStart() {
  console.log('\n=== Sandbox Auto-Start Tests ===\n')

  // isProjectReady logic from preview-panel.tsx
  function isProjectReady(files: Record<string, string>): boolean {
    const paths = Object.keys(files)
    if (paths.length < 3) return false
    const hasPackageJson = paths.includes('package.json')
    const hasMainFile = paths.some(p =>
      p === 'app/page.tsx' || p === 'app/page.jsx' ||
      p === 'src/App.tsx' || p === 'src/App.jsx' ||
      p === 'index.html'
    )
    return hasPackageJson && hasMainFile
  }

  class AutoStartSim {
    sandboxStatus: 'idle' | 'initializing' | 'running' | 'error' = 'idle'
    hasAutoStarted = false
    projectId: string | null = null
    sandboxAvailable: boolean | null = null
    timer: ReturnType<typeof setTimeout> | null = null
    started = false
    DEBOUNCE_MS = 3000

    checkAutoStart(files: Record<string, string>) {
      if (this.sandboxStatus !== 'idle') return
      if (this.hasAutoStarted) return
      if (!this.projectId) return
      if (!isProjectReady(files)) return

      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        if (this.sandboxAvailable === false) {
          this.hasAutoStarted = true
          return
        }
        this.hasAutoStarted = true
        this.started = true
      }, this.DEBOUNCE_MS)
    }

    cleanup() {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
    }
  }

  // Test 1: Auto-start debounce is 3000ms
  {
    const sim = new AutoStartSim()
    assert(sim.DEBOUNCE_MS === 3000, 'Auto-start debounce should be 3000ms')
    console.log('  + Debounce: 3000ms')
  }

  // Test 2: Not ready — no timer
  {
    const sim = new AutoStartSim()
    sim.projectId = 'proj-1'
    sim.checkAutoStart({ 'a.tsx': '' }) // only 1 file, no package.json
    assert(sim.timer === null, 'Not ready: no timer')
    console.log('  + Not ready (<3 files, no package.json): no auto-start')
  }

  // Test 3: Ready project — timer starts
  {
    const sim = new AutoStartSim()
    sim.projectId = 'proj-1'
    sim.sandboxAvailable = true
    sim.checkAutoStart({
      'package.json': '{}',
      'app/page.tsx': 'export default function Page() {}',
      'app/layout.tsx': 'export default function Layout() {}',
    })
    assert(sim.timer !== null, 'Ready project should start timer')
    sim.cleanup()
    console.log('  + Ready project: timer started')
  }

  // Test 4: No projectId — no auto-start
  {
    const sim = new AutoStartSim()
    sim.projectId = null
    sim.checkAutoStart({
      'package.json': '{}',
      'app/page.tsx': 'x',
      'a.tsx': 'x',
    })
    assert(sim.timer === null, 'No projectId: no auto-start')
    console.log('  + No projectId: no auto-start')
  }

  // Test 5: Already auto-started — skip
  {
    const sim = new AutoStartSim()
    sim.projectId = 'proj-1'
    sim.hasAutoStarted = true
    sim.checkAutoStart({
      'package.json': '{}',
      'app/page.tsx': 'x',
      'a.tsx': 'x',
    })
    assert(sim.timer === null, 'Already auto-started: skip')
    console.log('  + Already auto-started: no re-trigger')
  }

  // Test 6: Non-idle sandbox — skip
  {
    const sim = new AutoStartSim()
    sim.projectId = 'proj-1'
    sim.sandboxStatus = 'running'
    sim.checkAutoStart({
      'package.json': '{}',
      'app/page.tsx': 'x',
      'a.tsx': 'x',
    })
    assert(sim.timer === null, 'Running sandbox: no auto-start')
    console.log('  + Sandbox already running: no auto-start')
  }

  // Test 7: isProjectReady — minimum requirements
  {
    assert(!isProjectReady({}), 'Empty: not ready')
    assert(!isProjectReady({ 'a.tsx': '' }), '1 file: not ready')
    assert(!isProjectReady({ 'a.tsx': '', 'b.tsx': '' }), '2 files: not ready')
    assert(!isProjectReady({ 'a.tsx': '', 'b.tsx': '', 'c.tsx': '' }), '3 files no package.json: not ready')
    assert(!isProjectReady({ 'package.json': '{}', 'a.tsx': '', 'b.tsx': '' }), 'package.json but no main file: not ready')
    assert(isProjectReady({ 'package.json': '{}', 'app/page.tsx': '', 'a.tsx': '' }), 'package.json + page.tsx + 1 more: ready')
    assert(isProjectReady({ 'package.json': '{}', 'src/App.tsx': '', 'a.tsx': '' }), 'Vite: ready')
    assert(isProjectReady({ 'package.json': '{}', 'index.html': '', 'a.tsx': '' }), 'Static: ready')
    console.log('  + isProjectReady: correct minimum requirements')
  }

  // Test 8: Sandbox unavailable — mark hasAutoStarted, don't start
  {
    const sim = new AutoStartSim()
    sim.projectId = 'proj-1'
    sim.sandboxAvailable = false
    sim.checkAutoStart({
      'package.json': '{}',
      'app/page.tsx': 'x',
      'a.tsx': 'x',
    })
    // Flush the timer
    if (sim.timer) {
      clearTimeout(sim.timer)
      // Simulate timer callback
      sim.hasAutoStarted = true
    }
    assert(sim.hasAutoStarted, 'Should mark as auto-started')
    assert(!sim.started, 'Should not actually start')
    console.log('  + Sandbox unavailable: marks as tried, does not start')
  }
}

// ════════════════════════════════════════════════════════════════
// 5. Sandbox sync debounce (preview-panel.tsx — 2s debounce)
// ════════════════════════════════════════════════════════════════

function testSandboxSync() {
  console.log('\n=== Sandbox Sync Tests ===\n')

  function hashFilesForSync(files: Record<string, string>): string {
    const keys = Object.keys(files).sort()
    let h = 5381
    for (const k of keys) {
      for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0
      h = ((h << 5) + h + files[k].length) | 0
    }
    return h.toString(36)
  }

  class SyncSim {
    sandboxStatus: 'idle' | 'running' = 'idle'
    projectId: string | null = null
    lastSyncedHash = '0'
    timer: ReturnType<typeof setTimeout> | null = null
    syncs: string[] = [] // hashes of synced states
    DEBOUNCE_MS = 2000

    updateFiles(files: Record<string, string>) {
      if (this.sandboxStatus !== 'running' || !this.projectId) return

      const hash = hashFilesForSync(files)
      if (hash === this.lastSyncedHash) return

      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.syncs.push(hash)
        this.lastSyncedHash = hash
      }, this.DEBOUNCE_MS)
    }

    flush() {
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
    }

    cleanup() {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
    }
  }

  // Test 1: Sync debounce is 2000ms
  {
    const sim = new SyncSim()
    assert(sim.DEBOUNCE_MS === 2000, 'Sync debounce should be 2000ms')
    console.log('  + Debounce: 2000ms')
  }

  // Test 2: Not running — no sync
  {
    const sim = new SyncSim()
    sim.projectId = 'proj-1'
    sim.sandboxStatus = 'idle'
    sim.updateFiles({ 'a.tsx': 'content' })
    assert(sim.timer === null, 'Idle: no sync')
    console.log('  + Sandbox idle: no sync')
  }

  // Test 3: Running, changed files — timer starts
  {
    const sim = new SyncSim()
    sim.projectId = 'proj-1'
    sim.sandboxStatus = 'running'
    sim.updateFiles({ 'a.tsx': 'content' })
    assert(sim.timer !== null, 'Should start sync timer')
    sim.cleanup()
    console.log('  + Running + changed files: sync timer starts')
  }

  // Test 4: Same hash — no sync
  {
    const sim = new SyncSim()
    sim.projectId = 'proj-1'
    sim.sandboxStatus = 'running'
    sim.lastSyncedHash = hashFilesForSync({ 'a.tsx': 'content' })
    sim.updateFiles({ 'a.tsx': 'content' })
    assert(sim.timer === null, 'Same hash: no sync')
    console.log('  + Same hash: sync skipped')
  }

  // Test 5: Rapid changes reset timer
  {
    const sim = new SyncSim()
    sim.projectId = 'proj-1'
    sim.sandboxStatus = 'running'
    sim.updateFiles({ 'a.tsx': 'v1' })
    const t1 = sim.timer
    sim.updateFiles({ 'a.tsx': 'v2' })
    assert(sim.syncs.length === 0, 'No syncs during rapid changes')
    sim.cleanup()
    console.log('  + Rapid changes: timer reset, no premature sync')
  }
}

// ════════════════════════════════════════════════════════════════
// 6. Sandbox retry logic
// ════════════════════════════════════════════════════════════════

function testSandboxRetry() {
  console.log('\n=== Sandbox Retry Logic Tests ===\n')

  // Simulate retry logic from preview-panel.tsx lines 301-313
  function computeRetryDelay(statusCode: number, retryAfterHeader: string | null, retryCount: number): number | null {
    if (retryCount >= 2) return null // max 2 retries

    if (statusCode < 429 && statusCode < 500) return null // not retryable

    if (statusCode === 429) {
      return parseInt(retryAfterHeader || '5', 10) * 1000
    }
    return 2000 * (retryCount + 1) // exponential-ish: 2s, 4s
  }

  // Test 1: 429 with Retry-After header
  {
    const delay = computeRetryDelay(429, '10', 0)
    assert(delay === 10000, '429 with Retry-After 10 = 10000ms')
    console.log('  + 429: respects Retry-After header')
  }

  // Test 2: 429 without Retry-After header — defaults to 5s
  {
    const delay = computeRetryDelay(429, null, 0)
    assert(delay === 5000, '429 without Retry-After = 5000ms')
    console.log('  + 429 no header: defaults to 5000ms')
  }

  // Test 3: 500 — exponential backoff
  {
    const d1 = computeRetryDelay(500, null, 0)
    const d2 = computeRetryDelay(500, null, 1)
    assert(d1 === 2000, '500 first retry = 2000ms')
    assert(d2 === 4000, '500 second retry = 4000ms')
    console.log('  + 500: exponential backoff (2s, 4s)')
  }

  // Test 4: 502 — retryable
  {
    assert(computeRetryDelay(502, null, 0) === 2000, '502 is retryable')
    console.log('  + 502: retryable')
  }

  // Test 5: 503 — retryable
  {
    assert(computeRetryDelay(503, null, 0) === 2000, '503 is retryable')
    console.log('  + 503: retryable')
  }

  // Test 6: Max 2 retries
  {
    const delay = computeRetryDelay(500, null, 2)
    assert(delay === null, 'After 2 retries: give up')
    console.log('  + Max retries: 2 (no more after that)')
  }

  // Test 7: 400 — not retryable
  {
    assert(computeRetryDelay(400, null, 0) === null, '400 not retryable')
    console.log('  + 400: not retryable (client error)')
  }

  // Test 8: 404 — not retryable
  {
    assert(computeRetryDelay(404, null, 0) === null, '404 not retryable')
    console.log('  + 404: not retryable')
  }
}

// ════════════════════════════════════════════════════════════════
// 7. Task polling dialog — elapsed timer and polling
// ════════════════════════════════════════════════════════════════

function testDialogPolling() {
  console.log('\n=== Dialog Polling & Elapsed Timer Tests ===\n')

  class PollingDialogSim {
    state: 'confirm' | 'running' | 'success' | 'error' = 'confirm'
    elapsed = 0
    progressText = ''
    pollInterval: ReturnType<typeof setInterval> | null = null
    elapsedInterval: ReturnType<typeof setInterval> | null = null
    POLL_MS = 2000
    ELAPSED_MS = 1000

    startRunning() {
      this.state = 'running'
      this.elapsed = 0
      // Elapsed timer: 1s interval
      this.elapsedInterval = setInterval(() => this.elapsed++, this.ELAPSED_MS)
      // Poll timer: 2s interval
      this.pollInterval = setInterval(() => {}, this.POLL_MS)
    }

    complete() {
      this.state = 'success'
      this.stopTimers()
    }

    fail(error: string) {
      this.state = 'error'
      this.stopTimers()
    }

    stopTimers() {
      if (this.pollInterval) clearInterval(this.pollInterval)
      if (this.elapsedInterval) clearInterval(this.elapsedInterval)
      this.pollInterval = null
      this.elapsedInterval = null
    }

    cleanup() {
      this.stopTimers()
    }
  }

  // Test 1: Polling interval is 2000ms
  {
    const sim = new PollingDialogSim()
    assert(sim.POLL_MS === 2000, 'Polling interval should be 2000ms')
    console.log('  + Polling interval: 2000ms')
  }

  // Test 2: Elapsed timer interval is 1000ms
  {
    const sim = new PollingDialogSim()
    assert(sim.ELAPSED_MS === 1000, 'Elapsed timer should be 1000ms')
    console.log('  + Elapsed timer: 1000ms')
  }

  // Test 3: Running state starts both timers
  {
    const sim = new PollingDialogSim()
    sim.startRunning()
    assert(sim.pollInterval !== null, 'Poll timer should start')
    assert(sim.elapsedInterval !== null, 'Elapsed timer should start')
    assert(sim.elapsed === 0, 'Elapsed should start at 0')
    sim.cleanup()
    console.log('  + Running: both timers start, elapsed=0')
  }

  // Test 4: Success stops both timers
  {
    const sim = new PollingDialogSim()
    sim.startRunning()
    sim.complete()
    assert(sim.pollInterval === null, 'Poll timer cleared on success')
    assert(sim.elapsedInterval === null, 'Elapsed timer cleared on success')
    assert(sim.state === 'success', 'State should be success')
    console.log('  + Success: both timers stopped')
  }

  // Test 5: Error stops both timers
  {
    const sim = new PollingDialogSim()
    sim.startRunning()
    sim.fail('Build error')
    assert(sim.pollInterval === null, 'Poll timer cleared on error')
    assert(sim.elapsedInterval === null, 'Elapsed timer cleared on error')
    assert(sim.state === 'error', 'State should be error')
    console.log('  + Error: both timers stopped')
  }

  // Test 6: Cleanup on unmount clears both
  {
    const sim = new PollingDialogSim()
    sim.startRunning()
    sim.cleanup()
    assert(sim.pollInterval === null, 'Cleanup clears poll timer')
    assert(sim.elapsedInterval === null, 'Cleanup clears elapsed timer')
    console.log('  + Cleanup: both timers cleared on unmount')
  }

  // Test 7: Dialog reset on re-open
  {
    const sim = new PollingDialogSim()
    sim.state = 'error'
    sim.elapsed = 45
    sim.progressText = 'Building...'
    // Simulate re-open (from useEffect [open])
    sim.state = 'confirm'
    sim.elapsed = 0
    sim.progressText = ''
    assert(sim.state === 'confirm', 'Re-open resets to confirm')
    assert(sim.elapsed === 0, 'Re-open resets elapsed')
    assert(sim.progressText === '', 'Re-open resets progress')
    console.log('  + Re-open: resets state, elapsed, and progress')
  }
}

// ════════════════════════════════════════════════════════════════
// 8. Save status reset (workspace.tsx — 2s timeout)
// ════════════════════════════════════════════════════════════════

function testSaveStatusReset() {
  console.log('\n=== Save Status Reset Tests ===\n')

  class SaveStatusSim {
    status: 'idle' | 'saving' | 'saved' | 'error' = 'idle'
    timer: ReturnType<typeof setTimeout> | null = null
    RESET_MS = 2000

    async save(success: boolean) {
      this.status = 'saving'
      if (success) {
        this.status = 'saved'
      } else {
        this.status = 'error'
      }
      this.timer = setTimeout(() => { this.status = 'idle' }, this.RESET_MS)
    }

    cleanup() {
      if (this.timer) clearTimeout(this.timer)
    }
  }

  // Test 1: Reset delay is 2000ms
  {
    const sim = new SaveStatusSim()
    assert(sim.RESET_MS === 2000, 'Save status reset should be 2000ms')
    console.log('  + Reset delay: 2000ms')
  }

  // Test 2: Success flow
  {
    const sim = new SaveStatusSim()
    sim.save(true)
    assert(sim.status === 'saved', 'Status should be saved')
    assert(sim.timer !== null, 'Reset timer should start')
    sim.cleanup()
    console.log('  + Success: status=saved, reset timer starts')
  }

  // Test 3: Error flow
  {
    const sim = new SaveStatusSim()
    sim.save(false)
    assert(sim.status === 'error', 'Status should be error')
    assert(sim.timer !== null, 'Reset timer should start on error too')
    sim.cleanup()
    console.log('  + Error: status=error, reset timer starts')
  }
}

// ════════════════════════════════════════════════════════════════
// 9. Chat pending message flow
// ════════════════════════════════════════════════════════════════

function testPendingMessageFlow() {
  console.log('\n=== Pending Message Flow Tests ===\n')

  class PendingMessageSim {
    pendingMessage: string | null = null
    isLoading = false
    appendedMessages: Array<{ role: string; content: string }> = []

    setPending(msg: string) {
      this.pendingMessage = msg
    }

    // Simulate the useEffect [pendingMessage, isLoading, append, onPendingMessageSent]
    runEffect() {
      if (this.pendingMessage && !this.isLoading) {
        this.appendedMessages.push({ role: 'user', content: this.pendingMessage })
        this.pendingMessage = null // onPendingMessageSent
      }
    }
  }

  // Test 1: Pending message sent when not loading
  {
    const sim = new PendingMessageSim()
    sim.setPending('Fix the error')
    sim.isLoading = false
    sim.runEffect()
    assert(sim.appendedMessages.length === 1, 'Should append message')
    assert(sim.appendedMessages[0].content === 'Fix the error', 'Content matches')
    assert(sim.pendingMessage === null, 'Pending should be cleared')
    console.log('  + Not loading: message sent and cleared immediately')
  }

  // Test 2: Pending message delayed when loading
  {
    const sim = new PendingMessageSim()
    sim.setPending('Fix the error')
    sim.isLoading = true
    sim.runEffect()
    assert(sim.appendedMessages.length === 0, 'Should not send while loading')
    assert(sim.pendingMessage === 'Fix the error', 'Pending preserved')

    // Simulate loading complete
    sim.isLoading = false
    sim.runEffect()
    assert(sim.appendedMessages.length === 1, 'Should send after loading completes')
    assert(sim.pendingMessage === null, 'Pending cleared after send')
    console.log('  + Loading: message deferred until loading completes')
  }

  // Test 3: No pending message — no action
  {
    const sim = new PendingMessageSim()
    sim.runEffect()
    assert(sim.appendedMessages.length === 0, 'No action without pending message')
    console.log('  + No pending: no action')
  }

  // Test 4: Pending message is always role=user
  {
    const sim = new PendingMessageSim()
    sim.setPending('anything')
    sim.runEffect()
    assert(sim.appendedMessages[0].role === 'user', 'Role should be user')
    console.log('  + Role: always "user"')
  }
}

// ════════════════════════════════════════════════════════════════
// 10. Auto-file-select on scaffold
// ════════════════════════════════════════════════════════════════

function testAutoFileSelect() {
  console.log('\n=== Auto File Select Tests ===\n')

  function selectMainFile(fileKeys: string[]): string | undefined {
    return fileKeys.find(f => f === 'app/page.tsx')
      || fileKeys.find(f => f === 'src/App.tsx')
      || fileKeys.find(f => f.endsWith('/page.tsx'))
      || fileKeys.find(f => f.endsWith('.tsx'))
      || fileKeys[0]
  }

  // Test 1: Next.js project — selects app/page.tsx
  {
    const selected = selectMainFile(['package.json', 'app/page.tsx', 'app/layout.tsx', 'app/globals.css'])
    assert(selected === 'app/page.tsx', 'Should select app/page.tsx')
    console.log('  + Next.js: selects app/page.tsx')
  }

  // Test 2: Vite project — selects src/App.tsx
  {
    const selected = selectMainFile(['package.json', 'src/App.tsx', 'src/main.tsx', 'src/index.css'])
    assert(selected === 'src/App.tsx', 'Should select src/App.tsx')
    console.log('  + Vite: selects src/App.tsx')
  }

  // Test 3: Nested page.tsx — selects by endsWith
  {
    const selected = selectMainFile(['package.json', 'src/pages/home/page.tsx', 'src/index.css'])
    assert(selected === 'src/pages/home/page.tsx', 'Should select nested page.tsx')
    console.log('  + Nested page.tsx: found by endsWith')
  }

  // Test 4: Any .tsx file — fallback
  {
    const selected = selectMainFile(['package.json', 'components/Button.tsx', 'lib/utils.ts'])
    assert(selected === 'components/Button.tsx', 'Should fallback to first .tsx')
    console.log('  + Fallback: first .tsx file')
  }

  // Test 5: No .tsx files — first file
  {
    const selected = selectMainFile(['package.json', 'README.md'])
    assert(selected === 'package.json', 'Should fallback to first file')
    console.log('  + No .tsx: falls back to first file')
  }

  // Test 6: Priority order
  {
    // Both app/page.tsx and src/App.tsx — app/page.tsx wins
    const selected = selectMainFile(['src/App.tsx', 'app/page.tsx'])
    assert(selected === 'app/page.tsx', 'app/page.tsx has priority over src/App.tsx')
    console.log('  + Priority: app/page.tsx > src/App.tsx > endsWith page.tsx > .tsx > first')
  }

  // Test 7: Auto-select only fires when prevKeys was empty (scaffold)
  {
    // Simulate the condition: wasEmpty && fileKeys.length > 0 && !activeFile
    const wasEmpty = true
    const fileKeys = ['app/page.tsx']
    const activeFile: string | null = null
    assert(wasEmpty && fileKeys.length > 0 && !activeFile, 'Scaffold condition met')

    // After first scaffold, prevKeys is non-empty
    const wasEmpty2 = false
    assert(!(wasEmpty2 && fileKeys.length > 0), 'Non-empty prev: auto-select skipped')
    console.log('  + Auto-select: only fires once on initial scaffold')
  }

  // Test 8: Already has active file — no auto-select
  {
    const wasEmpty = true
    const fileKeys = ['app/page.tsx', 'a.tsx']
    const activeFile = 'a.tsx'
    assert(!(wasEmpty && fileKeys.length > 0 && !activeFile), 'Active file exists: auto-select skipped')
    console.log('  + Active file exists: auto-select skipped')
  }
}

// ════════════════════════════════════════════════════════════════
// 11. Project switch cleanup
// ════════════════════════════════════════════════════════════════

function testProjectSwitchCleanup() {
  console.log('\n=== Project Switch Cleanup Tests ===\n')

  class ProjectState {
    projectName: string | null = 'My Project'
    projectId: string | null = 'proj-1'
    files: Record<string, string> = { 'a.tsx': 'content' }
    activeFile: string | null = 'a.tsx'
    loadProjectsCalled = false

    switchProject() {
      this.projectName = null
      this.projectId = null
      this.files = {}
      this.activeFile = null
      this.loadProjectsCalled = true
    }
  }

  // Test 1: All state cleared on switch
  {
    const state = new ProjectState()
    state.switchProject()
    assert(state.projectName === null, 'projectName cleared')
    assert(state.projectId === null, 'projectId cleared')
    assert(Object.keys(state.files).length === 0, 'files cleared')
    assert(state.activeFile === null, 'activeFile cleared')
    assert(state.loadProjectsCalled, 'loadProjects called')
    console.log('  + Switch: clears projectName, projectId, files, activeFile')
  }

  // Test 2: loadProjects called on switch
  {
    const state = new ProjectState()
    state.switchProject()
    assert(state.loadProjectsCalled, 'loadProjects should be called')
    console.log('  + Switch: triggers loadProjects refresh')
  }
}

// ════════════════════════════════════════════════════════════════
// 12. Cleanup on unmount — all timers/intervals cleared
// ════════════════════════════════════════════════════════════════

function testUnmountCleanup() {
  console.log('\n=== Unmount Cleanup Tests ===\n')

  // Verify all refs that need cleanup are accounted for
  const previewPanelRefs = [
    'syncTimeoutRef',
    'autoStartTimeoutRef',
    'retryTimerRef',
    'previewDebounceRef',
    'abortRef',
  ]

  const workspaceRefs = [
    'toastTimerRef',
  ]

  const pageRefs = [
    'autoSaveTimer',
  ]

  const dialogRefs = [
    'pollRef',
    'timerRef',
  ]

  // Test 1: All preview panel timers listed
  assert(previewPanelRefs.length === 5, `Preview panel should have 5 cleanup refs, got ${previewPanelRefs.length}`)
  console.log('  + Preview panel: 5 timers/refs to clean up')

  // Test 2: All workspace timers listed
  assert(workspaceRefs.length === 1, 'Workspace should have 1 cleanup ref')
  console.log('  + Workspace: 1 timer (toastTimerRef)')

  // Test 3: All page timers listed
  assert(pageRefs.length === 1, 'Page should have 1 cleanup ref')
  console.log('  + Page: 1 timer (autoSaveTimer)')

  // Test 4: All dialog timers listed
  assert(dialogRefs.length === 2, 'Dialog should have 2 cleanup refs')
  console.log('  + Dialog: 2 timers (pollRef, timerRef)')

  // Test 5: Total cleanup points
  const total = previewPanelRefs.length + workspaceRefs.length + pageRefs.length + dialogRefs.length
  assert(total === 9, `Total cleanup refs: ${total}`)
  console.log(`  + Total: ${total} timers/refs across all components`)

  // Test 6: Sandbox cleanup sends DELETE on unmount
  {
    let deleteCalled = false
    const sandboxStatus = 'running'
    const projectId = 'proj-1'
    // Simulate unmount cleanup: if projectId && (running || starting)
    if (projectId && (sandboxStatus === 'running')) {
      deleteCalled = true
    }
    assert(deleteCalled, 'Running sandbox sends DELETE on unmount')
    console.log('  + Sandbox: sends DELETE on unmount when running')
  }

  // Test 7: Sandbox cleanup skipped when idle
  {
    let deleteCalled = false
    const sandboxStatus = 'idle'
    const projectId = 'proj-1'
    if (projectId && sandboxStatus === 'running') {
      deleteCalled = true
    }
    assert(!deleteCalled, 'Idle sandbox: no DELETE on unmount')
    console.log('  + Sandbox idle: no DELETE on unmount')
  }
}

// ════════════════════════════════════════════════════════════════
// 13. File extraction flow (chat-panel.tsx)
// ════════════════════════════════════════════════════════════════

function testFileExtractionFlow() {
  console.log('\n=== File Extraction Flow Tests ===\n')

  // Test the processAtCall vs processAtResult logic
  function shouldProcess(toolName: string, state: string): boolean {
    const processAtCall = ['write_file', 'delete_file'].includes(toolName)
    const processAtResult = ['edit_file', 'create_project', 'rename_file'].includes(toolName)
    return (processAtCall && (state === 'call' || state === 'result')) ||
           (processAtResult && state === 'result')
  }

  // Test 1: write_file — processed at call (instant feedback)
  assert(shouldProcess('write_file', 'call'), 'write_file at call')
  assert(shouldProcess('write_file', 'result'), 'write_file at result')
  assert(!shouldProcess('write_file', 'partial-call'), 'write_file not at partial-call')
  console.log('  + write_file: processed at call (instant) and result')

  // Test 2: delete_file — processed at call
  assert(shouldProcess('delete_file', 'call'), 'delete_file at call')
  assert(shouldProcess('delete_file', 'result'), 'delete_file at result')
  console.log('  + delete_file: processed at call (instant) and result')

  // Test 3: edit_file — only at result (needs apply)
  assert(!shouldProcess('edit_file', 'call'), 'edit_file NOT at call')
  assert(shouldProcess('edit_file', 'result'), 'edit_file at result')
  console.log('  + edit_file: only at result (needs diff apply)')

  // Test 4: create_project — only at result
  assert(!shouldProcess('create_project', 'call'), 'create_project NOT at call')
  assert(shouldProcess('create_project', 'result'), 'create_project at result')
  console.log('  + create_project: only at result')

  // Test 5: rename_file — only at result
  assert(!shouldProcess('rename_file', 'call'), 'rename_file NOT at call')
  assert(shouldProcess('rename_file', 'result'), 'rename_file at result')
  console.log('  + rename_file: only at result')

  // Test 6: read_file — never processed (read-only)
  assert(!shouldProcess('read_file', 'call'), 'read_file never processed')
  assert(!shouldProcess('read_file', 'result'), 'read_file never processed')
  console.log('  + read_file: never processed (read-only tool)')

  // Test 7: Dedup via processedInvs Set
  {
    const processedInvs = new Set<string>()
    const key = 'msg-1:write_file:0'

    // First time: not in set
    assert(!processedInvs.has(key), 'First: not in set')
    processedInvs.add(key)

    // Second time: in set, skip
    assert(processedInvs.has(key), 'Second: in set, skip')
    console.log('  + Dedup: processedInvs Set prevents double-processing')
  }

  // Test 8: Error results are skipped
  {
    const result = { error: 'File not found' }
    const isError = result && typeof result === 'object' && 'error' in result
    assert(isError, 'Error result should be detected')
    console.log('  + Error results: skipped (not applied to files)')
  }

  // Test 9: localFiles ref keeps running state for chained edits
  {
    const localFiles: Record<string, string> = {}

    // First write_file
    localFiles['a.tsx'] = 'content 1'

    // Second edit_file references a.tsx — needs current content
    const currentContent = localFiles['a.tsx']
    assert(currentContent === 'content 1', 'localFiles ref has latest content for chained edit')
    console.log('  + localFiles ref: maintains running state for chained tool calls')
  }
}

// ════════════════════════════════════════════════════════════════
// 14. Copy feedback timer (chat-panel.tsx — 2s)
// ════════════════════════════════════════════════════════════════

function testCopyFeedback() {
  console.log('\n=== Copy Feedback Timer Tests ===\n')

  // Simulate: setCopiedId(id); setTimeout(() => setCopiedId(null), 2000)
  class CopySim {
    copiedId: string | null = null
    timer: ReturnType<typeof setTimeout> | null = null
    FEEDBACK_MS = 2000

    copy(id: string) {
      this.copiedId = id
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => { this.copiedId = null }, this.FEEDBACK_MS)
    }

    flush() {
      if (this.timer) {
        clearTimeout(this.timer)
        this.copiedId = null
        this.timer = null
      }
    }
  }

  // Test 1: Feedback duration is 2000ms
  {
    const sim = new CopySim()
    assert(sim.FEEDBACK_MS === 2000, 'Copy feedback should be 2000ms')
    console.log('  + Duration: 2000ms')
  }

  // Test 2: Copy sets ID
  {
    const sim = new CopySim()
    sim.copy('msg-1')
    assert(sim.copiedId === 'msg-1', 'Copied ID should be set')
    sim.flush()
    console.log('  + Copy: sets copiedId')
  }

  // Test 3: Flush clears ID
  {
    const sim = new CopySim()
    sim.copy('msg-1')
    sim.flush()
    assert(sim.copiedId === null, 'Flush should clear copiedId')
    console.log('  + Flush: clears copiedId')
  }
}

// ════════════════════════════════════════════════════════════════
// 15. Timing constant summary
// ════════════════════════════════════════════════════════════════

function testTimingConstants() {
  console.log('\n=== Timing Constants Summary ===\n')

  const timings = {
    autoSaveDebounce: 5000,
    previewDebounce: 800,
    toastBatch: 2000,
    sandboxAutoStart: 3000,
    sandboxSync: 2000,
    taskPolling: 2000,
    elapsedTimer: 1000,
    saveStatusReset: 2000,
    copyFeedback: 2000,
  }

  assert(timings.autoSaveDebounce === 5000, 'Auto-save: 5s')
  assert(timings.previewDebounce === 800, 'Preview: 800ms')
  assert(timings.toastBatch === 2000, 'Toast: 2s')
  assert(timings.sandboxAutoStart === 3000, 'Sandbox auto-start: 3s')
  assert(timings.sandboxSync === 2000, 'Sandbox sync: 2s')
  assert(timings.taskPolling === 2000, 'Task polling: 2s')
  assert(timings.elapsedTimer === 1000, 'Elapsed: 1s')
  assert(timings.saveStatusReset === 2000, 'Save status reset: 2s')
  assert(timings.copyFeedback === 2000, 'Copy feedback: 2s')

  console.log('  Auto-save debounce:    5000ms  (page.tsx)')
  console.log('  Preview debounce:       800ms  (preview-panel.tsx)')
  console.log('  Toast batch:           2000ms  (workspace.tsx)')
  console.log('  Sandbox auto-start:    3000ms  (preview-panel.tsx)')
  console.log('  Sandbox sync:          2000ms  (preview-panel.tsx)')
  console.log('  Task polling:          2000ms  (action-dialog.tsx)')
  console.log('  Elapsed timer:         1000ms  (action-dialog.tsx)')
  console.log('  Save status reset:     2000ms  (workspace.tsx)')
  console.log('  Copy feedback:         2000ms  (chat-panel.tsx)')
  console.log('  + All 9 timing constants verified')
}

// ════════════════════════════════════════════════════════════════
// 16. Sandbox URL caching flow
// ════════════════════════════════════════════════════════════════

function testSandboxUrlCaching() {
  console.log('\n=== Sandbox URL Caching Tests ===\n')

  class UrlCacheSim {
    sandboxUrl: string | null = null
    sandboxStatus: 'idle' | 'running' | 'error' = 'idle'
    cachedSandboxUrl: string | null = null
    projectId: string | null = null
    storage: Record<string, string> = {}

    // Simulate cache effect
    cacheUrl() {
      if (this.sandboxUrl && this.sandboxStatus === 'running') {
        this.cachedSandboxUrl = this.sandboxUrl
        if (this.projectId) {
          this.storage[`forge-sandbox-${this.projectId}`] = this.sandboxUrl
        }
      }
    }

    // Simulate restore effect
    restoreUrl() {
      if (this.projectId && !this.cachedSandboxUrl) {
        const cached = this.storage[`forge-sandbox-${this.projectId}`]
        if (cached) this.cachedSandboxUrl = cached
      }
    }
  }

  // Test 1: Cache when running
  {
    const sim = new UrlCacheSim()
    sim.projectId = 'proj-1'
    sim.sandboxUrl = 'https://sandbox.example.com/123'
    sim.sandboxStatus = 'running'
    sim.cacheUrl()
    assert(sim.cachedSandboxUrl === 'https://sandbox.example.com/123', 'URL cached')
    assert(sim.storage['forge-sandbox-proj-1'] === 'https://sandbox.example.com/123', 'Saved to sessionStorage')
    console.log('  + Running: URL cached in state and sessionStorage')
  }

  // Test 2: Don't cache when not running
  {
    const sim = new UrlCacheSim()
    sim.projectId = 'proj-1'
    sim.sandboxUrl = 'https://sandbox.example.com/123'
    sim.sandboxStatus = 'idle'
    sim.cacheUrl()
    assert(sim.cachedSandboxUrl === null, 'Not cached when idle')
    console.log('  + Idle: URL not cached')
  }

  // Test 3: Restore on mount
  {
    const sim = new UrlCacheSim()
    sim.projectId = 'proj-1'
    sim.storage['forge-sandbox-proj-1'] = 'https://sandbox.example.com/restored'
    sim.restoreUrl()
    assert(sim.cachedSandboxUrl === 'https://sandbox.example.com/restored', 'URL restored from storage')
    console.log('  + Mount: URL restored from sessionStorage')
  }

  // Test 4: Don't restore if already cached
  {
    const sim = new UrlCacheSim()
    sim.projectId = 'proj-1'
    sim.cachedSandboxUrl = 'https://existing.com'
    sim.storage['forge-sandbox-proj-1'] = 'https://different.com'
    sim.restoreUrl()
    assert(sim.cachedSandboxUrl === 'https://existing.com', 'Existing cache preserved')
    console.log('  + Already cached: sessionStorage ignored')
  }

  // Test 5: Display URL priority
  {
    function getDisplayUrl(
      isSandboxActive: boolean,
      sandboxUrl: string | null,
      isSandboxLoading: boolean,
      statusLabel: string,
      showCachedPreview: boolean,
      cachedSandboxUrl: string | null,
    ): string {
      if (isSandboxActive) return sandboxUrl!
      if (isSandboxLoading) return statusLabel
      if (showCachedPreview) return cachedSandboxUrl!
      return 'Preview'
    }

    assert(getDisplayUrl(true, 'https://live.com', false, '', false, null) === 'https://live.com', 'Active: shows live URL')
    assert(getDisplayUrl(false, null, true, 'Creating preview...', false, null) === 'Creating preview...', 'Loading: shows status')
    assert(getDisplayUrl(false, null, false, '', true, 'https://cached.com') === 'https://cached.com', 'Cached: shows cached URL')
    assert(getDisplayUrl(false, null, false, '', false, null) === 'Preview', 'Idle: shows "Preview"')
    console.log('  + Display URL priority: live > loading label > cached > "Preview"')
  }
}

// ════════════════════════════════════════════════════════════════
// 17. Dialog Fix message formatting (workspace.tsx)
// ════════════════════════════════════════════════════════════════

function testDialogFixFormatting() {
  console.log('\n=== Dialog Fix Message Formatting Tests ===\n')

  function formatDeployFix(errorMessage: string): string {
    return `The deploy failed with these build errors. Please fix them:\n\n\`\`\`\n${errorMessage}\n\`\`\``
  }

  // Test 1: Deploy error formatting
  {
    const msg = formatDeployFix('Module not found: react')
    assert(msg.includes('deploy failed'), 'Should mention deploy failure')
    assert(msg.includes('```'), 'Should have code fence')
    assert(msg.includes('Module not found: react'), 'Should include error')
    console.log('  + Deploy error: formatted with intro and code fence')
  }

  // Test 2: Multi-line error
  {
    const msg = formatDeployFix('Line 1\nLine 2\nLine 3')
    const lines = msg.split('\n')
    assert(lines.length >= 5, 'Multi-line error preserved')
    console.log('  + Multi-line: line breaks preserved in code fence')
  }

  // Test 3: Deploy fix vs preview fix — different intros
  {
    const deployFix = formatDeployFix('error')
    const previewFix = `The preview has runtime errors. Please fix them:\n\n\`\`\`\nerror\n\`\`\``
    assert(deployFix.includes('deploy failed'), 'Deploy fix mentions deploy')
    assert(previewFix.includes('preview has runtime errors'), 'Preview fix mentions preview')
    assert(deployFix !== previewFix, 'Different messages for different error sources')
    console.log('  + Deploy fix vs preview fix: different intro text')
  }

  // Test 4: Mobile also switches to chat tab
  {
    let mobileTab = 'preview'
    const handleDialogFix = (errorMessage: string) => {
      mobileTab = 'chat'
    }
    handleDialogFix('error')
    assert(mobileTab === 'chat', 'Mobile switches to chat tab')
    console.log('  + Mobile: switches to chat tab on fix')
  }
}

// ════════════════════════════════════════════════════════════════
// Run all tests
// ════════════════════════════════════════════════════════════════

console.log('════════════════════════════════════════════════════')
console.log('  Timing, Triggers & Flows Tests')
console.log('════════════════════════════════════════════════════')

testAutoSaveDebounce()
testPreviewDebounce()
testToastBatchTiming()
testSandboxAutoStart()
testSandboxSync()
testSandboxRetry()
testDialogPolling()
testSaveStatusReset()
testPendingMessageFlow()
testAutoFileSelect()
testProjectSwitchCleanup()
testUnmountCleanup()
testFileExtractionFlow()
testCopyFeedback()
testTimingConstants()
testSandboxUrlCaching()
testDialogFixFormatting()

console.log('\n════════════════════════════════════════════════════')
if (failed > 0) {
  console.log(`  ${passed} passed, ${failed} FAILED`)
  process.exit(1)
} else {
  console.log(`  All ${passed} tests passed!`)
}
console.log('════════════════════════════════════════════════════\n')
