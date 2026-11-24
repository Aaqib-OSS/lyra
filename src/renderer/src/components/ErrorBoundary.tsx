import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** short name used in the message, e.g. "The side panel" */
  label: string
  children: ReactNode
}

/** One broken panel must not blank the whole app: show a small message with a way back instead. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // console.error is forwarded to Lyra's own log file by the main process (scrubbed); nothing is sent anywhere
    console.error(`[boundary] ${this.props.label} crashed: ${error.message}\n${info.componentStack ?? ''}`)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="boundary" role="alert" style={{ padding: 16, display: 'grid', gap: 8, justifyItems: 'start', color: 'var(--text, #fff)' }}>
        <b>{this.props.label} hit a problem.</b>
        <span style={{ opacity: 0.75, fontSize: 13 }}>Everything else keeps working. If it keeps happening, copy diagnostics from Settings → About and attach them to a bug report.</span>
        <button type="button" className="pill" onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </div>
    )
  }
}
