'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

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
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-forge-text mb-2">Something went wrong</h2>
            <p className="text-sm text-forge-text-dim mb-1">
              An unexpected error occurred. Your work is safe in the browser.
            </p>
            {this.state.error && (
              <pre className="text-[11px] text-red-500 bg-red-50 border border-red-200 rounded-xl p-3 mt-3 mb-4 text-left overflow-auto max-h-32 font-mono">
                {this.state.error.message}
              </pre>
            )}
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
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
