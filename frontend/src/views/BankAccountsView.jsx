import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../context/useApp";
import { useFormatters } from "../utils/useFormatters";
import FieldLabel from "../components/FieldLabel";
import AnimatedCurrency from "../components/AnimatedCurrency";
import PrivacyValue from "../components/PrivacyValue";
import {
  LargeTitleHeader,
  KpiStrip,
  KpiCard,
  Fab,
  Icon,
  GroupedList,
  SwipeRow,
  BottomSheet,
  CategoryDot,
  PullToRefresh,
  SheetTitle,
} from "../components/ui";

// One account row inside the grouped list: name + type, value on the right.
// Swipe → quick actions, tap → detail sheet.
function AccountRow({
  a,
  T,
  isLast,
  openSwipeId,
  onRequestSwipeOpen,
  actions,
  onTap,
}) {
  const { formatEur } = useFormatters();
  const typeDetail = a.investment_type_detail;
  return (
    <SwipeRow
      rowId={a.id}
      openRowId={openSwipeId}
      onRequestOpen={onRequestSwipeOpen}
      actions={actions}
      onTap={onTap}
      style={{ borderBottom: isLast ? "none" : "1px solid var(--rule)" }}
      rowStyle={{ padding: "13px 16px" }}
      ariaLabel={a.name}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: a.is_archived ? "var(--fg-soft)" : "var(--fg)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {a.name}
          </span>
          {a.is_archived && (
            <span
              className="tag"
              style={{
                background: "var(--card-inset)",
                color: "var(--fg-soft)",
                fontSize: 10,
                flexShrink: 0,
              }}
            >
              {T("label_archived")}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 3,
            fontSize: 11,
            color: "var(--fg-soft)",
          }}
        >
          <CategoryDot color={typeDetail?.color || "var(--accent)"} size={6} />
          {typeDetail?.name || "Account"}
        </div>
      </div>
      <span
        className="num"
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--fg)",
          flexShrink: 0,
        }}
      >
        <PrivacyValue scope="accounts" field="account_values">
          {formatEur(a.current_value)}
        </PrivacyValue>
      </span>
      <span
        aria-hidden="true"
        style={{ color: "var(--fg-faint)", fontSize: 17, flexShrink: 0 }}
      >
        ›
      </span>
    </SwipeRow>
  );
}

function StatTile({ label, value, color, onClick }) {
  return (
    <div
      className={onClick ? "pressable" : undefined}
      onClick={onClick}
      style={{
        background: "var(--card-inset)",
        borderRadius: "var(--r-input)",
        padding: "10px 12px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        className="label"
        style={{
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {label}
        {onClick && <span aria-hidden="true">›</span>}
      </div>
      <div
        className="num"
        style={{ fontSize: 14, fontWeight: 700, color: color || "var(--fg)" }}
      >
        {value}
      </div>
    </div>
  );
}

// Tap → detail: the former expanded card content (2×2 stats + actions),
// shown in a bottom sheet on every viewport.
function AccountDetailSheet({
  a,
  open,
  onClose,
  T,
  trendIncomes,
  trendExpenses,
  accountInvestments,
  onEdit,
  onAdjust,
  onArchive,
  onUnarchive,
  onDelete,
  onGoExpenses,
  onGoIncome,
  onGoInvestments,
}) {
  const { formatEur } = useFormatters();
  if (!a) return null;
  const typeDetail = a.investment_type_detail;
  const acctIncome = trendIncomes
    .filter((e) => String(e.linked_asset) === String(a.id))
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const acctOutcome = trendExpenses
    .filter((e) => String(e.linked_asset) === String(a.id))
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const masked = (key, value) => (
    <PrivacyValue scope="accounts" field={key}>
      {value}
    </PrivacyValue>
  );
  const actionBtnStyle = {
    flex: 1,
    background: "var(--card-inset)",
    border: "1px solid var(--rule)",
    color: "var(--fg)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    minHeight: 44,
    padding: "10px 12px",
    borderRadius: "var(--r-input)",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={a.name}>
      <div style={{ padding: "8px 18px 18px" }}>
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: "var(--fg)",
              letterSpacing: "var(--ls-h-small)",
            }}
          >
            {a.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontSize: 12,
              color: "var(--fg-soft)",
            }}
          >
            <CategoryDot
              color={typeDetail?.color || "var(--accent)"}
              size={7}
            />
            {typeDetail?.name || "Account"}
            {a.is_archived && <span>· {T("label_archived")}</span>}
          </div>
        </div>

        <div
          className="mob-grid-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <StatTile
            label={T("current")}
            value={masked("account_values", formatEur(a.current_value))}
          />
          {onGoInvestments && (
            <StatTile
              label={T("accounts_investments_total")}
              value={masked("account_values", formatEur(accountInvestments))}
              color="var(--accent)"
              onClick={() => {
                onClose();
                onGoInvestments();
              }}
            />
          )}
          {onGoExpenses && acctOutcome > 0 && (
            <StatTile
              label={T("direction_expense")}
              value={masked("account_values", formatEur(acctOutcome))}
              color="var(--danger)"
              onClick={() => {
                onClose();
                onGoExpenses();
              }}
            />
          )}
          {onGoIncome && acctIncome > 0 && (
            <StatTile
              label={T("direction_income")}
              value={masked("account_values", formatEur(acctIncome))}
              color="var(--success)"
              onClick={() => {
                onClose();
                onGoIncome();
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!a.is_archived && onEdit && (
            <button
              className="pressable"
              style={actionBtnStyle}
              onClick={() => {
                onClose();
                onEdit(a);
              }}
            >
              {T("btn_edit", "Edit")}
            </button>
          )}
          {!a.is_archived && onAdjust && (
            <button
              className="pressable"
              style={actionBtnStyle}
              onClick={() => {
                onClose();
                onAdjust(a);
              }}
            >
              {T("btn_adjust_balance")}
            </button>
          )}
          {!a.is_archived && onArchive && (
            <button
              className="pressable"
              style={{ ...actionBtnStyle, color: "var(--warning)" }}
              onClick={() => {
                onClose();
                onArchive(a);
              }}
            >
              <Icon name="archive" size={15} /> {T("btn_archive")}
            </button>
          )}
          {a.is_archived && onUnarchive && (
            <button
              className="pressable"
              style={{ ...actionBtnStyle, color: "var(--accent)" }}
              onClick={() => {
                onClose();
                onUnarchive(a.id);
              }}
            >
              {T("btn_unarchive")}
            </button>
          )}
          {onDelete && (
            <button
              className="pressable"
              style={{
                ...actionBtnStyle,
                color: "var(--danger)",
                flex: "0 0 auto",
              }}
              onClick={() => {
                if (window.confirm(T("asset_delete_confirm"))) {
                  onClose();
                  onDelete(a.id);
                }
              }}
            >
              <Icon name="trash" size={15} /> {T("btn_delete", "Delete")}
            </button>
          )}
        </div>

        {a.notes && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "var(--fg-soft)",
              fontStyle: "italic",
            }}
          >
            {a.notes}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

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
  const [migrateModal, setMigrateModal] = useState(null);
  const [balanceBlockedModal, setBalanceBlockedModal] = useState(null);
  const [rollbackModal, setRollbackModal] = useState(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [openSwipeId, setOpenSwipeId] = useState(null);
  const [detailAccountId, setDetailAccountId] = useState(null);

  const handleArchive = async (a) => {
    const result = await archiveAsset(a.id);
    if (!result) return;
    if (result.ok) return;
    if (result.data?.error === "non_zero_balance") {
      setBalanceBlockedModal({
        accountName: a.name,
        currentValue: result.data.current_value,
        currency: result.data.currency,
      });
      return;
    }
    if (result.data?.error === "open_positions") {
      setMigrateModal({
        accountId: a.id,
        assets: result.data.blocking_assets || [],
        destinationId: "",
        transactionCount: result.data.transaction_count ?? 0,
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

  const handleUnarchive = async (id) => {
    const account = archivedBankAccounts.find((a) => a.id === id);
    const result = await unarchiveAsset(id);
    if (!result?.ok) return;
    if (result.rollbackCandidates?.length > 0) {
      setRollbackModal({
        accountId: id,
        accountName: account?.name || "",
        candidates: result.rollbackCandidates,
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
  const masked = (key, value) => (
    <PrivacyValue scope="accounts" field={key}>
      {value}
    </PrivacyValue>
  );

  const totalBalance = bankAccounts.reduce(
    (s, a) => s + parseFloat(a.current_value || 0),
    0,
  );
  const totalInvestments = investments.reduce(
    (s, a) => s + parseFloat(a.current_value || 0),
    0,
  );
  const totalIncome = trendIncomes.reduce(
    (s, e) => s + parseFloat(e.amount || 0),
    0,
  );
  const totalOutcome = trendExpenses.reduce(
    (s, e) => s + parseFloat(e.amount || 0),
    0,
  );
  const bankAccountTypes = investmentTypes.filter((t) => t.is_bank_account);
  const accountInvestmentsById = useMemo(() => {
    const totals = {};
    for (const inv of investments) {
      const sourceId = inv.source_account;
      if (!sourceId) continue;
      totals[sourceId] =
        (totals[sourceId] || 0) + parseFloat(inv.current_value || 0);
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

  const swipeActionsFor = (a) =>
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
                <PrivacyValue scope="accounts" field="balance" revealControl>
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
                value={masked("investments", formatEur(totalInvestments))}
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
                value={masked("outcome", formatEur(totalOutcome))}
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
                    isLast={i === archivedBankAccounts.length - 1}
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
          detailAccount ? accountInvestmentsById[detailAccount.id] || 0 : 0
        }
        onEdit={openAssetEdit}
        onAdjust={openAdjustBalance}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onDelete={deleteAsset}
        onGoExpenses={goExpenses}
        onGoIncome={goIncome}
        onGoInvestments={detailAccount?.is_archived ? null : goInvestments}
      />

      {/* Migrate & Archive sheet */}
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
            <SheetTitle>{T("archive_account_migrate_title")}</SheetTitle>
            {migrateModal.transactionCount > 0 && (
              <p style={{ fontSize: 12, color: "var(--fg-soft)", margin: 0 }}>
                {T("archive_account_tx_warning").replace(
                  "{n}",
                  migrateModal.transactionCount,
                )}
              </p>
            )}
            <p style={{ fontSize: 13, color: "var(--fg-soft)", margin: 0 }}>
              {T("archive_account_migrate_body")}
            </p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {migrateModal.assets.map((ba) => (
                <li key={ba.id} style={{ fontSize: 13, color: "var(--fg)" }}>
                  <strong>{ba.name}</strong> — {ba.shares} quote
                </li>
              ))}
            </ul>
            <select
              className="inp"
              value={migrateModal.destinationId}
              onChange={(e) =>
                setMigrateModal((p) => ({
                  ...p,
                  destinationId: e.target.value,
                }))
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

      {/* Balance blocked sheet — saldo non zero */}
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
            <SheetTitle>{T("archive_balance_blocked_title")}</SheetTitle>
            <p style={{ fontSize: 13, color: "var(--fg-soft)", margin: 0 }}>
              {T("archive_balance_blocked_body")
                .replace("{name}", balanceBlockedModal.accountName)
                .replace("{value}", balanceBlockedModal.currentValue)
                .replace("{currency}", balanceBlockedModal.currency)}
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

      {/* Rollback sheet — investimenti precedentemente migrati */}
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
            <p style={{ fontSize: 13, color: "var(--fg-soft)", margin: 0 }}>
              {T("rollback_modal_body").replace(
                "{account}",
                rollbackModal.accountName,
              )}
            </p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {rollbackModal.candidates.map((inv) => (
                <li key={inv.id} style={{ fontSize: 13, color: "var(--fg)" }}>
                  <strong>{inv.name}</strong>
                  {inv.shares && parseFloat(inv.shares) > 0 && (
                    <span style={{ color: "var(--fg-soft)" }}>
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
              <button className="btn btn-p" onClick={handleRollback}>
                {T("rollback_restore")}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Add/Edit sheet — filtra solo tipi conto corrente */}
      <BottomSheet
        open={showAssetModal}
        onClose={closeAssetModal}
        ariaLabel={
          editingAssetId ? T("modal_edit_asset") : T("btn_add_account")
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
              {editingAssetId ? T("modal_edit_asset") : T("btn_add_account")}
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
              <button className="btn btn-g" onClick={closeAssetModal}>
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

      {/* Adjust balance sheet */}
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
              <button className="btn btn-g" onClick={closeAdjustModal}>
                {T("btn_cancel")}
              </button>
              <button className="btn btn-p" onClick={saveAdjustBalance}>
                {T("btn_save")}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <Fab
        label={T("btn_add_account")}
        onClick={() => openAssetAdd(bankAccountTypes[0] ?? null)}
        hidden={hasActiveOverlay}
      />
    </>
  );
}
