'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  name: string
  onRetry?: () => void
}

interface State {
  error: Error | null
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[PanelErrorBoundary:${this.props.name}]`, error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 bg-forge-bg text-forge-text-dim">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <p className="text-sm font-medium text-red-400">{this.props.name} crashed</p>
          <p className="text-xs text-forge-text-dim max-w-xs text-center">
            {this.state.error.message}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null })
              this.props.onRetry?.()
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
