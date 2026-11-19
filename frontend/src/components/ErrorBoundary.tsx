import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Frontend error boundary caught an error', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-page" role="alert">
          <h1>Something went wrong</h1>
          <p>Reload the page to try again.</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      )
    }
    return this.props.children
  }
}
