import { useEffect } from "react";
import { lockBodyScroll, unlockBodyScroll } from "./scrollLock";

export default function Drawer({
  open,
  onClose,
  title,
  side = "right",
  children,
  footer,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockBodyScroll();
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`drawer-backdrop${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`drawer drawer--${side}${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <div
            style={{
              font: "var(--w-heading) var(--t-h5) / 1 var(--font-sans)",
              letterSpacing: "var(--ls-h-small)",
              color: "var(--fg)",
            }}
          >
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "var(--card-inset)",
              border: 0,
              borderRadius: 999,
              width: 32,
              height: 32,
              color: "var(--fg-soft)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {children}
        </div>
        {footer && (
          <footer
            style={{
              borderTop: "1px solid var(--rule)",
              padding: "12px 20px calc(12px + env(safe-area-inset-bottom))",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}
