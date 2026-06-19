import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Icon from "./Icons";
import useFabClearance from "./useFabClearance";

type SpeedDialAction = {
    label?: ReactNode;
    icon?: ReactNode;
    onClick: () => void;
    testId?: string;
};

type SpeedDialFabProps = {
    actions?: SpeedDialAction[];
    icon?: ReactNode;
    mainLabel?: string;
    hidden?: boolean;
};

/**
 * Speed-dial FAB: click main button → sub-actions pop up above it.
 * actions: [{ label, icon, onClick }]
 */
export default function SpeedDialFab({
    actions = [],
    icon = <Icon name="plus" size={26} strokeWidth={2.4} />,
    mainLabel,
    hidden = false,
}: SpeedDialFabProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useFabClearance();

    useEffect(() => {
        if (hidden) setOpen(false);
    }, [hidden]);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    return (
        <div
            ref={ref}
            className="speed-dial-fab"
            style={{
                display: hidden ? "none" : "flex",
                position: "fixed",
                right: "calc(var(--sp-6) + env(safe-area-inset-right))",
                bottom: "calc(var(--sp-6) + env(safe-area-inset-bottom))",
                zIndex: 320,
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 10,
            }}
        >
            {open &&
                actions.map((action, i) => (
                    <button
                        key={i}
                        type="button"
                        data-testid={action.testId || `speed-dial-action-${i}`}
                        onClick={() => {
                            setOpen(false);
                            action.onClick();
                        }}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "0 16px 0 12px",
                            height: 44,
                            background: "var(--card)",
                            color: "var(--fg)",
                            border: "1px solid var(--rule)",
                            borderRadius: "var(--r-pill)",
                            boxShadow: "var(--shadow)",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontWeight: 600,
                            fontSize: 14,
                            whiteSpace: "nowrap",
                            animation: "fabSubIn 120ms ease both",
                            animationDelay: `${i * 40}ms`,
                        }}
                    >
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                                lineHeight: 1,
                            }}
                        >
                            {action.icon}
                        </span>
                        {action.label}
                    </button>
                ))}

            <button
                type="button"
                data-testid="speed-dial-main"
                aria-label={mainLabel}
                title={mainLabel}
                onClick={() => setOpen((p) => !p)}
                style={{
                    width: 56,
                    height: 56,
                    background: "var(--btn-primary-bg)",
                    color: "var(--btn-primary-fg)",
                    border: 0,
                    borderRadius: "var(--r-pill)",
                    boxShadow: "var(--shadow)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                    fontWeight: 600,
                    lineHeight: 1,
                    transition: "transform 160ms ease",
                    transform: open ? "rotate(45deg)" : "rotate(0deg)",
                }}
            >
                {icon}
            </button>
        </div>
    );
}
