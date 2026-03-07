'use client'

import { useRef, useCallback, useEffect, useState, memo } from 'react'
import dynamic from 'next/dynamic'
import { type OnMount, type BeforeMount } from '@monaco-editor/react'

const Editor = dynamic(() => import('@monaco-editor/react').then(m => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-forge-bg p-4 space-y-2.5">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-6 h-3 rounded animate-skeleton" />
          <div className="h-3 rounded animate-skeleton" style={{ width: `${30 + Math.random() * 50}%`, animationDelay: `${i * 60}ms` }} />
        </div>
      ))}
    </div>
  ),
})
import { getLanguageFromPath, cn } from '@/lib/utils'
import { setupMonacoTypes } from '@/lib/monaco-types'
import { useTheme } from '@/components/theme-provider'
import { FileText, Save, ChevronRight } from 'lucide-react'

interface CodeEditorProps {
  path: string | null
  content: string
  previousContent?: string
  onSave: (path: string, content: string) => void
  onChange: (content: string) => void
  readOnly?: boolean
  isAiWorking?: boolean
}

export const CodeEditor = memo(function CodeEditor({ path, content, previousContent, onSave, onChange, readOnly, isAiWorking }: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const pathRef = useRef(path)
  const onSaveRef = useRef(onSave)
  const [modified, setModified] = useState(false)
  const prevDecorationsRef = useRef<string[]>([])
  const diffClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { theme } = useTheme()

  // Detect mobile viewport for optimized editor settings
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Keep refs current so Ctrl+S handler always uses latest values
  useEffect(() => { pathRef.current = path }, [path])
  useEffect(() => { onSaveRef.current = onSave }, [onSave])

  const handleBeforeMount: BeforeMount = (monaco) => {
    setupMonacoTypes(monaco)
    // Enable syntax error detection (red squiggles) — semantic validation disabled
    // to avoid false positives from missing node_modules in virtual FS
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
    })
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
    })
    // JSX support
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowJs: true,
    })
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: true,
    })
  }

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    // Ctrl+S to save
    // 2097 = KeyMod.CtrlCmd | KeyCode.KeyS (not imported to avoid bundling monaco-editor directly)
    editor.addCommand(2097, () => {
      if (pathRef.current) {
        const value = editor.getValue()
        onSaveRef.current(pathRef.current, value)
        setModified(false)
      }
    })
  }

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      onChange(value)
      setModified(true)
    }
  }, [onChange])

  // Update editor content when path/content changes externally
  useEffect(() => {
    if (editorRef.current) {
      const currentValue = editorRef.current.getValue()
      if (currentValue !== content) {
        editorRef.current.setValue(content)
        setModified(false)
      }
    }
  }, [content, path])

  // Diff decorations: highlight lines that changed from previousContent
  // Staggered reveal for large changes, auto-scroll to first change, persist during AI work
  useEffect(() => {
    if (!editorRef.current || !previousContent || previousContent === content) {
      // Clear decorations when no diff
      if (editorRef.current && prevDecorationsRef.current.length > 0) {
        editorRef.current.deltaDecorations(prevDecorationsRef.current, [])
        prevDecorationsRef.current = []
      }
      return
    }
    const editor = editorRef.current
    const monaco = (window as any).monaco
    if (!monaco) return

    const oldLines = previousContent.split('\n')
    const newLines = content.split('\n')
    const allDecorations: any[] = []

    for (let i = 0; i < newLines.length; i++) {
      if (i >= oldLines.length) {
        // Added line
        allDecorations.push({
          range: new monaco.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: true,
            className: 'ai-diff-added-line',
            glyphMarginClassName: 'ai-diff-added-glyph',
          }
        })
      } else if (oldLines[i] !== newLines[i]) {
        // Modified line
        allDecorations.push({
          range: new monaco.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: true,
            className: 'ai-diff-modified-line',
            glyphMarginClassName: 'ai-diff-modified-glyph',
          }
        })
      }
    }

    // Staggered reveal: apply decorations in batches for visual roll-down effect
    const BATCH_SIZE = 20
    const STAGGER_MS = 15

    if (allDecorations.length <= BATCH_SIZE) {
      // Small change — apply all at once
      const ids = editor.deltaDecorations(prevDecorationsRef.current, allDecorations)
      prevDecorationsRef.current = ids
    } else {
      // Large change — stagger in batches for typewriter effect
      let idx = 0
      const applyBatch = () => {
        if (!editorRef.current) return
        const batch = allDecorations.slice(0, idx + BATCH_SIZE)
        const ids = editorRef.current.deltaDecorations(prevDecorationsRef.current, batch)
        prevDecorationsRef.current = ids
        idx += BATCH_SIZE
        if (idx < allDecorations.length) {
          setTimeout(applyBatch, STAGGER_MS)
        }
      }
      applyBatch()
    }

    // Auto-scroll to first changed line
    if (allDecorations.length > 0) {
      const firstLine = allDecorations[0].range.startLineNumber
      editor.revealLineInCenter(firstLine)
    }

    // Auto-clear: persist during AI work, clear 8s after content settles
    if (diffClearTimerRef.current) clearTimeout(diffClearTimerRef.current)
    if (!isAiWorking) {
      diffClearTimerRef.current = setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.deltaDecorations(prevDecorationsRef.current, [])
          prevDecorationsRef.current = []
        }
      }, 8000)
    }
  }, [previousContent, content, isAiWorking])

  // When AI stops working, start the clear timer for any remaining decorations
  useEffect(() => {
    if (!isAiWorking && prevDecorationsRef.current.length > 0) {
      if (diffClearTimerRef.current) clearTimeout(diffClearTimerRef.current)
      diffClearTimerRef.current = setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.deltaDecorations(prevDecorationsRef.current, [])
          prevDecorationsRef.current = []
        }
      }, 8000)
    }
  }, [isAiWorking])

  if (!path) {
    return (
      <div className="h-full flex items-center justify-center text-forge-text-dim">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-forge-surface border border-forge-border flex items-center justify-center mx-auto mb-3 animate-breathe">
            <FileText className="w-5 h-5 opacity-40" />
          </div>
          <p className="text-xs font-medium">Select a file to edit</p>
          <p className="text-[11px] text-forge-text-dim/60 mt-1">Click a file in the tree or press Ctrl+P to open a file</p>
        </div>
      </div>
    )
  }

  const language = getLanguageFromPath(path)

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb path bar */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2.5 sm:py-2 bg-forge-panel border-b border-forge-border text-xs sm:text-[11px] transition-all',
        modified && 'border-t-2 border-t-forge-accent',
      )}>
        <div className="flex items-center gap-0.5 text-forge-text-dim font-mono truncate min-w-0">
          {path.split('/').map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />}
              <span className={cn(
                'px-0.5 rounded transition-colors',
                i === arr.length - 1 ? 'text-forge-text font-medium' : 'hover:text-forge-text hover:bg-forge-surface-hover',
              )}>{segment}</span>
            </span>
          ))}
          {modified && <span className="text-forge-accent ml-1 animate-pulse-dot">●</span>}
        </div>
        {modified && (
          <button
            onClick={() => {
              if (editorRef.current && path) {
                onSave(path, editorRef.current.getValue())
                setModified(false)
              }
            }}
            className="flex items-center gap-1 px-2 py-1.5 sm:p-0 text-forge-accent hover:text-forge-accent-hover transition-colors shrink-0 ml-2"
            aria-label="Save file"
          >
            <Save className="w-4 h-4 sm:w-3 sm:h-3" />
            <span className="hidden sm:inline">Save</span>
          </button>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={handleChange}
          options={{
            readOnly: readOnly ?? false,
            glyphMargin: !isMobile,
            fontSize: isMobile ? 14 : 13,
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            lineNumbers: isMobile ? 'off' : 'on',
            lineNumbersMinChars: 3,
            scrollBeyondLastLine: false,
            renderWhitespace: 'none',
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 8 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: !isMobile },
            suggest: { showStatusBar: true },
            folding: !isMobile,
            foldingHighlight: !isMobile,
            scrollbar: {
              verticalScrollbarSize: isMobile ? 10 : 6,
              horizontalScrollbarSize: isMobile ? 10 : 6,
            },
          }}
        />
      </div>
    </div>
  )
})
