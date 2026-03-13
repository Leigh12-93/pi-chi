import { Loader2, AlertTriangle, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface ConsoleEntry {
  timestamp: string
  level: 'log' | 'warn' | 'error' | 'info' | 'system'
  message: string
  source?: 'preview' | 'sandbox' | 'pi'
}

export type ViewMode = 'desktop' | 'tablet' | 'mobile' | 'full'

export type SandboxStatus = 'idle' | 'initializing' | 'running' | 'error'

export type BuildPhase = 'analyzing' | 'uploading' | 'building' | 'starting' | 'ready' | null

export const STATUS_LABELS: Record<SandboxStatus, string> = {
  idle: '',
  initializing: 'Creating preview...',
  running: 'Live',
  error: 'Error',
}

export const PHASE_LABELS: Record<Exclude<BuildPhase, null>, string> = {
  analyzing: 'Reading your project',
  uploading: 'Sending files to preview',
  building: 'Building your app',
  starting: 'Almost there...',
  ready: 'Your preview is ready!',
}

export const PHASE_ORDER: Exclude<BuildPhase, null>[] = ['analyzing', 'uploading', 'building', 'starting', 'ready']

/** Script injected into static preview iframes to capture console output and runtime errors */
export const PREVIEW_ERROR_SCRIPT = `<script>
(function(){
  window.onerror=function(msg,url,line,col,err){
    window.parent.postMessage({type:'pi-preview',level:'error',
      message:String(msg),line:line,col:col,stack:err&&err.stack||''},'*');
    return false;
  };
  window.addEventListener('unhandledrejection',function(e){
    window.parent.postMessage({type:'pi-preview',level:'error',
      message:'Unhandled Promise: '+(e.reason&&e.reason.message||String(e.reason))},'*');
  });
  ['log','warn','error','info'].forEach(function(m){
    var o=console[m];
    console[m]=function(){
      var a=[].slice.call(arguments).map(function(v){
        try{return typeof v==='object'?JSON.stringify(v):String(v)}catch(e){return String(v)}
      });
      window.parent.postMessage({type:'pi-preview',level:m,message:a.join(' ')},'*');
      o.apply(console,arguments);
    };
  });
  // Track navigation — intercept link clicks and keep them inside the preview
  document.addEventListener('click',function(e){
    var a=e.target;while(a&&a.tagName!=='A')a=a.parentElement;
    if(a&&a.href&&!a.href.startsWith('javascript:')){
      e.preventDefault();
      var h=a.getAttribute('href')||'';
      // Handle hash links within the page
      if(h.startsWith('#')){var el=document.querySelector(h);if(el)el.scrollIntoView({behavior:'smooth'});return;}
      // Handle relative paths — navigate within the iframe
      if(h.startsWith('/')&&window.location.protocol==='about:'){
        window.parent.postMessage({type:'pi-navigate',href:h,pathname:h},'*');
        return;
      }
      // For other relative links, try to navigate within iframe
      if(!h.startsWith('http')){
        try{window.location.href=h;}catch(ex){}
        window.parent.postMessage({type:'pi-navigate',href:h,pathname:h},'*');
        return;
      }
      // External links — just notify parent, don't navigate
      window.parent.postMessage({type:'pi-navigate',href:h,pathname:h},'*');
    }
  });
  var _ps=history.pushState;history.pushState=function(){
    _ps.apply(this,arguments);
    window.parent.postMessage({type:'pi-navigate',pathname:location.pathname+location.search+location.hash},'*');
  };
  var _rs=history.replaceState;history.replaceState=function(){
    _rs.apply(this,arguments);
    window.parent.postMessage({type:'pi-navigate',pathname:location.pathname+location.search+location.hash},'*');
  };
  window.addEventListener('popstate',function(){
    window.parent.postMessage({type:'pi-navigate',pathname:location.pathname+location.search+location.hash},'*');
  });
  window.addEventListener('hashchange',function(){
    window.parent.postMessage({type:'pi-navigate',pathname:location.pathname+location.search+location.hash},'*');
  });
})();
</script>`

/** Minimum files needed before auto-starting sandbox */
export function isProjectReady(files: Record<string, string>): boolean {
  const paths = Object.keys(files)
  if (paths.length < 2) return false
  const hasPackageJson = paths.includes('package.json')
  const hasAnyComponent = paths.some(p =>
    p.endsWith('.tsx') || p.endsWith('.jsx') || p === 'index.html'
  )
  return hasPackageJson && hasAnyComponent
}

/** Detect missing imports in project files — catches errors BEFORE they crash the sandbox */
export function detectMissingImports(files: Record<string, string>): string[] {
  const filePaths = new Set(Object.keys(files))
  const errors: string[] = []

  const resolvable = new Set<string>()
  for (const p of filePaths) {
    resolvable.add(p)
    resolvable.add(p.replace(/\.(tsx?|jsx?|mjs|cjs)$/, ''))
    const dir = p.replace(/\/index\.(tsx?|jsx?|mjs|cjs)$/, '')
    if (dir !== p) resolvable.add(dir)
  }

  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.match(/\.(tsx?|jsx?|mjs)$/)) continue

    const importRegex = /import\s+(?:[\w{},\s*]+)\s+from\s+['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g
    let match: RegExpExecArray | null
    while ((match = importRegex.exec(content)) !== null) {
      let importPath = match[1]

      if (importPath.startsWith('@/')) {
        importPath = importPath.slice(2)
      } else {
        const dir = filePath.split('/').slice(0, -1).join('/')
        const parts = importPath.split('/')
        const resolved: string[] = dir ? dir.split('/') : []
        for (const part of parts) {
          if (part === '..') resolved.pop()
          else if (part !== '.') resolved.push(part)
        }
        importPath = resolved.join('/')
      }

      if (!resolvable.has(importPath) &&
          !resolvable.has(importPath + '/index') &&
          !filePaths.has(importPath + '.ts') &&
          !filePaths.has(importPath + '.tsx') &&
          !filePaths.has(importPath + '.js') &&
          !filePaths.has(importPath + '.jsx')) {
        const nameMatch = match[0].match(/import\s+(?:{?\s*(\w+)[\s,}]|(\w+))/)
        const name = nameMatch?.[1] || nameMatch?.[2] || importPath.split('/').pop()
        errors.push(`Missing module: "${match[1]}" imported in ${filePath} (${name} not found)`)
      }
    }
  }

  return [...new Set(errors)]
}

/** Known sandbox/browser noise patterns that are NOT fixable by editing user code */
const SANDBOX_NOISE_PATTERNS = [
  /tracking prevention/i,
  /access to storage.*has been blocked/i,
  /blocked.*cross-site/i,
  /third-party cookie/i,
  /Failed to read.*localStorage/i,
  /Failed to read.*sessionStorage/i,
  /SecurityError.*blocked a frame/i,
  /ResizeObserver loop/i,
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
  /Loading CSS chunk/i,
  /Minified React error/i,
  /The above error occurred in/i,
  /Consider adding an error boundary/i,
  /NEXT_REDIRECT/i,
  /Hydration failed because/i,
  /Text content does not match/i,
]

/** Check if an error message is known sandbox/browser noise */
export function isSandboxNoise(msg: string): boolean {
  return SANDBOX_NOISE_PATTERNS.some(pattern => pattern.test(msg))
}

/** Phase step indicator */
export function PhaseStepIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <svg className="w-3 h-3 text-emerald-500 pi-ready-check" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (state === 'active') {
    return <Loader2 className="w-3 h-3 text-pi-accent animate-spin" />
  }
  return <div className="w-2 h-2 rounded-full bg-pi-border" />
}

/** Phased build lifecycle stepper */
export function BuildPhaseIndicator({ phase }: { phase: BuildPhase }) {
  if (!phase) return null
  const currentIdx = PHASE_ORDER.indexOf(phase as Exclude<BuildPhase, null>)

  return (
    <div className="pi-build-phase">
      {PHASE_ORDER.filter(p => p !== 'ready').map((p, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending'
        return (
          <div key={p} className="flex items-center gap-1.5">
            {i > 0 && <div className={cn('pi-phase-connector transition-colors duration-300', state === 'done' && 'done')} />}
            <div className={cn('pi-phase-step', state === 'active' && 'active', state === 'done' && 'done')}>
              <PhaseStepIcon state={state} />
              <span className="hidden sm:inline">{PHASE_LABELS[p]}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Small copy button for error popups */
export function CopyErrorButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
      className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-pi-text-dim hover:text-pi-text bg-pi-surface hover:bg-pi-surface-hover rounded-lg transition-colors"
      title="Copy error to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** Building placeholder shown while sandbox initializes */
export function BuildingPlaceholder({ files, sandboxUnavailable }: { files: Record<string, string>; sandboxUnavailable?: boolean }) {
  const fileNames = Object.keys(files)
  const hasPackageJson = fileNames.includes('package.json')
  let framework = 'React'
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(files['package.json'] || '{}')
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) framework = 'Next.js'
      else if (deps['vite']) framework = 'Vite'
    } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center justify-center h-full bg-pi-bg text-pi-text-dim">
      <div className="text-center max-w-xs px-6">
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="absolute inset-0 rounded-full bg-pi-accent/10 blur-xl building-placeholder-glow" />
          <div className="pichi-logo-reveal">
            <span className="text-4xl font-bold bg-clip-text text-transparent select-none pichi-shimmer">
              6-&#x03C7;
            </span>
          </div>
        </div>
        <p className="text-sm font-medium text-pi-text mb-1.5">{framework} project detected</p>
        {sandboxUnavailable ? (
          <>
            <p className="text-xs text-amber-400/80 mb-2">
              Live preview sandbox is not available
            </p>
            <p className="text-[11px] text-pi-text-dim/50 mb-4 leading-relaxed">
              {framework} projects need the sandbox for a full preview.
              Static HTML preview is shown for non-JSX files.
            </p>
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-pi-text-dim/40">
              <AlertTriangle className="w-3 h-3" />
              <span>Configure V0_API_KEY in Settings to enable</span>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-pi-text-dim/60 mb-4">
              Setting up your preview environment
            </p>
            <div className="flex justify-center gap-1.5">
              <span className="building-dot" style={{ animationDelay: '0s' }} />
              <span className="building-dot" style={{ animationDelay: '0.15s' }} />
              <span className="building-dot" style={{ animationDelay: '0.3s' }} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
