"use client";

import { useEffect, useRef, useState } from "react";
import {
    dismissToast,
    subscribeToasts,
    type ToastSpec,
} from "../../utils/toastStore";

// Renders transient confirmation toasts raised via the toastStore. Mounted once
// in the authenticated app layout. Fixed to the bottom-centre, clearing the
// mobile bottom nav + safe-area inset.
export default function ToastHost() {
    const [toasts, setToasts] = useState<readonly ToastSpec[]>([]);
    const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

    useEffect(() => subscribeToasts(setToasts), []);

    useEffect(() => {
        const active = timers.current;
        for (const toast of toasts) {
            if (active.has(toast.id)) continue;
            const handle = setTimeout(
                () => dismissToast(toast.id),
                toast.duration,
            );
            active.set(toast.id, handle);
        }
        // Drop timers for toasts that no longer exist.
        for (const [id, handle] of active) {
            if (!toasts.some((toast) => toast.id === id)) {
                clearTimeout(handle);
                active.delete(id);
            }
        }
    }, [toasts]);

    useEffect(() => {
        const active = timers.current;
        return () => {
            for (const handle of active.values()) clearTimeout(handle);
            active.clear();
        };
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div
            aria-live="polite"
            style={{
                position: "fixed",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: "calc(88px + env(safe-area-inset-bottom))",
                zIndex: 1400,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                width: "min(420px, calc(100vw - 32px))",
                pointerEvents: "none",
            }}
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    role="status"
                    data-testid="app-toast"
                    style={{
                        pointerEvents: "auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        background: "var(--navy)",
                        color: "#fff",
                        borderRadius: 12,
                        boxShadow: "var(--shadow-deep)",
                        padding: "12px 14px",
                        fontSize: 13.5,
                        fontWeight: 600,
                        fontFamily: "var(--font-sans)",
                    }}
                >
                    <span
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{ color: "var(--success)" }}
                        >
                            ✓
                        </span>
                        {toast.message}
                    </span>
                    {toast.action && (
                        <button
                            type="button"
                            data-testid="app-toast-action"
                            onClick={() => {
                                toast.action?.onAction();
                                dismissToast(toast.id);
                            }}
                            style={{
                                flexShrink: 0,
                                minHeight: 32,
                                padding: "6px 12px",
                                borderRadius: 999,
                                border: 0,
                                cursor: "pointer",
                                background: "rgba(255,255,255,0.16)",
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 700,
                                fontFamily: "inherit",
                            }}
                        >
                            {toast.action.label}
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
