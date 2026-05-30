import { Component, ErrorInfo, ReactNode } from "react";

// Configure your site reception number here — displayed on emergency fallback screens
const RECEPTION_NUMBER = "RECEPTION_NUMBER";

// ── Props / State ────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

// ── ErrorBoundary ────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Render error caught:", error.message);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultFallback />;
    }
    return this.props.children;
  }
}

// ── Default fallback (general screens) ───────────────────────────────────────

function DefaultFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-3">
          Something went wrong on this screen
        </h2>
        <p className="text-gray-500 mb-6 text-sm">
          An unexpected error occurred. Your data has not been affected.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}

// ── EmergencyFallback (Fire Marshal / Muster screens) ────────────────────────
// High-contrast, large-text, mobile-first. Must be visible at arm's length.

export function EmergencyFallback() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ backgroundColor: "#b91c1c", color: "#ffffff" }}
    >
      <h1
        className="font-bold text-center mb-8"
        style={{ fontSize: "clamp(1.5rem, 5vw, 2.25rem)", lineHeight: 1.2 }}
      >
        ⚠️ Display error — muster data may not be visible
      </h1>

      <button
        onClick={() => window.location.reload()}
        className="font-bold rounded-xl mb-10 transition-colors"
        style={{
          fontSize: "clamp(1.25rem, 4vw, 1.75rem)",
          padding: "1.25rem 3rem",
          backgroundColor: "#ffffff",
          color: "#b91c1c",
          border: "none",
          cursor: "pointer",
        }}
        onMouseOver={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fee2e2")
        }
        onMouseOut={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#ffffff")
        }
      >
        Reload now
      </button>

      <p
        className="text-center max-w-lg"
        style={{
          fontSize: "clamp(1rem, 3vw, 1.25rem)",
          color: "#fecaca",
          lineHeight: 1.6,
        }}
      >
        If this screen will not load, account for people manually and call site
        reception.
        {RECEPTION_NUMBER !== "RECEPTION_NUMBER" && (
          <span
            className="block mt-3 font-bold"
            style={{ fontSize: "clamp(1.5rem, 5vw, 2rem)", color: "#ffffff" }}
          >
            📞 {RECEPTION_NUMBER}
          </span>
        )}
      </p>
    </div>
  );
}

export default ErrorBoundary;
