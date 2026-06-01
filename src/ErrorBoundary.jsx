import { Component } from 'react'
import './ErrorBoundary.css'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="eb-wrap">
          <div className="eb-card">
            <p className="eb-title">Something went wrong</p>
            <p className="eb-detail">{this.state.error.message}</p>
            <button className="eb-btn" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
