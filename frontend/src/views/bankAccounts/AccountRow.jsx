import { useFormatters } from "../../utils/useFormatters";
import PrivacyValue from "../../components/PrivacyValue";
import { CategoryDot, SwipeRow } from "../../components/ui";

export default function AccountRow({
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
