import type { InvestmentType } from "../../../api/types";

export default function InvestmentTypeModeHint({
    selectedInvType,
}: {
    selectedInvType: InvestmentType;
}) {
    return (
        <div
            style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
            }}
        >
            {selectedInvType.supports_ticker ? (
                <>
                    <span
                        style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 5,
                            background: "var(--accent-ring)",
                            color: "var(--accent)",
                            fontWeight: 600,
                        }}
                    >
                        Investment mode
                    </span>
                    <span style={{ fontSize: 11, color: "var(--fg-soft)" }}>
                        - value tracked via shares x price
                    </span>
                </>
            ) : (
                <>
                    <span
                        style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 5,
                            background: "var(--success-soft)",
                            color: "var(--success)",
                            fontWeight: 600,
                        }}
                    >
                        Balance mode
                    </span>
                    <span style={{ fontSize: 11, color: "var(--fg-soft)" }}>
                        - value set manually
                    </span>
                </>
            )}
        </div>
    );
}
