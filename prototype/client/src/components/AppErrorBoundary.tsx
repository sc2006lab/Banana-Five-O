import { Component, type ReactNode } from 'react';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <main className="mx-auto max-w-xl px-4 py-16" role="alert">
        <h1 className="text-2xl font-bold text-burgundy">We couldn’t display this page</h1>
        <p className="mt-3 text-muted">Please reload FamPlan. Saved preferences and shortlists remain in your account; unsaved changes may need to be entered again.</p>
        <a href="/explore" className="btn-primary mt-6">Reload Explore</a>
      </main>
    );
    return this.props.children;
  }
}
