import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "./scrollLock";

// Reusable iOS-style bottom sheet: slides up from the bottom over a dimmed
// backdrop, with a drag-handle, safe-area padding, Escape-to-close, body
// scroll-lock, and drag-to-dismiss gesture on the handle.
export default function BottomSheet({
  open,
  onClose,
  children,
  maxHeight = "88dvh",
  ariaLabel,
}) {
  // mounted keeps the node alive through the close animation; shown drives the
  // enter/leave transition one frame after mount so the slide-up plays.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  // Drag-to-dismiss state
  const dragStartY = useRef(null);
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocusedRef = useRef(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setDragY(0);
      let raf2;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    previouslyFocusedRef.current = document.activeElement;
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const focusables = () =>
      panelRef.current
        ? [...panelRef.current.querySelectorAll(focusableSelector)].filter(
            (el) =>
              !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"),
          )
        : [];
    const focusFirst = () => {
      const first = focusables()[0] || panelRef.current;
      first?.focus({ preventScroll: true });
    };
    focusFirst();
    const onKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        e.preventDefault();
        panelRef.current?.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockBodyScroll();
      const previous = previouslyFocusedRef.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus({ preventScroll: true });
      }
    };
  }, [mounted]);

  // ── drag handle gesture handlers ──────────────────────────────────────────

  const onHandlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
  };

  const onHandlePointerMove = (e) => {
    if (dragStartY.current == null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    setDragY(dy);
  };

  const onHandlePointerUp = () => {
    if (dragStartY.current == null) return;
    dragStartY.current = null;
    if (dragY > 80) {
      onCloseRef.current?.();
    } else {
      setDragY(0);
    }
  };

  if (!mounted) return null;

  const isDragging = dragStartY.current != null;
  const sheetTranslate = shown ? dragY : "100%";
  const sheetTransition = isDragging
    ? "none"
    : "transform 0.3s cubic-bezier(.32,.72,0,1)";

  const sheet = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        aria-hidden="true"
        onClick={() => onCloseRef.current?.()}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--backdrop-strong)",
          opacity: shown ? Math.max(0, 1 - dragY / 200) : 0,
          transition: isDragging ? "none" : "opacity 0.28s ease",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="bottom-sheet__panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "var(--card)",
          color: "var(--fg)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTop: "1px solid var(--rule)",
          maxHeight,
          display: "flex",
          flexDirection: "column",
          transform: `translateY(${typeof sheetTranslate === "number" ? sheetTranslate + "px" : sheetTranslate})`,
          transition: sheetTransition,
          boxShadow: "var(--shadow-deep)",
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Drag handle — touch/pointer target for dismiss gesture */}
        <div
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "10px 0 4px",
            flexShrink: 0,
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <div
            style={{
              width: 38,
              height: 5,
              borderRadius: 99,
              background: "var(--rule)",
              transition: isDragging ? "none" : "background 0.15s",
            }}
          />
        </div>
        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    </div>
  );

  // Render into document.body so the fixed-position overlay is anchored to the
  // viewport, not to any ancestor that establishes a containing block (e.g. a
  // PullToRefresh wrapper applying `transform`). Safari pins position:fixed to
  // the nearest transformed ancestor, which left the sheet off-screen.
  return typeof document !== "undefined"
    ? createPortal(sheet, document.body)
    : sheet;
}
