import type { CSSProperties } from "react";
import { useFormatters } from "../../utils/useFormatters";

export function DeltaCell({
    value,
    isPercent,
    style,
}: {
    value: number | null | undefined;
    isPercent?: boolean;
    style?: CSSProperties;
}) {
    const { formatEur } = useFormatters();
    if (value == null)
        return (
            <td
                className="mono"
                style={{
                    color: "var(--fg-soft)",
                    textAlign: "right",
                    padding: "4px 6px",
                    ...style,
                }}
            >
                {"\u2014"}
            </td>
        );
    const color =
        value > 0
            ? "var(--success)"
            : value < 0
              ? "var(--danger)"
              : "var(--fg-soft)";
    const text = isPercent
        ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%`
        : `${value > 0 ? "+" : ""}${formatEur(value)}`;
    return (
        <td
            className="mono"
            style={{ color, textAlign: "right", padding: "4px 6px", ...style }}
        >
            {text}
        </td>
    );
}

export function ValueCell({
    value,
    highlight,
    style,
}: {
    value: number | null | undefined;
    highlight?: boolean;
    style?: CSSProperties;
}) {
    const { formatEur } = useFormatters();
    const bg = highlight ? "var(--accent-soft)" : "transparent";
    if (value == null)
        return (
            <td
                style={{
                    background: bg,
                    color: "var(--fg-soft)",
                    textAlign: "right",
                    padding: "4px 6px",
                    ...style,
                }}
            >
                {"\u2014"}
            </td>
        );
    return (
        <td
            className="mono"
            style={{
                background: bg,
                textAlign: "right",
                padding: "4px 6px",
                ...style,
            }}
        >
            {formatEur(value)}
        </td>
    );
}
