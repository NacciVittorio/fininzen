"use client";

import type { Translator } from "../../types";
import type { TickerResult } from "../../context/useImportAndTicker";

export default function TickerResultsDrop({
    results,
    onSelect,
    T,
}: {
    results: readonly TickerResult[];
    onSelect: (result: TickerResult) => void;
    T: Translator;
}) {
    return (
        <div className="ticker-drop">
            {results.map((r, i) => (
                <div
                    key={`${r.source || "unknown"}-${r.symbol || i}`}
                    className="ticker-opt"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(r);
                    }}
                    onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--rule)")
                    }
                    onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                    }
                >
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontWeight: 600,
                            color: "var(--fg)",
                        }}
                    >
                        {r.symbol}
                    </span>
                    <span style={{ color: "var(--fg-soft)", marginLeft: 8 }}>
                        — {r.name}
                        {r.source && (
                            <span style={{ marginLeft: 6 }}>
                                ·{" "}
                                {r.source === "BORSA_ITALIANA"
                                    ? "Borsa Italiana"
                                    : "Yahoo"}
                            </span>
                        )}
                        {r.match_reason === "isin" && (
                            <span style={{ marginLeft: 6 }}>
                                · {T("matched_by_isin")}
                            </span>
                        )}
                        {r.match_reason === "name" && (
                            <span style={{ marginLeft: 6 }}>
                                · {T("matched_by_name")}
                            </span>
                        )}
                    </span>
                    {r.exchange && (
                        <span
                            style={{
                                color: "var(--accent)",
                                marginLeft: 8,
                                fontSize: 11,
                            }}
                        >
                            ({r.exchange})
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
