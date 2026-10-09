import { Component } from 'react';

export default class PageErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    // Do not display raw render errors: product/customer data can occur in them.
    return <main className="page-shell page-error-state" tabIndex={-1}>
      <p className="eyebrow">Please try again</p><h1>This page couldn’t be displayed</h1>
      <p role="alert">An unexpected display problem occurred. Reload this page to try again. Unsaved form entries may be lost.</p>
      <div className="button-group"><button type="button" className="button button-dark" onClick={() => window.location.reload()}>Reload page</button><a className="button button-secondary" href="/">Return home</a></div>
    </main>;
  }
}
