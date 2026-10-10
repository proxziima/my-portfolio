'use client'
import { Component, type ReactNode } from 'react'
import { captureException, track } from '@/lib/analytics/events'
import bevel from './bevel.module.css'
import { AppLoadError, LoadAttempt } from './lazy-app'
import styles from './Window.module.css'

type Reason = 'chunk_load_error' | 'render_error'

interface Props {
  /** The OS app id, for `experience_failed.app`. */
  app: string
  children: ReactNode
}

interface State {
  failed: Reason | null
  /** A fresh object per mount and per retry: a failed import is tried again under a new one. */
  attempt: object
}

const MESSAGE: Record<Reason, string> = {
  chunk_load_error: 'This program could not be loaded. Check your connection and try again.',
  render_error: 'This program has stopped responding.',
}

/**
 * One window's error boundary: an app whose code fails to arrive, or that crashes, fails inside its
 * own window with a Retry, and the rest of the desktop keeps working.
 */
export class AppBoundary extends Component<Props, State> {
  state: State = { failed: null, attempt: {} }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: error instanceof AppLoadError ? 'chunk_load_error' : 'render_error' }
  }

  componentDidCatch(error: unknown) {
    const load = error instanceof AppLoadError
    track('experience_failed', { experience: 'os_app', reason: load ? 'chunk_load_error' : 'render_error', app: this.props.app })
    // the import's own error: its stack and message name the chunk
    captureException(load ? error.cause : error)
  }

  retry = () => this.setState({ failed: null, attempt: {} })

  render() {
    const { failed, attempt } = this.state
    if (failed) {
      return (
        <div className={styles.failed} role="alert">
          <p>{MESSAGE[failed]}</p>
          <button type="button" className={bevel.raised} onClick={this.retry}>
            Retry
          </button>
        </div>
      )
    }
    return <LoadAttempt value={attempt}>{this.props.children}</LoadAttempt>
  }
}
