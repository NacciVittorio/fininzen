import { useState, useCallback, useEffect } from "react";
import { useApp } from "../context/useApp";
import { fetchFire, getPayloadError, saveFireSettings } from "../api/fire";
import type { FireResponse, FireSettings } from "../api/fire";
import { useFormatters } from "../utils/useFormatters";
import { useMediaQuery } from "../utils/useMediaQuery";
import {
    LargeTitleHeader,
    KpiStrip,
    KpiCard,
    ProgressBar,
    BottomSheet,
    SheetTitle,
    GroupedList,
} from "../components/ui";
import { logError } from "../utils/logger";
import ProjectionChart from "./fire/ProjectionChart";
import SensitivityList from "./fire/SensitivityList";
import SensitivityMatrix from "./fire/SensitivityMatrix";

// ---- Main view -------------------------------------------------------------

export default function FireView() {
    const { formatEur } = useFormatters();
    const { T, apiFetch } = useApp();
    const [data, setData] = useState<FireResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingQuick, setSavingQuick] = useState(false);
    const [quickError, setQuickError] = useState("");
    const [paramsOpen, setParamsOpen] = useState(false);
    const [matrixSheetOpen, setMatrixSheetOpen] = useState(false);
    const isDesktop = useMediaQuery("(min-width: 1024px)");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await fetchFire(apiFetch));
        } catch (e) {
            logError("FireView:", e);
        } finally {
            setLoading(false);
        }
    }, [apiFetch]);

    useEffect(() => {
        load();
    }, [load]);

    const saveQuickSettings = useCallback(
        async (patch: Partial<FireSettings>) => {
            setSavingQuick(true);
            setQuickError("");
            try {
                await saveFireSettings(apiFetch, patch);
                await load();
            } catch (e) {
                logError("Fire quick settings:", e);
                setQuickError(getPayloadError(e) || T("fire_quick_save_error"));
            } finally {
                setSavingQuick(false);
            }
        },
        [apiFetch, load, T],
    );

    if (loading)
        return (
            <div style={{ padding: 32, color: "var(--fg-soft)" }}>Loading…</div>
        );
    if (!data)
        return (
            <div style={{ padding: 32, color: "var(--danger)" }}>
                Error loading Fire data.
            </div>
        );

    const {
        metrics,
        kpis,
        coast_fire,
        projection,
        fired_year,
        sensitivity,
        probability_band,
        actionable_levers,
        computed_annual_expenses,
        current_nw,
    } = data;
    const pct = parseFloat(metrics.progress_pct);
    const coastPct = parseFloat(coast_fire.progress_pct);
    const mode = metrics.model_mode || "dual";
    const settings = data.settings || {};

    const leverLabel = (lever: string) => {
        if (lever === "save_plus_100_month")
            return T("fire_lever_save_plus_100_month");
        if (lever === "spend_minus_100_month")
            return T("fire_lever_spend_minus_100_month");
        if (lever === "return_plus_0_5pct")
            return T("fire_lever_return_plus_0_5pct");
        return lever;
    };

    return (
        <>
            <div>
                <LargeTitleHeader
                    eyebrow={T("tab_fire") || "FIRE"}
                    title={
                        metrics.years_to_fire
                            ? `${metrics.years_to_fire} ${T("years") || "anni"}`
                            : T("fire_title")
                    }
                    compactTitle={T("tab_fire") || "FIRE"}
                    compactValue={
                        metrics.already_fire
                            ? T("fire_already_fire")
                            : `${pct.toFixed(1)}%`
                    }
                    subtitle={
                        metrics.already_fire
                            ? T("fire_already_fire")
                            : `${pct.toFixed(1)}% ${T("fire_progress")}`
                    }
                    actions={
                        <button
                            type="button"
                            data-testid="fire-params-open"
                            className="btn btn-ghost pressable"
                            onClick={() => setParamsOpen(true)}
                        >
                            {T("fire_quick_controls")}
                        </button>
                    }
                />

                <KpiStrip columns={5} style={{ marginBottom: 16 }}>
                    <KpiCard
                        label={T("fire_current_nw")}
                        value={
                            <span className="num">
                                {formatEur(parseFloat(current_nw))}
                            </span>
                        }
                        tone="neutral"
                    />
                    <KpiCard
                        label={T("fire_number_real")}
                        value={
                            <span className="num">
                                {formatEur(
                                    parseFloat(
                                        kpis?.fire_number_real ||
                                            metrics.fire_number,
                                    ),
                                )}
                            </span>
                        }
                        tone="accent"
                        valueStyle={{
                            fontSize: "clamp(16px, 2.2vw, 28px)",
                            letterSpacing: 0,
                        }}
                    />
                    <KpiCard
                        label={T("fire_number_classic")}
                        value={
                            <span className="num">
                                {formatEur(
                                    parseFloat(
                                        kpis?.fire_number_classic ||
                                            metrics.fire_number,
                                    ),
                                )}
                            </span>
                        }
                        tone="neutral"
                    />
                    <KpiCard
                        label={T("fire_annual_expenses_computed")}
                        value={
                            <span className="num">
                                {formatEur(
                                    parseFloat(computed_annual_expenses),
                                )}
                            </span>
                        }
                        tone="neutral"
                    />
                    <KpiCard
                        label={T("fire_safe_spending")}
                        value={
                            <span className="num">
                                {formatEur(
                                    parseFloat(
                                        metrics.safe_spending_annual || "0",
                                    ),
                                )}
                            </span>
                        }
                        tone="neutral"
                    />
                    {metrics.years_to_fire && (
                        <KpiCard
                            label={T("fire_years_to_fire")}
                            value={
                                <span className="num">{`${metrics.years_to_fire} yr`}</span>
                            }
                            tone="accent"
                        />
                    )}
                    {metrics.runway_years && (
                        <KpiCard
                            label={T("fire_runway")}
                            value={
                                <span className="num">{`${parseFloat(metrics.runway_years).toFixed(1)} yr`}</span>
                            }
                            tone="neutral"
                        />
                    )}
                </KpiStrip>
                {probability_band && (
                    <div
                        className="card"
                        style={{
                            marginBottom: 12,
                            fontSize: 13,
                            color: "var(--fg-soft)",
                        }}
                    >
                        <strong style={{ color: "var(--fg)" }}>
                            {T("fire_probability_title")}
                        </strong>
                        <div className="num" style={{ marginTop: 6 }}>
                            p50: {probability_band?.p50?.years_to_fire ?? "∞"}{" "}
                            yr | p80:{" "}
                            {probability_band?.p80?.years_to_fire ?? "∞"} yr
                        </div>
                    </div>
                )}

                {/* FIRE progress */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ marginBottom: 8 }}>
                        {T("fire_fi_progress_title")}
                    </h3>
                    {metrics.already_fire ? (
                        <div
                            style={{ color: "var(--success)", fontWeight: 600 }}
                        >
                            {T("fire_already_fire")}
                        </div>
                    ) : (
                        <>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 13,
                                    marginBottom: 6,
                                }}
                            >
                                <span style={{ color: "var(--fg-soft)" }}>
                                    {T("fire_progress")}
                                </span>
                                <span
                                    className="num"
                                    style={{ color: "var(--accent)" }}
                                >
                                    {pct.toFixed(1)}%
                                </span>
                            </div>
                            <ProgressBar value={pct} max={100} tone="accent" />
                        </>
                    )}
                </div>

                {/* Coast FIRE */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ marginBottom: 8 }}>{T("fire_coast_title")}</h3>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 12,
                            marginBottom: 8,
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    color: "var(--fg-soft)",
                                    fontSize: 12,
                                }}
                            >
                                {T("fire_coast_number")}
                            </div>
                            <div
                                className="num"
                                style={{ fontSize: 18, fontWeight: 600 }}
                            >
                                {formatEur(parseFloat(coast_fire.coast_number))}
                            </div>
                        </div>
                        <div>
                            <div
                                style={{
                                    color: "var(--fg-soft)",
                                    fontSize: 12,
                                }}
                            >
                                {T("fire_coast_progress")}
                            </div>
                            <div
                                className="num"
                                style={{
                                    fontSize: 18,
                                    fontWeight: 600,
                                    color: coast_fire.already_coast
                                        ? "var(--success)"
                                        : "var(--accent)",
                                }}
                            >
                                {coastPct.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    {coast_fire.already_coast ? (
                        <div
                            style={{
                                color: "var(--success)",
                                fontWeight: 600,
                                fontSize: 13,
                            }}
                        >
                            {T("fire_already_coast")}
                        </div>
                    ) : (
                        <ProgressBar
                            value={coastPct}
                            max={100}
                            tone="success"
                        />
                    )}
                </div>

                {/* Projection chart */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                            flexWrap: "wrap",
                            gap: 8,
                        }}
                    >
                        <h3 style={{ margin: 0 }}>
                            {T("fire_projection_title")}
                        </h3>
                        <div
                            style={{
                                display: "flex",
                                gap: 12,
                                fontSize: 12,
                                flexWrap: "wrap",
                            }}
                        >
                            <span style={{ color: "var(--chart-3)" }}>
                                ● {T("fire_scenario_bear")}
                                {fired_year?.bear
                                    ? ` (yr ${fired_year.bear})`
                                    : ""}
                            </span>
                            <span style={{ color: "var(--chart-1)" }}>
                                ● {T("fire_scenario_base")}
                                {fired_year?.base
                                    ? ` (yr ${fired_year.base})`
                                    : ""}
                            </span>
                            <span style={{ color: "var(--chart-2)" }}>
                                ● {T("fire_scenario_bull")}
                                {fired_year?.bull
                                    ? ` (yr ${fired_year.bull})`
                                    : ""}
                            </span>
                        </div>
                    </div>
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginBottom: 8,
                        }}
                    >
                        {T("fire_projection_desc")}
                    </div>
                    <ProjectionChart
                        projection={projection}
                        firedYear={fired_year}
                    />
                </div>

                {/* Sensitivity — full matrix on desktop, current-row list on mobile */}
                <div style={{ marginBottom: 12 }}>
                    {isDesktop ? (
                        <div className="card">
                            <h3 style={{ marginBottom: 8 }}>
                                {T("fire_sensitivity_title")}
                            </h3>
                            <SensitivityMatrix
                                sensitivity={sensitivity}
                                T={T}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="grouped-list__title">
                                {T("fire_sensitivity_title")}
                            </div>
                            <SensitivityList
                                sensitivity={sensitivity}
                                T={T}
                                onShowFull={() => setMatrixSheetOpen(true)}
                            />
                        </>
                    )}
                </div>

                {Array.isArray(actionable_levers) &&
                    actionable_levers.length > 0 && (
                        <GroupedList title={T("fire_top_levers_title")}>
                            {actionable_levers.slice(0, 3).map((l) => (
                                <GroupedList.Item
                                    key={l.lever}
                                    label={leverLabel(l.lever)}
                                    value={
                                        <strong
                                            className="num"
                                            style={{
                                                color:
                                                    l.delta_years >= 0
                                                        ? "var(--success)"
                                                        : "var(--warning)",
                                            }}
                                        >
                                            {l.delta_years >= 0 ? "-" : "+"}
                                            {Math.abs(l.delta_years)} yr
                                        </strong>
                                    }
                                />
                            ))}
                        </GroupedList>
                    )}
            </div>

            {/* Parameters sheet (former quick-controls card) */}
            <BottomSheet
                open={paramsOpen}
                onClose={() => setParamsOpen(false)}
                ariaLabel={T("fire_quick_controls")}
            >
                <div style={{ padding: "8px 18px 18px" }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: 12,
                        }}
                    >
                        <SheetTitle>{T("fire_quick_controls")}</SheetTitle>
                        <span style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                            {T("fire_mode_label")}: {mode.toUpperCase()}
                        </span>
                    </div>
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginBottom: 14,
                        }}
                    >
                        {T("fire_mode_help")}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        <label
                            style={{ fontSize: 12, color: "var(--fg-soft)" }}
                        >
                            {T("fire_mode_label")}
                            <select
                                className="inp"
                                value={settings.model_mode || "dual"}
                                onChange={(e) => {
                                    const modelMode = e.target.value;
                                    if (
                                        modelMode === "classic" ||
                                        modelMode === "real" ||
                                        modelMode === "dual"
                                    ) {
                                        saveQuickSettings({
                                            model_mode: modelMode,
                                        });
                                    }
                                }}
                                disabled={savingQuick}
                            >
                                <option value="classic">
                                    {T("fire_mode_classic")}
                                </option>
                                <option value="real">
                                    {T("fire_mode_real")}
                                </option>
                                <option value="dual">
                                    {T("fire_mode_dual")}
                                </option>
                            </select>
                        </label>
                        <label
                            style={{ fontSize: 12, color: "var(--fg-soft)" }}
                        >
                            {T("fire_swr_base")}
                            <input
                                className="inp"
                                defaultValue={settings.swr_base || "0.04"}
                                onBlur={(e) =>
                                    saveQuickSettings({
                                        swr_base: e.target.value,
                                    })
                                }
                                disabled={savingQuick}
                            />
                        </label>
                        <label
                            style={{ fontSize: 12, color: "var(--fg-soft)" }}
                        >
                            {T("fire_annual_contribution")}
                            <input
                                className="inp"
                                defaultValue={
                                    settings.annual_contribution || ""
                                }
                                onBlur={(e) =>
                                    saveQuickSettings({
                                        annual_contribution:
                                            e.target.value || null,
                                    })
                                }
                                disabled={savingQuick}
                            />
                        </label>
                        <label
                            style={{ fontSize: 12, color: "var(--fg-soft)" }}
                        >
                            {T("fire_passive_income_retirement")}
                            <input
                                className="inp"
                                defaultValue={
                                    settings.annual_passive_income_retirement ||
                                    "0"
                                }
                                onBlur={(e) =>
                                    saveQuickSettings({
                                        annual_passive_income_retirement:
                                            e.target.value || "0",
                                    })
                                }
                                disabled={savingQuick}
                            />
                        </label>
                    </div>
                    {quickError && (
                        <div
                            style={{
                                marginTop: 10,
                                color: "var(--danger)",
                                fontSize: 12,
                            }}
                        >
                            {quickError}
                        </div>
                    )}
                </div>
            </BottomSheet>

            {/* Full sensitivity matrix sheet (mobile) */}
            <BottomSheet
                open={matrixSheetOpen}
                onClose={() => setMatrixSheetOpen(false)}
                ariaLabel={T("fire_sensitivity_title")}
            >
                <div style={{ padding: "8px 18px 18px" }}>
                    <SheetTitle>{T("fire_sensitivity_title")}</SheetTitle>
                    <SensitivityMatrix sensitivity={sensitivity} T={T} />
                </div>
            </BottomSheet>
        </>
    );
}
