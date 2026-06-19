import { useAuth } from "../../context/useAuth";

export function ExtraSettingsSection({
  resetMsg,
  setResetConfirm,
  setResetUnderstood,
  setDemoConfirm,
  setDemoUnderstood,
}) {
  const { T, isFeatureEnabled } = useAuth();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {isFeatureEnabled("cashflow") && (
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {T("reset_transactions")}
          </div>
          <div
            style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 14 }}
          >
            {T("reset_transactions_desc")}
          </div>
          <button
            className="btn btn-r"
            style={{ width: "100%", padding: "10px" }}
            onClick={() => {
              setResetConfirm("transactions");
              setResetUnderstood(false);
            }}
          >
            {T("reset_transactions")}
          </button>
        </div>
      )}

      {(isFeatureEnabled("accounts") || isFeatureEnabled("investments")) && (
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {T("reset_portfolio")}
          </div>
          <div
            style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 14 }}
          >
            {T("reset_portfolio_desc")}
          </div>
          <button
            className="btn btn-r"
            style={{ width: "100%", padding: "10px" }}
            onClick={() => {
              setResetConfirm("portfolio");
              setResetUnderstood(false);
            }}
          >
            {T("reset_portfolio")}
          </button>
        </div>
      )}

      {resetMsg && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            fontSize: 13,
            background:
              resetMsg.deleted > 0 ? "var(--success-soft)" : "var(--rule)",
            color: resetMsg.deleted > 0 ? "var(--success)" : "var(--fg-soft)",
            border: `1px solid ${
              resetMsg.deleted > 0 ? "var(--success-soft)" : "var(--rule)"
            }`,
          }}
        >
          {resetMsg.deleted > 0
            ? `${T("reset_success")} (${resetMsg.deleted})`
            : T("reset_empty")}
        </div>
      )}

      <div className="card">
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          {T("load_demo")}
        </div>
        <div
          style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 14 }}
        >
          {T("load_demo_desc")}
        </div>
        <button
          className="btn"
          style={{
            width: "100%",
            padding: "10px",
            background: "var(--accent-ring)",
            color: "var(--accent)",
            border: "1px solid var(--accent-ring)",
            borderRadius: 10,
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
          onClick={() => {
            setDemoConfirm(true);
            setDemoUnderstood(false);
          }}
        >
          {T("load_demo")}
        </button>
      </div>
    </div>
  );
}
