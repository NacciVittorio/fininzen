import { useEffect, useId, useRef } from "react";
import { useApp } from "../context/useApp";

export default function DemoModal() {
  const { showDemoModal, setShowDemoModal, logout, T } = useApp();
  const innerRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!showDemoModal) return undefined;
    const previouslyFocused = document.activeElement;
    const btn = innerRef.current?.querySelector("button");
    btn?.focus({ preventScroll: true });
    const handler = (e) => {
      if (e.key === "Escape") setShowDemoModal(false);
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [showDemoModal, setShowDemoModal]);

  if (!showDemoModal) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "var(--backdrop)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding:
          "max(12px, calc(env(safe-area-inset-top) + 12px)) 20px max(12px, calc(env(safe-area-inset-bottom) + 12px))",
      }}
      onClick={() => setShowDemoModal(false)}
    >
      <div
        ref={innerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card"
        style={{
          maxWidth: 360,
          width: "100%",
          maxHeight:
            "calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
          overflowY: "auto",
          padding: "32px 28px",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div
          id={titleId}
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "var(--fg)",
            marginBottom: 10,
          }}
        >
          {T("demo_modal_title")}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--fg-soft)",
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          {T("demo_modal_body")}
        </div>
        <button
          className="btn"
          style={{ width: "100%", marginBottom: 10 }}
          onClick={() => {
            setShowDemoModal(false);
            logout();
          }}
        >
          {T("demo_modal_register")}
        </button>
        <button
          onClick={() => setShowDemoModal(false)}
          style={{
            background: "none",
            border: "none",
            color: "var(--fg-soft)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {T("demo_modal_continue")}
        </button>
      </div>
    </div>
  );
}
