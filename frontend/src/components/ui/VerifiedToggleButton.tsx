type VerifiedToggleButtonProps = {
    checked?: boolean;
    onToggle?: () => void;
    T: (key: string) => string;
};

export default function VerifiedToggleButton({
    checked,
    onToggle,
    T,
}: VerifiedToggleButtonProps) {
    const label = checked ? T("verified_filter_yes") : T("verified_filter_no");

    return (
        <button
            type="button"
            aria-pressed={checked}
            title={label}
            onClick={onToggle}
            style={{
                width: "100%",
                minHeight: 42,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                border: `1px solid ${checked ? "var(--success)" : "var(--rule)"}`,
                borderRadius: 10,
                background: checked
                    ? "color-mix(in srgb, var(--success) 16%, var(--card-inset))"
                    : "var(--card-inset)",
                color: checked ? "var(--success)" : "var(--fg-soft)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 650,
                padding: "10px 14px",
                textAlign: "left",
            }}
        >
            <span>{label}</span>
            <span aria-hidden="true" style={{ fontSize: 13 }}>
                {checked ? "✓" : "○"}
            </span>
        </button>
    );
}
