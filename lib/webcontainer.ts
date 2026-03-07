import { WebContainer, type FileSystemTree } from '@webcontainer/api'

let instance: WebContainer | null = null
let bootPromise: Promise<WebContainer> | null = null

/**
 * Boot or return the singleton WebContainer instance.
 * Only one instance can exist per page — calling boot() twice throws.
 */
export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance
  if (bootPromise) return bootPromise

  bootPromise = WebContainer.boot({ coep: 'credentialless' }).then(wc => {
    instance = wc
    return wc
  })

  return bootPromise
}

/** Tear down the current instance (e.g., on project switch) */
export function teardownWebContainer() {
  if (instance) {
    instance.teardown()
    instance = null
    bootPromise = null
  }
}

/**
 * Convert a flat file map { "src/App.tsx": "content..." }
 * into WebContainer's FileSystemTree format.
 */
export function filesToFileSystemTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {}

  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/')
    let current: any = tree

    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i]
      if (!current[dir]) {
        current[dir] = { directory: {} }
      }
      current = current[dir].directory
    }

    const fileName = parts[parts.length - 1]
    current[fileName] = { file: { contents: content } }
  }

  return tree
}

/** Next.js 15.5.x crashes on WebContainers with "workUnitAsyncStorage" invariant error.
 *  Pin to ~15.4.1 (last working minor) when the version would resolve to >=15.5.0.
 *  See: https://github.com/vercel/next.js/issues/84026 */
function patchNextVersionInFiles(files: Record<string, string>): Record<string, string> {
  const pkgContent = files['package.json']
  if (!pkgContent) return files
  try {
    const pkg = JSON.parse(pkgContent)
    const ver: string = pkg.dependencies?.next
    if (!ver) return files
    if (/^\^15(\.\d+)?(\.\d+)?$/.test(ver) || /^~15\.5/.test(ver) || ver === '15' || /^>=?\s*15\.5/.test(ver)) {
      pkg.dependencies.next = '~15.4.1'
      return { ...files, 'package.json': JSON.stringify(pkg, null, 2) }
    }
  } catch { /* malformed JSON — pass through */ }
  return files
}

/**
 * Mount files into WebContainer, run npm install, start dev server.
 * Returns a cleanup function.
 */
export async function mountAndStart(
  wc: WebContainer,
  files: Record<string, string>,
  callbacks: {
    onInstallOutput?: (data: string) => void
    onServerOutput?: (data: string) => void
    onServerReady?: (url: string, port: number) => void
    onError?: (error: string) => void
    onStatusChange?: (status: WcStatus) => void
  } = {}
): Promise<{ serverProcess: any | null }> {
  const { onInstallOutput, onServerOutput, onServerReady, onError, onStatusChange } = callbacks

  try {
    onStatusChange?.('mounting')

    // Patch Next.js version to avoid WebContainer crash (15.5.x is broken)
    const patchedFiles = patchNextVersionInFiles(files)

    // Mount all files
    const tree = filesToFileSystemTree(patchedFiles)
    await wc.mount(tree)

    // Check if package.json exists — if not, skip install
    let hasPackageJson = false
    try {
      await wc.fs.readFile('/package.json', 'utf-8')
      hasPackageJson = true
    } catch {
      hasPackageJson = false
    }

    if (!hasPackageJson) {
      onStatusChange?.('ready')
      return { serverProcess: null }
    }

    // Run npm install
    onStatusChange?.('installing')
    const installProcess = await wc.spawn('npm', ['install'])

    installProcess.output.pipeTo(new WritableStream({
      write(data) { onInstallOutput?.(data) },
    }))

    const installExit = await installProcess.exit
    if (installExit !== 0) {
      onError?.(`npm install failed with exit code ${installExit}`)
      onStatusChange?.('error')
      return { serverProcess: null }
    }

    // Start dev server
    onStatusChange?.('starting')
    const serverProcess = await wc.spawn('npm', ['run', 'dev'])

    serverProcess.output.pipeTo(new WritableStream({
      write(data) { onServerOutput?.(data) },
    }))

    // Listen for the dev server to be ready
    wc.on('server-ready', (port: number, url: string) => {
      onServerReady?.(url, port)
      onStatusChange?.('ready')
    })

    wc.on('error', (err: { message: string }) => {
      onError?.(err.message)
      onStatusChange?.('error')
    })

    return { serverProcess }
  } catch (err: any) {
    onError?.(err.message || 'WebContainer boot failed')
    onStatusChange?.('error')
    return { serverProcess: null }
  }
}

export type WcStatus = 'idle' | 'booting' | 'mounting' | 'installing' | 'starting' | 'ready' | 'error'
