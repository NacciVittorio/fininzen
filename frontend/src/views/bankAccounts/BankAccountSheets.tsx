import type { Dispatch, SetStateAction } from "react";
import FieldLabel from "../../components/FieldLabel";
import { BottomSheet, SheetTitle } from "../../components/ui";
import type { Asset, InvestmentType } from "../../api/types";
import type { Translator } from "../../types";
import type { EntityId } from "../../context/feedTypes";
import type { AssetForm } from "../../context/useAppProviderState";

// Asset-like rows surfaced by the archive/unarchive flows (blocking positions to
// migrate, rollback candidates). Only the fields the sheets read are required.
export type AccountMigrationAsset = {
    id: EntityId;
    name: string;
    shares?: string | null;
};

export type MigrateModalState = {
    accountId: EntityId;
    assets: AccountMigrationAsset[];
    destinationId: string;
    transactionCount: number;
};

export type BalanceBlockedModalState = {
    accountName: string;
    currentValue: string;
    currency: string;
};

export type RollbackModalState = {
    accountId: EntityId;
    accountName: string;
    candidates: AccountMigrationAsset[];
};

export type AdjustForm = { new_balance: string };

export default function BankAccountSheets({
    T,
    migrateModal,
    setMigrateModal,
    balanceBlockedModal,
    setBalanceBlockedModal,
    rollbackModal,
    setRollbackModal,
    handleMigrateAndArchive,
    handleRollback,
    bankAccounts,
    bankAccountTypes,
    showAssetModal,
    closeAssetModal,
    editingAssetId,
    assetError,
    assetSaving,
    assetForm,
    setAssetForm,
    saveAsset,
    showAdjustModal,
    closeAdjustModal,
    adjustForm,
    setAdjustForm,
    adjustError,
    saveAdjustBalance,
}: {
    T: Translator;
    migrateModal: MigrateModalState | null;
    setMigrateModal: Dispatch<SetStateAction<MigrateModalState | null>>;
    balanceBlockedModal: BalanceBlockedModalState | null;
    setBalanceBlockedModal: Dispatch<
        SetStateAction<BalanceBlockedModalState | null>
    >;
    rollbackModal: RollbackModalState | null;
    setRollbackModal: Dispatch<SetStateAction<RollbackModalState | null>>;
    handleMigrateAndArchive: () => void | Promise<unknown>;
    handleRollback: () => void | Promise<unknown>;
    bankAccounts: readonly Asset[];
    bankAccountTypes: readonly InvestmentType[];
    showAssetModal: boolean;
    closeAssetModal: () => void;
    editingAssetId: EntityId | null;
    assetError?: string | null;
    assetSaving: boolean;
    assetForm: AssetForm;
    setAssetForm: Dispatch<SetStateAction<AssetForm>>;
    saveAsset: () => void | Promise<unknown>;
    showAdjustModal: boolean;
    closeAdjustModal: () => void;
    adjustForm: AdjustForm;
    setAdjustForm: Dispatch<SetStateAction<AdjustForm>>;
    adjustError?: string | null;
    saveAdjustBalance: () => void | Promise<unknown>;
}) {
    return (
        <>
            <BottomSheet
                open={!!migrateModal}
                onClose={() => setMigrateModal(null)}
                ariaLabel={T("archive_account_migrate_title")}
            >
                {migrateModal && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            padding: "8px 18px 18px",
                        }}
                    >
                        <SheetTitle>
                            {T("archive_account_migrate_title")}
                        </SheetTitle>
                        {migrateModal.transactionCount > 0 && (
                            <p
                                style={{
                                    fontSize: 12,
                                    color: "var(--fg-soft)",
                                    margin: 0,
                                }}
                            >
                                {T("archive_account_tx_warning").replace(
                                    "{n}",
                                    String(migrateModal.transactionCount),
                                )}
                            </p>
                        )}
                        <p
                            style={{
                                fontSize: 13,
                                color: "var(--fg-soft)",
                                margin: 0,
                            }}
                        >
                            {T("archive_account_migrate_body")}
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {migrateModal.assets.map((ba) => (
                                <li
                                    key={ba.id}
                                    style={{ fontSize: 13, color: "var(--fg)" }}
                                >
                                    <strong>{ba.name}</strong> — {ba.shares}{" "}
                                    quote
                                </li>
                            ))}
                        </ul>
                        <select
                            className="inp"
                            value={migrateModal.destinationId}
                            onChange={(e) =>
                                setMigrateModal((p) =>
                                    p
                                        ? {
                                              ...p,
                                              destinationId: e.target.value,
                                          }
                                        : p,
                                )
                            }
                        >
                            <option value="">{T("select_account")}</option>
                            {bankAccounts
                                .filter((b) => b.id !== migrateModal.accountId)
                                .map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                        </select>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 8,
                                marginTop: 6,
                            }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => setMigrateModal(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn btn-p"
                                disabled={!migrateModal.destinationId}
                                onClick={handleMigrateAndArchive}
                            >
                                {T("migrate_and_archive")}
                            </button>
                        </div>
                    </div>
                )}
            </BottomSheet>

            <BottomSheet
                open={!!balanceBlockedModal}
                onClose={() => setBalanceBlockedModal(null)}
                ariaLabel={T("archive_balance_blocked_title")}
            >
                {balanceBlockedModal && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            padding: "8px 18px 18px",
                        }}
                    >
                        <SheetTitle>
                            {T("archive_balance_blocked_title")}
                        </SheetTitle>
                        <p
                            style={{
                                fontSize: 13,
                                color: "var(--fg-soft)",
                                margin: 0,
                            }}
                        >
                            {T("archive_balance_blocked_body")
                                .replace(
                                    "{name}",
                                    balanceBlockedModal.accountName,
                                )
                                .replace(
                                    "{value}",
                                    balanceBlockedModal.currentValue,
                                )
                                .replace(
                                    "{currency}",
                                    balanceBlockedModal.currency,
                                )}
                        </p>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 8,
                                marginTop: 6,
                            }}
                        >
                            <button
                                className="btn btn-p"
                                onClick={() => setBalanceBlockedModal(null)}
                            >
                                {T("btn_close") || "OK"}
                            </button>
                        </div>
                    </div>
                )}
            </BottomSheet>

            <BottomSheet
                open={!!rollbackModal}
                onClose={() => setRollbackModal(null)}
                ariaLabel={T("rollback_modal_title")}
            >
                {rollbackModal && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            padding: "8px 18px 18px",
                        }}
                    >
                        <SheetTitle>{T("rollback_modal_title")}</SheetTitle>
                        <p
                            style={{
                                fontSize: 13,
                                color: "var(--fg-soft)",
                                margin: 0,
                            }}
                        >
                            {T("rollback_modal_body").replace(
                                "{account}",
                                rollbackModal.accountName,
                            )}
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {rollbackModal.candidates.map((inv) => (
                                <li
                                    key={inv.id}
                                    style={{ fontSize: 13, color: "var(--fg)" }}
                                >
                                    <strong>{inv.name}</strong>
                                    {inv.shares &&
                                        parseFloat(inv.shares) > 0 && (
                                            <span
                                                style={{
                                                    color: "var(--fg-soft)",
                                                }}
                                            >
                                                {" "}
                                                — {inv.shares} quote
                                            </span>
                                        )}
                                </li>
                            ))}
                        </ul>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 8,
                                marginTop: 6,
                            }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => setRollbackModal(null)}
                            >
                                {T("rollback_keep")}
                            </button>
                            <button
                                className="btn btn-p"
                                onClick={handleRollback}
                            >
                                {T("rollback_restore")}
                            </button>
                        </div>
                    </div>
                )}
            </BottomSheet>

            <BottomSheet
                open={showAssetModal}
                onClose={closeAssetModal}
                ariaLabel={
                    editingAssetId
                        ? T("modal_edit_asset")
                        : T("btn_add_account")
                }
            >
                {showAssetModal && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 11,
                            padding: "8px 18px 18px",
                        }}
                    >
                        <SheetTitle>
                            {editingAssetId
                                ? T("modal_edit_asset")
                                : T("btn_add_account")}
                        </SheetTitle>
                        <div>
                            <FieldLabel text={T("label_name")} />
                            <input
                                className="inp"
                                placeholder={T("placeholder_name")}
                                value={assetForm.name}
                                onChange={(e) =>
                                    setAssetForm((p) => ({
                                        ...p,
                                        name: e.target.value,
                                    }))
                                }
                            />
                        </div>

                        <div>
                            <FieldLabel text={T("label_account_type")} />
                            <select
                                className="inp"
                                value={assetForm.investment_type}
                                onChange={(e) =>
                                    setAssetForm((p) => ({
                                        ...p,
                                        investment_type: e.target.value,
                                    }))
                                }
                            >
                                <option value="">{T("select_type")}</option>
                                {bankAccountTypes.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!editingAssetId && (
                            <div>
                                <FieldLabel text={T("label_initial_balance")} />
                                <input
                                    className="inp"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={assetForm.initial_balance}
                                    onChange={(e) =>
                                        setAssetForm((p) => ({
                                            ...p,
                                            initial_balance: e.target.value,
                                        }))
                                    }
                                />
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: "var(--fg-soft)",
                                        marginTop: 4,
                                    }}
                                >
                                    {T("hint_initial_balance")}
                                </div>
                            </div>
                        )}

                        <div>
                            <FieldLabel text={T("label_notes")} />
                            <textarea
                                className="inp"
                                placeholder={T("placeholder_notes")}
                                rows={2}
                                value={assetForm.notes}
                                onChange={(e) =>
                                    setAssetForm((p) => ({
                                        ...p,
                                        notes: e.target.value,
                                    }))
                                }
                            />
                        </div>

                        {assetError && (
                            <div
                                style={{
                                    background: "var(--danger-soft)",
                                    border: "1px solid var(--danger-soft)",
                                    borderRadius: 8,
                                    padding: "8px 12px",
                                    fontSize: 13,
                                    color: "var(--danger)",
                                }}
                            >
                                {assetError}
                            </div>
                        )}
                        <div
                            className="row"
                            style={{
                                justifyContent: "flex-end",
                                gap: 8,
                                marginTop: 6,
                            }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={closeAssetModal}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn btn-p"
                                onClick={saveAsset}
                                disabled={assetSaving}
                            >
                                {assetSaving
                                    ? "…"
                                    : editingAssetId
                                      ? T("btn_save")
                                      : T("btn_add")}
                            </button>
                        </div>
                    </div>
                )}
            </BottomSheet>

            <BottomSheet
                open={showAdjustModal}
                onClose={closeAdjustModal}
                ariaLabel={T("modal_adjust_balance")}
            >
                {showAdjustModal && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 11,
                            padding: "8px 18px 18px",
                        }}
                    >
                        <SheetTitle>{T("modal_adjust_balance")}</SheetTitle>
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("adjust_balance_hint")}
                        </div>
                        <div>
                            <FieldLabel text={T("label_new_balance")} />
                            <input
                                className="inp"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={adjustForm.new_balance}
                                onChange={(e) =>
                                    setAdjustForm((p) => ({
                                        ...p,
                                        new_balance: e.target.value,
                                    }))
                                }
                            />
                        </div>
                        {adjustError && (
                            <div
                                style={{
                                    background: "var(--danger-soft)",
                                    border: "1px solid var(--danger-soft)",
                                    borderRadius: 8,
                                    padding: "8px 12px",
                                    fontSize: 13,
                                    color: "var(--danger)",
                                }}
                            >
                                {adjustError}
                            </div>
                        )}
                        <div
                            className="row"
                            style={{
                                justifyContent: "flex-end",
                                gap: 8,
                                marginTop: 6,
                            }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={closeAdjustModal}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn btn-p"
                                onClick={saveAdjustBalance}
                            >
                                {T("btn_save")}
                            </button>
                        </div>
                    </div>
                )}
            </BottomSheet>
        </>
    );
}
