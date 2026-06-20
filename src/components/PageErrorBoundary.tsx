// PageErrorBoundary — wraps a page section so a synchronous render error
// doesn't white-screen the whole app. Class component because React's
// error-boundary API only works on class components.
//
// Why this exists: 2026-06-20 Brandon reported "OLIVER Insights white
// screen." There was no top-level error boundary anywhere in Portal, so
// any uncaught useMemo/render error in a page would crash the entire SPA.
// This component renders an inline "Something broke on this page" card
// instead, with the error message + a "Reload" button. Sibling pages
// still render fine because each page is wrapped independently.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown above the error message. Defaults to "This page hit an error." */
  label?: string;
  /** Where in the app the boundary sits. Goes to console.error tag only. */
  scope?: string;
}

interface State {
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const scope = this.props.scope || "PageErrorBoundary";
    // eslint-disable-next-line no-console
    console.error(`[${scope}] uncaught render error`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { label = "This page hit an error.", scope = "page" } = this.props;
    const message = this.state.error.message || String(this.state.error);

    return (
      <div className="arion-page">
        <div
          className="card"
          style={{
            padding: 24,
            borderLeft: "4px solid #dc2626",
          }}
        >
          <div className="card-ttl" style={{ color: "#dc2626" }}>
            {label}
          </div>
          <div
            className="card-sub"
            style={{ marginTop: 4, color: "#5A7A8A" }}
          >
            The rest of the app is fine — try a different page from the menu, or
            reload this one.
          </div>
          <pre
            style={{
              marginTop: 14,
              padding: 12,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 6,
              fontSize: 11,
              color: "#7F1D1D",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 240,
              overflow: "auto",
            }}
          >
            {message}
          </pre>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={this.reset}
              style={{
                background: "#1A7DB5",
                color: "#fff",
                border: 0,
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: "#fff",
                color: "#0B1C24",
                border: "1px solid #cbd5e1",
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 10,
              color: "#94A3B8",
              fontFamily: "monospace",
            }}
          >
            Scope: {scope}
          </div>
        </div>
      </div>
    );
  }
}
