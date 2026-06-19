import { BottomSheet, MonthPicker } from "../../components/ui";

export default function CashflowPeriodSheet({
  periodSheetOpen,
  setPeriodSheetOpen,
  T,
  cfFilters,
  setCfFilters,
  periodMonth,
  periodYear,
  cfPeriodMode,
  setCfPeriodMode,
  setAccountingMonth,
  accountingMonthDateRange,
}) {
  return (
    <BottomSheet
      open={periodSheetOpen}
      onClose={() => setPeriodSheetOpen(false)}
      ariaLabel={T("cf_period")}
    >
      <div style={{ padding: "4px 16px 12px" }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--fg)",
            padding: "2px 2px 12px",
          }}
        >
          {T("cf_period")}
        </div>
        <button
          type="button"
          onClick={() => {
            setCfFilters((p) => ({ ...p, date_from: null, date_to: null }));
            setPeriodSheetOpen(false);
          }}
          style={{
            width: "100%",
            background: !cfFilters.date_from
              ? "var(--accent-soft)"
              : "var(--card-inset)",
            color: !cfFilters.date_from ? "var(--accent-deep)" : "var(--fg)",
            border: 0,
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: !cfFilters.date_from ? 700 : 500,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit",
            marginBottom: 12,
          }}
        >
          {T("time_all")}
        </button>
        <MonthPicker
          month={periodMonth}
          year={periodYear}
          viewMode={cfPeriodMode}
          onChange={({ month, year }) => {
            if (month) {
              setAccountingMonth({ month, year });
              setPeriodSheetOpen(false);
            } else {
              setCfFilters((p) => ({
                ...p,
                date_from: `${year}-01-01`,
                date_to: `${year}-12-31`,
              }));
            }
          }}
          onViewModeChange={(mode) => {
            setCfPeriodMode(mode);
            const baseYear = cfFilters.date_from
              ? new Date(cfFilters.date_from).getFullYear()
              : periodYear;
            if (mode === "year") {
              setCfFilters((p) => ({
                ...p,
                date_from: `${baseYear}-01-01`,
                date_to: `${baseYear}-12-31`,
              }));
            } else {
              const m = cfFilters.date_from
                ? new Date(cfFilters.date_from).getMonth() + 1
                : periodMonth;
              const { from, to } = accountingMonthDateRange(baseYear, m);
              setCfFilters((p) => ({ ...p, date_from: from, date_to: to }));
            }
          }}
        />
      </div>
    </BottomSheet>
  );
}
