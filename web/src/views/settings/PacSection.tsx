"use client";

import { useSettings } from "../../context/useSettings";
import { useFormatters } from "../../utils/useFormatters";
import type { Asset, RecurringInvestmentPlan } from "../../api/types";
import type { NumericValue, Translator } from "../../types";

type GeneratePacMsg = {
    created?: number;
    skipped?: number;
    price_missing?: number;
};

export function PacSection({
    setDeletePacTarget,
}: {
    setDeletePacTarget: (plan: RecurringInvestmentPlan) => void;
}) {
    const {
        T,
        assets,
        recurringInvestmentPlans,
        showPacModal,
        pacError,
        pacSaving,
        generatePacMsg,
        openPacModal,
        togglePacStatus,
        generatePacForMonth,
    } = useSettings();
    const { formatEur } = useFormatters();
    const pacMsg = generatePacMsg as GeneratePacMsg | null;

    return (
        <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {T("pac_title")}
            </div>
            <div
                style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    marginBottom: 16,
                }}
            >
                {T("pac_desc")}
            </div>
            <div className="row" style={{ gap: 8, marginBottom: 16 }}>
                <button
                    className="btn btn-p btn-sm"
                    onClick={() => openPacModal()}
                >
                    + {T("add_pac")}
                </button>
                <button
                    className="btn btn-g btn-sm"
                    disabled={pacSaving}
                    onClick={() => generatePacForMonth()}
                >
                    {pacSaving ? "..." : T("generate_pac")}
                </button>
            </div>

            {pacMsg && (
                <div
                    style={{
                        marginBottom: 14,
                        padding: "10px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        background: "var(--success-soft)",
                        border: "1px solid var(--success-soft)",
                        color: "var(--success)",
                    }}
                >
                    ✓ {pacMsg.created} {T("generate_done")}, {pacMsg.skipped}{" "}
                    {T("generate_skipped")}
                    {(pacMsg.price_missing ?? 0) > 0 &&
                        ` · ${pacMsg.price_missing} ${T("pac_price_missing")}`}
                </div>
            )}

            {pacError && !showPacModal && (
                <div
                    style={{
                        marginBottom: 14,
                        padding: "10px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        background: "#ff6b6b11",
                        border: "1px solid #ff6b6b33",
                        color: "var(--danger)",
                    }}
                >
                    {pacError}
                </div>
            )}

            {recurringInvestmentPlans.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                    {T("no_pac")}
                </div>
            ) : (
                <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                    {recurringInvestmentPlans.map((plan) => (
                        <PacPlanRow
                            key={plan.id}
                            T={T}
                            plan={plan}
                            target={assets.find(
                                (asset) => asset.id === plan.asset,
                            )}
                            source={assets.find(
                                (asset) => asset.id === plan.source_account,
                            )}
                            pacSaving={pacSaving}
                            openPacModal={openPacModal}
                            togglePacStatus={togglePacStatus}
                            setDeletePacTarget={setDeletePacTarget}
                            formatEur={formatEur}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function PacPlanRow({
    T,
    plan,
    target,
    source,
    pacSaving,
    openPacModal,
    togglePacStatus,
    setDeletePacTarget,
    formatEur,
}: {
    T: Translator;
    plan: RecurringInvestmentPlan;
    target: Asset | undefined;
    source: Asset | undefined;
    pacSaving: boolean;
    openPacModal: (plan?: RecurringInvestmentPlan | null) => void;
    togglePacStatus: (plan: RecurringInvestmentPlan) => unknown;
    setDeletePacTarget: (plan: RecurringInvestmentPlan) => void;
    formatEur: (value: NumericValue) => string;
}) {
    return (
        <div className="card" style={{ padding: "12px 16px" }}>
            <div className="between">
                <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {target?.investment_type_detail?.icon || "📈"}{" "}
                        {plan.name}
                    </div>
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--fg-soft)",
                            marginTop: 3,
                        }}
                    >
                        {target?.name || plan.asset_name} ·{" "}
                        {T(`pac_frequency_${plan.frequency}`)} ·{" "}
                        {source?.name || plan.source_account_name}
                        {plan.generated_transactions_verified
                            ? ` · ${T("pac_verified_yes")}`
                            : ` · ${T("pac_verified_no")}`}
                        {plan.status !== "ACTIVE" && (
                            <span
                                style={{
                                    color: "var(--danger)",
                                    marginLeft: 6,
                                }}
                            >
                                ● {plan.status}
                            </span>
                        )}
                    </div>
                </div>
                <div className="row" style={{ alignItems: "center", gap: 8 }}>
                    <span
                        style={{
                            fontSize: 15,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        {formatEur(plan.amount)}
                    </span>
                    <button
                        className="btn btn-g btn-sm"
                        onClick={() => openPacModal(plan)}
                    >
                        {T("btn_edit")}
                    </button>
                    <button
                        className="btn btn-g btn-sm"
                        disabled={pacSaving}
                        onClick={() => togglePacStatus(plan)}
                    >
                        {plan.status === "ACTIVE"
                            ? T("btn_disable")
                            : T("btn_enable")}
                    </button>
                    <button
                        className="btn btn-r btn-sm"
                        style={{ padding: "4px 8px" }}
                        onClick={() => setDeletePacTarget(plan)}
                    >
                        {T("btn_delete")}
                    </button>
                </div>
            </div>
        </div>
    );
}
