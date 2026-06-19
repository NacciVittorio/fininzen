import { Icon, SegmentedControl } from "../../components/ui";

export function CashflowFeedControls({
  T,
  cfFilters,
  setCfFilters,
  activeFilterCount,
  setFiltersSheetOpen,
  enterCfSelectionMode,
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 10,
      }}
    >
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--fg-soft)",
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <Icon name="search" size={16} />
        </span>
        <input
          data-testid="cf-search-input"
          type="search"
          value={cfFilters.search ?? ""}
          onChange={(e) =>
            setCfFilters((p) => ({ ...p, search: e.target.value }))
          }
          placeholder={T("cf_search_placeholder")}
          aria-label={T("cf_search_placeholder")}
          style={{
            width: "100%",
            background: "var(--card-inset)",
            border: "1px solid var(--rule)",
            borderRadius: 10,
            color: "var(--fg)",
            padding: "9px 36px 9px 36px",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {cfFilters.search && (
          <button
            type="button"
            data-testid="cf-search-clear"
            onClick={() => setCfFilters((p) => ({ ...p, search: "" }))}
            aria-label={T("cf_search_clear")}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: 0,
              color: "var(--fg-soft)",
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
              fontSize: 16,
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        )}
      </div>

      <button
        type="button"
        data-testid="cf-filters-open"
        onClick={() => setFiltersSheetOpen(true)}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          border: "1px solid var(--rule)",
          cursor: "pointer",
          background: activeFilterCount ? "var(--accent)" : "var(--card-inset)",
          color: activeFilterCount ? "var(--btn-primary-fg)" : "var(--fg)",
          borderRadius: 10,
          padding: "0 14px",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        {T("cf_filters")}
        {activeFilterCount > 0 && (
          <span
            data-testid="cf-filters-count"
            style={{
              background: "var(--card)",
              color: "var(--accent)",
              borderRadius: 999,
              minWidth: 18,
              height: 18,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11.5,
              fontWeight: 800,
              padding: "0 5px",
            }}
          >
            {activeFilterCount}
          </span>
        )}
      </button>

      <button
        type="button"
        data-testid="cf-select-mode"
        onClick={() => enterCfSelectionMode()}
        style={{
          border: "1px solid var(--rule)",
          cursor: "pointer",
          background: "var(--card-inset)",
          color: "var(--fg)",
          borderRadius: 10,
          padding: "0 14px",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "inherit",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        {T("cf_bulk_select")}
      </button>
    </div>
  );
}

export function UnverifiedCashflowBanner({ T, unverifiedCount, setCfFilters }) {
  return (
    <button
      type="button"
      data-testid="cf-unverified-banner"
      onClick={() => setCfFilters((p) => ({ ...p, verified: false }))}
      style={{
        width: "100%",
        marginBottom: 10,
        padding: "11px 14px",
        borderRadius: 12,
        border: "1px solid var(--warning-ring)",
        cursor: "pointer",
        background: "var(--warning-soft)",
        color: "var(--warning)",
        fontSize: 13.5,
        fontWeight: 600,
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontFamily: "inherit",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true">⚠︎</span>
        {T("cf_unverified_nudge").replace("{count}", String(unverifiedCount))}
      </span>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
        {T("cf_review")} ›
      </span>
    </button>
  );
}

export function CashflowSelectionBanner({
  T,
  cfItems,
  cfTotalCount,
  cfFilters,
  cfSelectedCount,
  cfSelectAllFiltered,
  exitCfSelectionMode,
  selectAllFilteredCf,
  selectVisibleCf,
  clearCfSelection,
}) {
  return (
    <div
      data-testid="cf-bulk-banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "var(--accent-soft)",
        borderRadius: 10,
        marginBottom: 8,
        fontSize: 12,
      }}
    >
      <button
        type="button"
        data-testid="cf-select-exit"
        onClick={exitCfSelectionMode}
        style={{
          border: 0,
          background: "none",
          color: "var(--accent-deep)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          padding: 0,
        }}
      >
        {T("btn_cancel")}
      </button>
      <span
        style={{
          color: "var(--accent-deep)",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
        aria-live="polite"
      >
        {T("cf_bulk_selected_count").replace(
          "{count}",
          String(cfSelectedCount),
        )}
      </span>
      {cfTotalCount > cfItems.length && (
        <div
          data-testid="cf-bulk-mode-segmented"
          style={{ marginLeft: "auto", minWidth: 0 }}
          title={
            cfFilters.types.length === 1
              ? undefined
              : T("cf_bulk_filter_to_select_all")
          }
        >
          <SegmentedControl
            value={cfSelectAllFiltered ? "filtered" : "visible"}
            onChange={(mode) => {
              if (mode === "filtered") {
                if (cfFilters.types.length !== 1) return;
                selectAllFilteredCf();
              } else {
                selectVisibleCf();
              }
            }}
            options={[
              {
                value: "visible",
                label: T("cf_bulk_select_mode_visible").replace(
                  "{count}",
                  String(cfItems.length),
                ),
              },
              {
                value: "filtered",
                label: T("cf_bulk_select_mode_filtered").replace(
                  "{count}",
                  String(cfTotalCount),
                ),
              },
            ]}
          />
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginLeft: cfTotalCount > cfItems.length ? 0 : "auto",
          flexWrap: "wrap",
        }}
      >
        <button
          data-testid="cf-bulk-select-all"
          onClick={selectVisibleCf}
          className="btn btn-g btn-sm"
          disabled={cfSelectedCount === cfItems.length}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            opacity: cfSelectedCount === cfItems.length ? 0.5 : 1,
          }}
        >
          {T("cf_bulk_select_all")}
        </button>
        <button
          data-testid="cf-bulk-deselect-all"
          onClick={clearCfSelection}
          className="btn btn-g btn-sm"
          disabled={cfSelectedCount === 0}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            opacity: cfSelectedCount === 0 ? 0.5 : 1,
          }}
        >
          {T("cf_bulk_deselect_all")}
        </button>
      </div>
    </div>
  );
}
