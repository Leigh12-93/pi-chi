'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import { getLanguageFromPath } from '@/lib/utils'
import { FileText, Save } from 'lucide-react'

interface CodeEditorProps {
  path: string | null
  content: string
  onSave: (path: string, content: string) => void
  onChange: (content: string) => void
}

export function CodeEditor({ path, content, onSave, onChange }: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const [modified, setModified] = useState(false)

  const handleBeforeMount: BeforeMount = (monaco) => {
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
    editor.addCommand(2097 /* KeyMod.CtrlCmd | KeyCode.KeyS */, () => {
      if (path) {
        const value = editor.getValue()
        onSave(path, value)
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

  if (!path) {
    return (
      <div className="h-full flex items-center justify-center text-forge-text-dim">
        <div className="text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Select a file to edit</p>
        </div>
      </div>
    )
  }

  const language = getLanguageFromPath(path)

  return (
    <div className="h-full flex flex-col">
      {/* File path bar */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:py-2 bg-forge-panel border-b border-forge-border text-xs sm:text-[11px]">
        <span className="text-forge-text-dim font-mono truncate min-w-0">
          {path}
          {modified && <span className="text-forge-accent ml-1">●</span>}
        </span>
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
          theme="vs"
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={handleChange}
          options={{
            fontSize: 13,
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
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
            guides: { bracketPairs: true },
            suggest: { showStatusBar: true },
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
          }}
        />
      </div>
    </div>
  )
}
