"use client";

import { Icon } from "../../../components/ui";
import type { Translator } from "../../../types";

export default function CashflowKindMismatchToast({ T }: { T: Translator }) {
    return (
        <div
            data-testid="cf-bulk-kind-mismatch-toast"
            role="status"
            aria-live="polite"
            style={{
                position: "fixed",
                top: "calc(env(safe-area-inset-top, 0px) + 12px)",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1085,
                background: "var(--warning-soft, #f59e0b22)",
                color: "var(--warning, #b45309)",
                border: "1px solid var(--warning-ring, #f59e0b55)",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                maxWidth: "calc(100vw - 24px)",
                boxShadow: "var(--shadow-modal)",
                display: "flex",
                alignItems: "center",
                gap: 8,
            }}
        >
            <Icon name="status" size={14} aria-hidden="true" />
            <span>{T("cf_bulk_kind_mismatch_toast")}</span>
        </div>
    );
}
