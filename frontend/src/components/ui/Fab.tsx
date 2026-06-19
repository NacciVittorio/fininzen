import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Icon from "./Icons";
import useFabClearance from "./useFabClearance";

const TONE_BG: Record<string, string> = {
    accent: "var(--btn-primary-bg)",
    success: "var(--success)",
    danger: "var(--danger)",
};

const TONE_FG: Record<string, string> = {
    accent: "var(--btn-primary-fg)",
    success: "var(--btn-primary-fg)",
    danger: "var(--btn-primary-fg)",
};

type FabProps = {
    label?: string;
    icon?: ReactNode;
    onClick?: () => void;
    tone?: "accent" | "success" | "danger";
    position?: "br" | "bl";
    size?: number;
    extended?: boolean;
    hidden?: boolean;
    style?: CSSProperties;
    className?: string;
    testId?: string;
};

export default function Fab({
    label,
    icon = <Icon name="plus" size={26} strokeWidth={2.4} />,
    onClick,
    tone = "accent",
    position = "br",
    size = 56,
    extended = false,
    hidden = false,
    style,
    className,
    testId,
}: FabProps) {
    const [hover, setHover] = useState(false);
    const [active, setActive] = useState(false);
    useFabClearance();

    const bg = TONE_BG[tone] || TONE_BG.accent;
    const fg = TONE_FG[tone] || TONE_FG.accent;

    const scale = active ? 0.96 : hover ? 1.06 : 1;

    const horizontal =
        position === "bl"
            ? { left: "calc(var(--sp-6) + env(safe-area-inset-left))" }
            : { right: "calc(var(--sp-6) + env(safe-area-inset-right))" };

    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            aria-label={label}
            title={label}
            className={["fab", className].filter(Boolean).join(" ")}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => {
                setHover(false);
                setActive(false);
            }}
            onMouseDown={() => setActive(true)}
            onMouseUp={() => setActive(false)}
            onBlur={() => {
                setHover(false);
                setActive(false);
            }}
            style={{
                display: hidden ? "none" : "inline-flex",
                position: "fixed",
                ...horizontal,
                bottom: "calc(var(--sp-6) + env(safe-area-inset-bottom))",
                zIndex: 320,
                height: size,
                minWidth: size,
                width: extended ? "auto" : size,
                padding: extended ? `0 ${size * 0.36}px` : 0,
                background: bg,
                color: fg,
                border: 0,
                borderRadius: "var(--r-pill)",
                boxShadow: "var(--shadow)",
                cursor: "pointer",
                alignItems: "center",
                justifyContent: "center",
                gap: extended ? 8 : 0,
                fontFamily: "inherit",
                fontWeight: 600,
                fontSize: extended ? 15 : 26,
                lineHeight: 1,
                transform: `scale(${scale})`,
                transition: "transform 160ms ease, box-shadow 160ms ease",
                ...style,
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                    lineHeight: 1,
                }}
            >
                {icon}
            </span>
            {extended && <span>{label}</span>}
        </button>
    );
}
