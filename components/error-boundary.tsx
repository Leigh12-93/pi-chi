'use client'

import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-forge-bg p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-forge-text mb-2">Something went wrong</h2>
            <p className="text-sm text-forge-text-dim mb-1">
              An unexpected error occurred. Your recent changes may not have been saved. Click 'Try Again' to recover your work.
            </p>
            {this.state.error && (
              <pre className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3 mt-3 mb-4 text-left overflow-auto max-h-32 font-mono">
                {this.state.error.message}
              </pre>
            )}
            <p className="text-xs text-forge-text-dim mb-4">If this keeps happening, try reloading the page.</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-forge-accent text-white text-sm font-medium rounded-xl hover:bg-forge-accent-hover transition-colors shadow-sm"
              >
                Try to Recover
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-forge-surface text-forge-text text-sm font-medium rounded-xl border border-forge-border hover:bg-forge-panel transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Full Reload
              </button>
              {this.state.error && (
                <button
                  onClick={() => {
                    const err = this.state.error
                    if (err) {
                      navigator.clipboard.writeText(`${err.message}\n${err.stack || ''}`)
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-forge-text-dim text-sm font-medium rounded-xl border border-forge-border hover:bg-forge-panel transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Error
                </button>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

interface PanelProps {
  children: ReactNode
  name?: string
}

interface PanelState {
  hasError: boolean
  error: Error | null
}

export class PanelErrorBoundary extends Component<PanelProps, PanelState> {
  state: PanelState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): PanelState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-forge-surface flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-forge-warning" />
          </div>
          <div>
            <p className="text-sm font-medium text-forge-text">{this.props.name || 'Panel'} failed to render</p>
            <p className="text-xs text-forge-text-dim mt-1">Try refreshing the page</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 text-xs font-medium text-forge-accent bg-forge-surface hover:bg-forge-surface-hover rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
