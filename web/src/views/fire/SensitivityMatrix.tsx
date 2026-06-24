"use client";

import type { FireSensitivity } from "../../api/fire";
import type { Translator } from "../../types";

type SensitivityMatrixProps = {
    sensitivity: FireSensitivity | null;
    T: Translator;
};

export default function SensitivityMatrix({
    sensitivity,
    T,
}: SensitivityMatrixProps) {
    if (!sensitivity) return null;
    const { saving_multipliers, spending_multipliers, matrix } = sensitivity;

    const allYears = matrix.flat().filter((v) => v !== null);
    const maxY = Math.max(...allYears) || 50;

    const color = (years: number | null) => {
        if (years === null) return "var(--card-inset)";
        const ratio = years / maxY;
        if (ratio < 0.4) return "var(--success)";
        if (ratio < 0.8) return "var(--warning)";
        return "var(--danger)";
    };

    return (
        <div
            className="data-scroll fire-matrix-scroll"
            style={{ overflowX: "auto" }}
        >
            <table
                style={{
                    borderCollapse: "collapse",
                    fontSize: 12,
                    width: "100%",
                    minWidth: "var(--fire-matrix-min-w, 720px)",
                }}
            >
                <thead>
                    <tr>
                        <th
                            style={{
                                padding: "4px 8px",
                                color: "var(--fg-soft)",
                            }}
                        >
                            ↓ {T("fire_saving_mult")} /{" "}
                            {T("fire_spending_mult")} →
                        </th>
                        {spending_multipliers.map((m) => (
                            <th
                                key={m}
                                style={{
                                    padding: "4px 8px",
                                    color: "var(--fg-soft)",
                                    textAlign: "center",
                                }}
                            >
                                {parseFloat(m).toFixed(1)}x
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {matrix.map((row, ri) => (
                        <tr key={ri}>
                            <td
                                style={{
                                    padding: "4px 8px",
                                    color: "var(--fg-soft)",
                                }}
                            >
                                {parseFloat(
                                    saving_multipliers[ri] ?? "1",
                                ).toFixed(1)}
                                x
                            </td>
                            {row.map((years, ci) => (
                                <td
                                    key={ci}
                                    style={{
                                        padding: "6px 12px",
                                        background: color(years),
                                        color: "var(--card-inset)",
                                        textAlign: "center",
                                        fontFamily: "var(--font-mono)",
                                        fontWeight: 600,
                                    }}
                                >
                                    {years !== null ? years : "∞"}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
