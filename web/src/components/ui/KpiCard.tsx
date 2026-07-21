"use client";

import type {
    ComponentPropsWithoutRef,
    CSSProperties,
    KeyboardEvent,
    MouseEvent,
    ReactNode,
} from "react";
import Card from "./Card";
import Label from "./Label";
import ProgressBar from "./ProgressBar";

const SELECTED_RING_COLOR: Record<string, string> = {
    positive: "var(--success)",
    danger: "var(--danger)",
    accent: "var(--accent)",
    warning: "var(--warning)",
    neutral: "var(--accent)",
};

type KpiCardProps = Omit<ComponentPropsWithoutRef<"div">, "onClick"> & {
    label?: ReactNode;
    value?: ReactNode;
    tone?: string;
    caption?: ReactNode;
    progress?: number | null;
    progressTone?: string;
    valueStyle?: CSSProperties;
    onClick?: (
        e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
    ) => void;
    selected?: boolean;
    selectedTone?: string;
    interactive?: boolean;
    compact?: boolean;
};

export default function KpiCard({
    label,
    value,
    tone = "neutral",
    caption,
    progress,
    progressTone,
    children,
    className,
    style,
    valueStyle,
    onClick,
    selected = false,
    selectedTone,
    interactive,
    compact = false,
    ...rest
}: KpiCardProps) {
    const isInteractive = interactive ?? !!onClick;
    const ringTone = selectedTone || tone;
    const ringColor =
        SELECTED_RING_COLOR[ringTone] || SELECTED_RING_COLOR.accent;

    const selectedStyle = selected
        ? { boxShadow: `inset 0 0 0 2px ${ringColor}` }
        : null;
    const interactiveStyle = isInteractive ? { cursor: "pointer" } : null;

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!isInteractive || !onClick) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick(e);
        }
    };

    const a11yProps: ComponentPropsWithoutRef<"div"> = isInteractive
        ? {
              role: "button",
              tabIndex: 0,
              "aria-pressed": selected,
              onKeyDown: handleKeyDown,
          }
        : {};

    const cardClassName = [
        "kpi-card",
        compact ? "kpi-card--compact" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <Card
            className={cardClassName}
            style={{
                ...interactiveStyle,
                ...selectedStyle,
                ...style,
            }}
            onClick={onClick}
            {...rest}
            {...a11yProps}
        >
            {label && <Label>{label}</Label>}
            {value != null && (
                <div
                    className={`kpi-value kpi-value--${tone}${compact ? " kpi-value--compact" : ""}`}
                    style={valueStyle}
                >
                    {value}
                </div>
            )}
            {caption && (
                <div
                    style={{
                        color: "var(--fg-soft)",
                        fontSize: compact ? 11 : 13,
                        marginTop: compact ? 4 : 8,
                        lineHeight: 1.4,
                    }}
                >
                    {caption}
                </div>
            )}
            {progress != null && (
                <div style={{ marginTop: 16 }}>
                    <ProgressBar value={progress} tone={progressTone || tone} />
                </div>
            )}
            {children}
        </Card>
    );
}
