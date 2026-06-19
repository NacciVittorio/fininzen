import { useApp } from "../../context/useApp";
import CategorySelect from "../CategorySelect";
import { BottomSheet } from "../ui";

const ALL_CF_TYPES = ["income", "outcome", "transfer", "adjustment"];
const SORT_OPTIONS = ["-date", "date", "-amount", "amount"];

// Collapses the old 8-pill filter strip into one bottom sheet. Filters apply
// live (same handlers the popovers used) so behaviour — including the
// type↔category constraint via toggleCfType — is unchanged; "Mostra risultati"
// just closes the sheet. Period lives in the header now, so it is not here and
// is not counted in the active-filter badge.
function Chip({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "9px 15px",
        borderRadius: 999,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "inherit",
        border: active
          ? "1.5px solid var(--accent)"
          : "1.5px solid var(--rule)",
        background: active ? "var(--accent-soft)" : "var(--card-inset)",
        color: active ? "var(--accent-deep)" : "var(--fg)",
      }}
    >
      {children}
    </button>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ padding: "14px 2px 0" }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "var(--ls-label)",
          color: "var(--fg-soft)",
          textTransform: "uppercase",
          marginBottom: 9,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

export default function CfFiltersSheet({ open, onClose }) {
  const {
    T,
    categories,
    bankAccounts,
    archivedBankAccounts,
    cfFilters,
    setCfFilters,
    toggleCfType,
  } = useApp();

  const typesAll = cfFilters.types.length === 4;
  const accountIds = Array.isArray(cfFilters.account_ids)
    ? cfFilters.account_ids
    : [];

  const toggleAccount = (val) =>
    setCfFilters((p) => {
      const prev = Array.isArray(p.account_ids) ? p.account_ids : [];
      return {
        ...p,
        account_ids: prev.includes(val)
          ? prev.filter((v) => v !== val)
          : [...prev, val],
      };
    });

  const reset = () =>
    setCfFilters((p) => ({
      ...p,
      types: ALL_CF_TYPES,
      verified: null,
      category_ids: [],
      account_ids: [],
      ordering: "-date",
    }));

  const sortLabels = {
    "-date": T("sort_date_desc"),
    date: T("sort_date_asc"),
    "-amount": T("sort_amount_desc"),
    amount: T("sort_amount_asc"),
  };

  const statusOptions = [
    { v: null, l: T("verified_filter_all") },
    { v: true, l: T("verified_filter_yes") },
    { v: false, l: T("verified_filter_no") },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={T("cf_filters")}>
      <div style={{ padding: "2px 16px 4px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "2px 2px 0",
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 800, color: "var(--fg)" }}>
            {T("cf_filters")}
          </span>
          <button
            type="button"
            data-testid="cf-filters-reset"
            onClick={reset}
            style={{
              border: 0,
              background: "none",
              color: "var(--accent)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {T("cf_filters_reset")}
          </button>
        </div>

        <Section label={T("type_filter_label")}>
          <Chip
            active={typesAll}
            onClick={() =>
              setCfFilters((p) => ({
                ...p,
                types: ALL_CF_TYPES,
                category_ids: [],
              }))
            }
          >
            {T("cf_all_types")}
          </Chip>
          {ALL_CF_TYPES.map((type) => (
            <Chip
              key={type}
              active={cfFilters.types.includes(type) && !typesAll}
              onClick={() => toggleCfType(type)}
            >
              {T("cf_" + type)}
            </Chip>
          ))}
        </Section>

        <Section label={T("verified_filter_label")}>
          {statusOptions.map(({ v, l }) => (
            <Chip
              key={String(v)}
              active={cfFilters.verified === v}
              onClick={() => setCfFilters((p) => ({ ...p, verified: v }))}
            >
              {l}
            </Chip>
          ))}
        </Section>

        <Section label={T("account_label")}>
          <Chip
            active={!accountIds.length}
            onClick={() => setCfFilters((p) => ({ ...p, account_ids: [] }))}
          >
            {T("cf_all_accounts")}
          </Chip>
          <Chip
            active={accountIds.includes("none")}
            onClick={() => toggleAccount("none")}
          >
            {T("cf_no_account")}
          </Chip>
          {bankAccounts.map((a) => (
            <Chip
              key={a.id}
              active={accountIds.includes(String(a.id))}
              onClick={() => toggleAccount(String(a.id))}
            >
              {a.name}
            </Chip>
          ))}
          {archivedBankAccounts.map((a) => (
            <Chip
              key={a.id}
              active={accountIds.includes(String(a.id))}
              onClick={() => toggleAccount(String(a.id))}
            >
              {`${a.name} (${T("label_archived")})`}
            </Chip>
          ))}
        </Section>

        <Section label={T("category_label")}>
          <div style={{ width: "100%" }}>
            <CategorySelect
              multiple
              values={cfFilters.category_ids || []}
              onMultiChange={(ids) =>
                setCfFilters((p) => ({ ...p, category_ids: ids }))
              }
              categories={categories}
              categoryType="all"
              placeholder={T("all")}
              selectedLabel={T("selected")}
            />
          </div>
        </Section>

        <Section label={T("sort_label")}>
          {SORT_OPTIONS.map((val) => (
            <Chip
              key={val}
              testId={`cf-sort-option-${val}`}
              active={(cfFilters.ordering || "-date") === val}
              onClick={() => setCfFilters((p) => ({ ...p, ordering: val }))}
            >
              {sortLabels[val]}
            </Chip>
          ))}
        </Section>

        <div style={{ padding: "18px 0 0" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: 0,
              background: "var(--btn-primary-bg)",
              color: "var(--btn-primary-fg)",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {T("cf_filters_apply")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
