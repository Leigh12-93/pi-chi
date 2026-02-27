'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { getLanguageFromPath } from '@/lib/utils'
import { FileText, Save } from 'lucide-react'

interface CodeEditorProps {
  path: string | null
  content: string
  onSave: (path: string, content: string) => void
  onChange: (content: string) => void
}

export function CodeEditor({ path, content, onSave, onChange }: CodeEditorProps) {
  const editorRef = useRef<any>(null)
  const [modified, setModified] = useState(false)

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
      <div className="flex items-center justify-between px-3 py-1.5 bg-forge-panel border-b border-forge-border text-[11px]">
        <span className="text-forge-text-dim font-mono">{path}</span>
        {modified && (
          <button
            onClick={() => {
              if (editorRef.current && path) {
                onSave(path, editorRef.current.getValue())
                setModified(false)
              }
            }}
            className="flex items-center gap-1 text-forge-accent hover:text-forge-accent-hover transition-colors"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme="light"
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
