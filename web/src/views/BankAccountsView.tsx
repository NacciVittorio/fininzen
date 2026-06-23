"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useApp } from "../context/useApp";
import { useFormatters } from "../utils/useFormatters";
import AnimatedCurrency from "../components/AnimatedCurrency";
import PrivacyValue from "../components/PrivacyValue";
import {
    LargeTitleHeader,
    KpiStrip,
    KpiCard,
    Fab,
    Icon,
    GroupedList,
    PullToRefresh,
} from "../components/ui";
import type { SwipeAction } from "../components/ui";
import type { Asset } from "../api/types";
import type { EntityId } from "../context/feedTypes";
import AccountDetailSheet from "./bankAccounts/AccountDetailSheet";
import AccountRow from "./bankAccounts/AccountRow";
import BankAccountSheets from "./bankAccounts/BankAccountSheets";
import type {
    AccountMigrationAsset,
    BalanceBlockedModalState,
    MigrateModalState,
    RollbackModalState,
} from "./bankAccounts/BankAccountSheets";

// Shape of the JSON error payload the archive endpoint returns on a 4xx; the
// action layer types it as `unknown`, so narrow it here at the call boundary.
type ArchiveErrorData = {
    error?: string;
    current_value?: string;
    currency?: string;
    blocking_assets?: AccountMigrationAsset[];
    transaction_count?: number;
};

export default function BankAccountsView() {
    const { formatEur } = useFormatters();
    const {
        T,
        bankAccounts,
        archivedBankAccounts,
        investments,
        investmentTypes,
        trendIncomes,
        trendExpenses,
        setCashflowDir,
        showAssetModal,
        editingAssetId,
        assetError,
        assetSaving,
        assetForm,
        setAssetForm,
        showAdjustModal,
        adjustForm,
        setAdjustForm,
        adjustError,
        openAssetAdd,
        openAssetEdit,
        closeAssetModal,
        saveAsset,
        deleteAsset,
        archiveAsset,
        unarchiveAsset,
        moveAsset,
        openAdjustBalance,
        closeAdjustModal,
        saveAdjustBalance,
        setTab,
        fetchAssets,
        fetchPortfolioSummary,
        isFeatureEnabled,
    } = useApp();
    const [migrateModal, setMigrateModal] = useState<MigrateModalState | null>(
        null,
    );
    const [balanceBlockedModal, setBalanceBlockedModal] =
        useState<BalanceBlockedModalState | null>(null);
    const [rollbackModal, setRollbackModal] =
        useState<RollbackModalState | null>(null);
    const [archivedExpanded, setArchivedExpanded] = useState(false);
    const [openSwipeId, setOpenSwipeId] = useState<EntityId | null>(null);
    const [detailAccountId, setDetailAccountId] = useState<EntityId | null>(
        null,
    );

    const handleArchive = async (a: Asset) => {
        const result = await archiveAsset(a.id);
        if (!result) return;
        if (result.ok) return;
        const data = result.data as ArchiveErrorData;
        if (data?.error === "non_zero_balance") {
            setBalanceBlockedModal({
                accountName: a.name,
                currentValue: data.current_value ?? "",
                currency: data.currency ?? "",
            });
            return;
        }
        if (data?.error === "open_positions") {
            setMigrateModal({
                accountId: a.id,
                assets: data.blocking_assets || [],
                destinationId: "",
                transactionCount: data.transaction_count ?? 0,
            });
        }
    };

    const handleMigrateAndArchive = async () => {
        if (!migrateModal?.destinationId) return;
        for (const asset of migrateModal.assets) {
            const r = await moveAsset(asset.id, migrateModal.destinationId);
            if (!r?.ok) return;
        }
        await archiveAsset(migrateModal.accountId);
        setMigrateModal(null);
    };

    const handleUnarchive = async (id: EntityId) => {
        const account = archivedBankAccounts.find((a) => a.id === id);
        const result = await unarchiveAsset(id);
        if (!result?.ok) return;
        const candidates = (result.rollbackCandidates ??
            []) as AccountMigrationAsset[];
        if (candidates.length > 0) {
            setRollbackModal({
                accountId: id,
                accountName: account?.name || "",
                candidates,
            });
        }
    };

    const handleRollback = async () => {
        if (!rollbackModal) return;
        for (const inv of rollbackModal.candidates) {
            const r = await moveAsset(inv.id, rollbackModal.accountId);
            if (!r?.ok) return;
        }
        setRollbackModal(null);
    };
    const masked = (key: string, value: ReactNode) => (
        <PrivacyValue scope="accounts" field={key}>
            {value}
        </PrivacyValue>
    );

    const totalBalance = bankAccounts.reduce(
        (s, a) => s + parseFloat(a.current_value || "0"),
        0,
    );
    const totalInvestments = investments.reduce(
        (s, a) => s + parseFloat(a.current_value || "0"),
        0,
    );
    const totalIncome = trendIncomes.reduce(
        (s, e) => s + parseFloat(String(e.amount || 0)),
        0,
    );
    const totalOutcome = trendExpenses.reduce(
        (s, e) => s + parseFloat(String(e.amount || 0)),
        0,
    );
    const bankAccountTypes = investmentTypes.filter((t) => t.is_bank_account);
    const accountInvestmentsById = useMemo(() => {
        const totals: Record<number, number> = {};
        for (const inv of investments) {
            const sourceId = inv.source_account;
            if (!sourceId) continue;
            totals[sourceId] =
                (totals[sourceId] || 0) + parseFloat(inv.current_value || "0");
        }
        return totals;
    }, [investments]);

    const detailAccount =
        bankAccounts.find((a) => a.id === detailAccountId) ||
        archivedBankAccounts.find((a) => a.id === detailAccountId) ||
        null;

    const hasActiveOverlay =
        showAssetModal ||
        showAdjustModal ||
        !!migrateModal ||
        !!balanceBlockedModal ||
        !!rollbackModal ||
        !!detailAccount;

    useEffect(() => {
        // Refresh on tab mount so Accounts always shows latest balances after tx flows.
        fetchAssets();
        fetchPortfolioSummary();
    }, [fetchAssets, fetchPortfolioSummary]);

    const handlePullRefresh = useCallback(async () => {
        await Promise.all([fetchAssets(), fetchPortfolioSummary()]);
    }, [fetchAssets, fetchPortfolioSummary]);

    const goExpenses = isFeatureEnabled("cashflow")
        ? () => {
              setCashflowDir("expense");
              setTab("expenses");
          }
        : null;
    const goIncome = isFeatureEnabled("cashflow")
        ? () => {
              setCashflowDir("income");
              setTab("expenses");
          }
        : null;
    const goInvestments = isFeatureEnabled("investments")
        ? () => setTab("portfolio")
        : null;

    const swipeActionsFor = (a: Asset): SwipeAction[] =>
        a.is_archived
            ? [
                  {
                      key: "unarchive",
                      label: T("btn_unarchive"),
                      icon: <Icon name="archive" size={15} />,
                      background: "var(--accent)",
                      onPress: () => handleUnarchive(a.id),
                      testId: `account-swipe-unarchive-${a.id}`,
                  },
              ]
            : [
                  {
                      key: "adjust",
                      label: T("btn_adjust_balance"),
                      icon: <Icon name="refresh" size={15} />,
                      background: "var(--accent)",
                      onPress: () => openAdjustBalance(a),
                      testId: `account-swipe-adjust-${a.id}`,
                  },
                  {
                      key: "archive",
                      label: T("btn_archive"),
                      icon: <Icon name="archive" size={15} />,
                      background: "var(--warning)",
                      onPress: () => handleArchive(a),
                      testId: `account-swipe-archive-${a.id}`,
                  },
              ];

    return (
        <>
            <PullToRefresh onRefresh={handlePullRefresh}>
                <div>
                    <LargeTitleHeader
                        eyebrow={T("total_balance")}
                        title={
                            <span className="app-net-worth hero-number">
                                <PrivacyValue
                                    scope="accounts"
                                    field="balance"
                                    revealControl
                                >
                                    <AnimatedCurrency value={totalBalance} />
                                </PrivacyValue>
                            </span>
                        }
                        compactTitle={T("total_balance")}
                        compactValue={
                            <PrivacyValue scope="accounts" field="balance">
                                {formatEur(totalBalance)}
                            </PrivacyValue>
                        }
                    />

                    <KpiStrip columns={3} style={{ marginBottom: 20 }}>
                        {isFeatureEnabled("investments") && (
                            <KpiCard
                                label={T("accounts_investments_total")}
                                value={masked(
                                    "investments",
                                    formatEur(totalInvestments),
                                )}
                                tone="accent"
                                onClick={() => setTab("portfolio")}
                                style={{ cursor: "pointer" }}
                            />
                        )}
                        {isFeatureEnabled("cashflow") && (
                            <KpiCard
                                label={T("accounts_total_income")}
                                value={masked("income", formatEur(totalIncome))}
                                tone="positive"
                                onClick={goIncome ?? undefined}
                                style={{ cursor: "pointer" }}
                            />
                        )}
                        {isFeatureEnabled("cashflow") && (
                            <KpiCard
                                label={T("accounts_total_outcome")}
                                value={masked(
                                    "outcome",
                                    formatEur(totalOutcome),
                                )}
                                tone="danger"
                                onClick={goExpenses ?? undefined}
                                style={{ cursor: "pointer" }}
                            />
                        )}
                    </KpiStrip>

                    {bankAccounts.length === 0 ? (
                        <div
                            style={{
                                textAlign: "center",
                                padding: "60px 20px",
                                color: "var(--fg-soft)",
                            }}
                        >
                            <div style={{ marginBottom: 14, opacity: 0.4 }}>
                                <Icon name="accounts" size={36} />
                            </div>
                            <div style={{ fontSize: 14, marginBottom: 8 }}>
                                {T("no_accounts")}
                            </div>
                        </div>
                    ) : (
                        <GroupedList>
                            {bankAccounts.map((a, i) => (
                                <AccountRow
                                    key={a.id}
                                    a={a}
                                    T={T}
                                    isLast={i === bankAccounts.length - 1}
                                    openSwipeId={openSwipeId}
                                    onRequestSwipeOpen={setOpenSwipeId}
                                    actions={swipeActionsFor(a)}
                                    onTap={() => setDetailAccountId(a.id)}
                                />
                            ))}
                        </GroupedList>
                    )}

                    {/* ── Archived accounts section ────────────────────────────── */}
                    {archivedBankAccounts.length > 0 && (
                        <GroupedList style={{ marginTop: 24 }}>
                            <GroupedList.Item
                                label={`${T("label_archived_accounts")} (${archivedBankAccounts.length})`}
                                icon={<Icon name="archive" size={16} />}
                                onClick={() => setArchivedExpanded((p) => !p)}
                                action={
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            display: "inline-block",
                                            color: "var(--fg-faint)",
                                            fontSize: 17,
                                            transform: archivedExpanded
                                                ? "rotate(90deg)"
                                                : "rotate(0deg)",
                                            transition: "transform 0.18s ease",
                                        }}
                                    >
                                        ›
                                    </span>
                                }
                            />
                            {archivedExpanded &&
                                archivedBankAccounts.map((a, i) => (
                                    <AccountRow
                                        key={a.id}
                                        a={a}
                                        T={T}
                                        isLast={
                                            i ===
                                            archivedBankAccounts.length - 1
                                        }
                                        openSwipeId={openSwipeId}
                                        onRequestSwipeOpen={setOpenSwipeId}
                                        actions={swipeActionsFor(a)}
                                        onTap={() => setDetailAccountId(a.id)}
                                    />
                                ))}
                        </GroupedList>
                    )}
                </div>
            </PullToRefresh>

            {/* ── Sheets — rendered outside PullToRefresh on purpose: the PTR
           transform breaks position:fixed descendants ── */}

            <AccountDetailSheet
                a={detailAccount}
                open={!!detailAccount}
                onClose={() => setDetailAccountId(null)}
                T={T}
                trendIncomes={detailAccount?.is_archived ? [] : trendIncomes}
                trendExpenses={detailAccount?.is_archived ? [] : trendExpenses}
                accountInvestments={
                    detailAccount
                        ? accountInvestmentsById[detailAccount.id] || 0
                        : 0
                }
                onEdit={openAssetEdit}
                onAdjust={openAdjustBalance}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
                onDelete={deleteAsset}
                onGoExpenses={goExpenses}
                onGoIncome={goIncome}
                onGoInvestments={
                    detailAccount?.is_archived ? null : goInvestments
                }
            />

            <BankAccountSheets
                T={T}
                migrateModal={migrateModal}
                setMigrateModal={setMigrateModal}
                balanceBlockedModal={balanceBlockedModal}
                setBalanceBlockedModal={setBalanceBlockedModal}
                rollbackModal={rollbackModal}
                setRollbackModal={setRollbackModal}
                handleMigrateAndArchive={handleMigrateAndArchive}
                handleRollback={handleRollback}
                bankAccounts={bankAccounts}
                bankAccountTypes={bankAccountTypes}
                showAssetModal={showAssetModal}
                closeAssetModal={closeAssetModal}
                editingAssetId={editingAssetId}
                assetError={assetError}
                assetSaving={assetSaving}
                assetForm={assetForm}
                setAssetForm={setAssetForm}
                saveAsset={saveAsset}
                showAdjustModal={showAdjustModal}
                closeAdjustModal={closeAdjustModal}
                adjustForm={adjustForm}
                setAdjustForm={setAdjustForm}
                adjustError={adjustError}
                saveAdjustBalance={saveAdjustBalance}
            />

            <Fab
                label={T("btn_add_account")}
                onClick={() => openAssetAdd(bankAccountTypes[0])}
                hidden={hasActiveOverlay}
            />
        </>
    );
}
