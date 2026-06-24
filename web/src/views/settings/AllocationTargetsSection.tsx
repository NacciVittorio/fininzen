"use client";

import { deleteAllocationTarget } from "../../api/planning";
import { useSettings } from "../../context/useSettings";
import { regroupTargets } from "../../utils/allocationGroups";
import { AllocationTargetInput } from "./AllocationTargetInput";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";

type AllocItem = {
    id: number | string;
    icon?: string;
    name?: string;
    color?: string | null;
    target_id?: number | null;
    target_pct: number | null;
    current_pct: number;
    diff: number | null;
    action: "buy" | "sell" | "ok" | null;
};

type AllocGroup = { key: string; label: string; rows: AllocItem[] };

export function AllocationTargetsSection() {
    const {
        T,
        investmentTypes,
        allocationData,
        apiFetch,
        fetchAllocationData,
    } = useSettings();

    return (
        <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {T("alloc_title")}
            </div>
            <div
                style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    marginBottom: 20,
                }}
            >
                {T("alloc_desc")}
            </div>
            {investmentTypes.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                    {T("alloc_no_types")}
                </div>
            ) : (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 24,
                    }}
                >
                    {[
                        {
                            key: "investments",
                            label: T("alloc_group_investments"),
                            rows: regroupTargets(
                                allocationData,
                                "investments",
                            ) as unknown as AllocItem[],
                        },
                        {
                            key: "accounts",
                            label: T("alloc_group_accounts"),
                            rows: regroupTargets(
                                allocationData,
                                "accounts",
                            ) as unknown as AllocItem[],
                        },
                    ]
                        .filter((group) => group.rows.length > 0)
                        .map((group) => (
                            <AllocationTargetGroup
                                key={group.key}
                                T={T}
                                group={group}
                                apiFetch={apiFetch}
                                fetchAllocationData={fetchAllocationData}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}

function AllocationTargetGroup({
    T,
    group,
    apiFetch,
    fetchAllocationData,
}: {
    T: Translator;
    group: AllocGroup;
    apiFetch: ApiFetcher;
    fetchAllocationData: () => void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
                style={{
                    fontSize: 11,
                    letterSpacing: 0,
                    color: "var(--fg-soft)",
                    textTransform: "uppercase",
                }}
            >
                {group.label}
            </div>
            {group.rows.map((item) => (
                <AllocationTargetRow
                    key={item.id}
                    T={T}
                    item={item}
                    apiFetch={apiFetch}
                    fetchAllocationData={fetchAllocationData}
                />
            ))}
            <div
                style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    textAlign: "right",
                }}
            >
                {T("alloc_total")}:{" "}
                {group.rows
                    .reduce((sum, item) => sum + (item.target_pct || 0), 0)
                    .toFixed(1)}
                %
            </div>
        </div>
    );
}

function AllocationTargetRow({
    T,
    item,
    apiFetch,
    fetchAllocationData,
}: {
    T: Translator;
    item: AllocItem;
    apiFetch: ApiFetcher;
    fetchAllocationData: () => void;
}) {
    return (
        <div className="card" style={{ padding: "14px 16px" }}>
            <div className="between" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {item.icon} {item.name}
                </span>
                <span
                    style={{
                        fontSize: 12,
                        color: "var(--fg-soft)",
                        fontFamily: "var(--font-mono)",
                    }}
                >
                    {T("alloc_current")}: {item.current_pct.toFixed(1)}%
                </span>
            </div>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <AllocationTargetInput
                    item={item}
                    apiFetch={apiFetch}
                    fetchAllocationData={fetchAllocationData}
                />
                <span style={{ color: "var(--fg-soft)" }}>%</span>
                {item.target_pct !== null && (
                    <button
                        className="btn btn-g btn-sm"
                        style={{
                            color: "var(--danger)",
                            padding: "4px 8px",
                            marginLeft: "auto",
                        }}
                        onClick={async () => {
                            if (!item.target_id) return;
                            await deleteAllocationTarget(
                                apiFetch,
                                item.target_id,
                            );
                            fetchAllocationData();
                        }}
                    >
                        x
                    </button>
                )}
            </div>
            {item.target_pct !== null && (
                <AllocationTargetProgress T={T} item={item} />
            )}
        </div>
    );
}

function AllocationTargetProgress({
    T,
    item,
}: {
    T: Translator;
    item: AllocItem;
}) {
    const actionColors: Record<string, string> = {
        buy: "var(--success)",
        sell: "var(--danger)",
        ok: "var(--accent)",
    };
    const actionColor = item.action ? actionColors[item.action] : undefined;

    return (
        <div style={{ marginTop: 10 }}>
            <div
                style={{
                    height: 4,
                    background: "var(--rule)",
                    borderRadius: 2,
                    position: "relative",
                }}
            >
                <div
                    style={{
                        height: "100%",
                        width: `${Math.min(item.current_pct, 100)}%`,
                        background: item.color || "var(--accent)",
                        borderRadius: 2,
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        top: -2,
                        bottom: -2,
                        width: 2,
                        left: `${Math.min(item.target_pct ?? 0, 100)}%`,
                        background: "var(--fg)",
                        borderRadius: 1,
                    }}
                />
            </div>
            <div className="between" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 10, color: "var(--fg-soft)" }}>
                    0%
                </span>
                {item.action && (
                    <span
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: actionColor,
                        }}
                    >
                        {T(`alloc_action_${item.action}`)}{" "}
                        {Math.abs(item.diff ?? 0).toFixed(1)}%
                    </span>
                )}
                <span style={{ fontSize: 10, color: "var(--fg-soft)" }}>
                    100%
                </span>
            </div>
        </div>
    );
}
