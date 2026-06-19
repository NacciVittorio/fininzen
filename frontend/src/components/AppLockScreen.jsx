import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/useApp";

export default function AppLockScreen() {
  const { unlock, logout, T } = useApp();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const attempted = useRef(false);

  const handleUnlock = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const ok = await unlock();
      if (!ok) setError(T("applock_error"));
    } catch (err) {
      // User cancelled the prompt — stay locked silently, let them retry
      if (err?.name !== "NotAllowedError") setError(T("applock_error"));
    }
    setLoading(false);
  }, [unlock, T]);

  // Auto-prompt biometric once on mount
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    handleUnlock();
  }, [handleUnlock]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-2)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 360,
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        {/* Lock icon */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--accent-soft)",
            marginBottom: 16,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2C8.13 2 5 5.13 5 9v3c0 .55.45 1 1 1h1v4c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-4h1c.55 0 1-.45 1-1V9c0-3.87-3.13-7-7-7z" />
            <circle cx="9" cy="9" r="1" />
            <circle cx="15" cy="9" r="1" />
            <path d="M9 14s1 2 3 2 3-2 3-2" />
          </svg>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
          {T("applock_title")}
        </div>
        <div
          style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 24 }}
        >
          {T("applock_subtitle")}
        </div>

        {error && (
          <div
            style={{
              color: "var(--danger)",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleUnlock}
          disabled={loading}
          className="btn btn-p"
          style={{
            width: "100%",
            padding: "12px 0",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {loading ? "…" : error ? T("applock_retry") : T("applock_unlock")}
        </button>

        <button
          type="button"
          onClick={logout}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "10px 0",
            background: "none",
            border: 0,
            color: "var(--fg-soft)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {T("applock_exit")}
        </button>
      </div>
    </div>
  );
}
