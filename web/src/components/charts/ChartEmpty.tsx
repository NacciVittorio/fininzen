import { memo } from "react";

type ChartEmptyProps = {
    height?: number;
    // Optional caller-localized message. Charts default to a neutral dash so an
    // embedded chart degrades to an explicit placeholder instead of collapsing
    // to nothing (MED-33); dashboard cards pass a translated label.
    label?: string;
};

/**
 * Centered, muted placeholder rendered in place of a chart that has no
 * displayable data. Keeps the chart's vertical footprint stable so the
 * surrounding layout does not jump between the empty and populated states.
 */
export const ChartEmpty = memo(function ChartEmpty({
    height = 180,
    label = "—",
}: ChartEmptyProps) {
    return (
        <div
            role="status"
            style={{
                height,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--fg-faint)",
                fontSize: 13,
            }}
        >
            {label}
        </div>
    );
});
