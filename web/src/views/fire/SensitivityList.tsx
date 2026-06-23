"use client";

import { GroupedList } from "../../components/ui";
import type { FireSensitivity } from "../../api/fire";
import type { Translator } from "../../types";

type SensitivityListProps = {
    sensitivity: FireSensitivity | null;
    T: Translator;
    onShowFull: () => void;
};

export default function SensitivityList({
    sensitivity,
    T,
    onShowFull,
}: SensitivityListProps) {
    if (!sensitivity) return null;
    const { saving_multipliers, spending_multipliers, matrix } = sensitivity;
    const baseRowIdx = saving_multipliers.findIndex(
        (m) => Math.abs(parseFloat(m) - 1) < 0.001,
    );
    const rowIdx = baseRowIdx >= 0 ? baseRowIdx : 0;
    const row = matrix[rowIdx] || [];
    const baseColIdx = spending_multipliers.findIndex(
        (m) => Math.abs(parseFloat(m) - 1) < 0.001,
    );
    const baseYears = baseColIdx >= 0 ? (row[baseColIdx] ?? null) : null;

    return (
        <GroupedList
            footer={
                <span>
                    {T("fire_saving_mult")}{" "}
                    {parseFloat(saving_multipliers[rowIdx] ?? "1").toFixed(1)}x
                </span>
            }
        >
            {row.map((years, ci) => {
                const delta =
                    years !== null && baseYears !== null
                        ? years - baseYears
                        : null;
                return (
                    <GroupedList.Item
                        key={ci}
                        label={`${T("fire_spending_mult")} ${parseFloat(spending_multipliers[ci] ?? "1").toFixed(1)}x`}
                        value={
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "baseline",
                                    gap: 8,
                                }}
                            >
                                {delta !== null && delta !== 0 && (
                                    <span
                                        className="num"
                                        style={{
                                            fontSize: 11,
                                            color:
                                                delta < 0
                                                    ? "var(--success)"
                                                    : "var(--danger)",
                                        }}
                                    >
                                        {delta > 0 ? "+" : ""}
                                        {delta} yr
                                    </span>
                                )}
                                <span
                                    className="num"
                                    style={{
                                        fontWeight: 700,
                                        color: "var(--fg)",
                                    }}
                                >
                                    {years !== null ? `${years} yr` : "∞"}
                                </span>
                            </span>
                        }
                    />
                );
            })}
            <GroupedList.Item
                label={T("fire_sensitivity_full", "Full matrix")}
                chevron
                onClick={onShowFull}
            />
        </GroupedList>
    );
}
