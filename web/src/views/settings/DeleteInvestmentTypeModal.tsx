"use client";

import type { Dispatch, SetStateAction } from "react";
import Modal from "../../components/Modal";
import type { InvestmentType } from "../../api/types";
import type { DeleteInvestmentTypeFlow } from "../../context/useAppProviderState";
import type { Translator } from "../../types";

export function DeleteInvestmentTypeModal({
    T,
    deleteInvTypeFlow,
    setDeleteInvTypeFlow,
    investmentTypes,
    confirmDeleteInvType,
}: {
    T: Translator;
    deleteInvTypeFlow: DeleteInvestmentTypeFlow | null;
    setDeleteInvTypeFlow: Dispatch<
        SetStateAction<DeleteInvestmentTypeFlow | null>
    >;
    investmentTypes: readonly InvestmentType[];
    confirmDeleteInvType: () => void;
}) {
    return (
        <>
            {deleteInvTypeFlow && (
                <Modal
                    title={
                        deleteInvTypeFlow.invType.is_bank_account
                            ? T("modal_delete_account_type")
                            : T("modal_delete_inv_type")
                    }
                    onClose={() => setDeleteInvTypeFlow(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 14,
                        }}
                    >
                        {/* Type info */}
                        <div
                            style={{
                                background: "var(--card-inset)",
                                borderRadius: 10,
                                padding: "10px 14px",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                            }}
                        >
                            <div
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    background: `${deleteInvTypeFlow.invType.color}22`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 14,
                                    flexShrink: 0,
                                }}
                            >
                                {deleteInvTypeFlow.invType.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>
                                    {deleteInvTypeFlow.invType.name}
                                </div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: "var(--fg-soft)",
                                    }}
                                >
                                    {deleteInvTypeFlow.invType.asset_count || 0}{" "}
                                    {T("assets")}
                                </div>
                            </div>
                        </div>

                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("inv_type_has_assets")}{" "}
                            <strong style={{ color: "var(--fg)" }}>
                                {deleteInvTypeFlow.invType.asset_count || 0}{" "}
                                {T("assets")}
                            </strong>
                            .
                        </div>

                        {(
                            [
                                ["delete", T("delete_all_assets")],
                                ["reassign", T("reassign_assets_to")],
                                ["null", T("keep_assets_untyped")],
                            ] as [string, string][]
                        ).map(([val, label]) => {
                            const otherTypes = investmentTypes.filter(
                                (t) => t.id !== deleteInvTypeFlow.invType.id,
                            );
                            return (
                                <div
                                    key={val}
                                    onClick={() =>
                                        setDeleteInvTypeFlow((p) =>
                                            p
                                                ? {
                                                      ...p,
                                                      assetsChoice: val,
                                                      assetsTarget: null,
                                                  }
                                                : p,
                                        )
                                    }
                                    style={{
                                        display: "flex",
                                        alignItems: "flex-start",
                                        gap: 10,
                                        padding: "10px 12px",
                                        borderRadius: 10,
                                        cursor: "pointer",
                                        border: "1px solid",
                                        borderColor:
                                            deleteInvTypeFlow.assetsChoice ===
                                            val
                                                ? "var(--accent-ring)"
                                                : "var(--rule)",
                                        background:
                                            deleteInvTypeFlow.assetsChoice ===
                                            val
                                                ? "var(--accent-ring)"
                                                : "var(--card-inset)",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        readOnly
                                        checked={
                                            deleteInvTypeFlow.assetsChoice ===
                                            val
                                        }
                                        style={{ marginTop: 2, flexShrink: 0 }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div
                                            style={{
                                                fontSize: 13,
                                                color: "var(--fg)",
                                            }}
                                        >
                                            {label}
                                        </div>
                                        {val === "reassign" &&
                                            deleteInvTypeFlow.assetsChoice ===
                                                "reassign" && (
                                                <select
                                                    className="inp"
                                                    style={{
                                                        marginTop: 8,
                                                        fontSize: 12,
                                                    }}
                                                    value={
                                                        deleteInvTypeFlow.assetsTarget ||
                                                        ""
                                                    }
                                                    onChange={(e) =>
                                                        setDeleteInvTypeFlow(
                                                            (p) =>
                                                                p
                                                                    ? {
                                                                          ...p,
                                                                          assetsTarget:
                                                                              e
                                                                                  .target
                                                                                  .value,
                                                                      }
                                                                    : p,
                                                        )
                                                    }
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <option value="">
                                                        {T("select_type")}
                                                    </option>
                                                    {otherTypes.map((t) => (
                                                        <option
                                                            key={t.id}
                                                            value={t.id}
                                                        >
                                                            {t.icon} {t.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                    </div>
                                </div>
                            );
                        })}

                        <div
                            className="row"
                            style={{
                                justifyContent: "flex-end",
                                gap: 8,
                                marginTop: 4,
                            }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => setDeleteInvTypeFlow(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn"
                                disabled={
                                    !deleteInvTypeFlow.assetsChoice ||
                                    (deleteInvTypeFlow.assetsChoice ===
                                        "reassign" &&
                                        !deleteInvTypeFlow.assetsTarget)
                                }
                                style={{
                                    background:
                                        !deleteInvTypeFlow.assetsChoice ||
                                        (deleteInvTypeFlow.assetsChoice ===
                                            "reassign" &&
                                            !deleteInvTypeFlow.assetsTarget)
                                            ? "var(--danger)"
                                            : "var(--danger)",
                                    color:
                                        !deleteInvTypeFlow.assetsChoice ||
                                        (deleteInvTypeFlow.assetsChoice ===
                                            "reassign" &&
                                            !deleteInvTypeFlow.assetsTarget)
                                            ? "var(--fg-soft)"
                                            : "var(--btn-primary-fg)",
                                    padding: "10px 18px",
                                    border: "none",
                                    borderRadius: 10,
                                    fontFamily: "inherit",
                                    fontSize: 14,
                                    fontWeight: 500,
                                    cursor:
                                        !deleteInvTypeFlow.assetsChoice ||
                                        (deleteInvTypeFlow.assetsChoice ===
                                            "reassign" &&
                                            !deleteInvTypeFlow.assetsTarget)
                                            ? "not-allowed"
                                            : "pointer",
                                }}
                                onClick={confirmDeleteInvType}
                            >
                                {T("btn_confirm")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
