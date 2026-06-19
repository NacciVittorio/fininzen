import { Component } from "react";
import { logError } from "../utils/logger";

/**
 * Top-level error boundary (HIGH-31). React error boundaries must be class
 * components. Sits *outside* AppProvider in main.jsx, so it cannot use the app's
 * i18n/context — the fallback text is intentionally static. Catches render-time
 * crashes that would otherwise leave a blank white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // HIGH-35: forward to Sentry when the loader script has attached it to
    // window (the backend already initialises Sentry server-side). We don't hard
    // depend on @sentry/react so the bundle stays lean and the boundary works
    // with or without it. Always log to the console as the baseline so the crash
    // is diagnosable from devtools / a bug report even when Sentry is absent.
    if (typeof window !== "undefined" && window.Sentry?.captureException) {
      window.Sentry.captureException(error, {
        extra: { componentStack: info?.componentStack },
      });
    }
    logError("Unhandled UI error:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--sp-3, 24px)",
          background: "var(--bg, #0e0f12)",
          color: "var(--fg, #f4f4f5)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
            background: "var(--card, #1a1b1f)",
            border: "1px solid var(--rule, rgba(255,255,255,0.08))",
            borderRadius: "var(--r-card, 16px)",
            boxShadow: "var(--shadow-soft, 0 8px 24px rgba(0,0,0,0.3))",
            padding: "var(--sp-3, 24px)",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
            Qualcosa è andato storto
          </h1>
          <p
            style={{
              color: "var(--fg-soft, #a1a1aa)",
              fontSize: "0.9375rem",
              margin: "0 0 1.25rem",
              lineHeight: 1.5,
            }}
          >
            L'app ha riscontrato un errore imprevisto. Ricarica la pagina per
            riprovare; i tuoi dati sono al sicuro.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              minHeight: "var(--btn-min, 44px)",
              padding: "0 1.25rem",
              borderRadius: "var(--r-input, 12px)",
              border: "none",
              cursor: "pointer",
              fontSize: "0.9375rem",
              fontWeight: 600,
              background: "var(--btn-primary-bg, var(--accent, #3b82f6))",
              color: "var(--btn-primary-fg, #fff)",
            }}
          >
            Ricarica
          </button>
        </div>
      </div>
    );
  }
}
