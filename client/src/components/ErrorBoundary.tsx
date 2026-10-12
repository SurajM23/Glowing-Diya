import { Component, type ReactNode } from 'react';

/** Shows a recoverable message instead of a blank page if rendering throws. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-10 text-center" role="alert">
        <p className="mb-4">Something went wrong while showing this page.</p>
        <button className="btn-dark" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
