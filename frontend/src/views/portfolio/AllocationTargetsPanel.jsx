import { PieChart } from "../../components/Charts";
import { CategoryDot, Pill, SegmentedControl } from "../../components/ui";

export default function AllocationTargetsPanel({
  allocationData,
  regroupedAlloc,
  allocChartType,
  setAllocChartType,
  allocGroup,
  setAllocGroup,
  setTab,
  setSettingsMenu,
  T,
}) {
  if (allocationData.filter((a) => a.target_pct !== null).length === 0) {
    return null;
  }

  return (
    <>
      <div
        style={{
          height: 1,
          background: "var(--card-inset)",
          margin: "24px 0 20px",
        }}
      />
      <div
        style={{
          fontSize: 11,
          letterSpacing: 0,
          color: "var(--fg-soft)",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {T("alloc_title")}
      </div>
      <div className="card">
        <div className="between" style={{ marginBottom: 14 }}>
          <SegmentedControl
            options={[
              { value: "bar", label: T("chart_bar") },
              { value: "pie", label: T("chart_pie") },
            ]}
            value={allocChartType}
            onChange={setAllocChartType}
          />
          <button
            className="btn btn-g btn-sm pressable"
            style={{ fontSize: 11 }}
            onClick={() => {
              setTab("settings");
              setSettingsMenu("allocation");
            }}
          >
            {T("alloc_save")} ›
          </button>
        </div>
        <div style={{ marginBottom: 14, display: "flex" }}>
          <SegmentedControl
            options={[
              { value: "all", label: T("alloc_group_all") },
              {
                value: "investments",
                label: T("alloc_group_investments"),
              },
              { value: "accounts", label: T("alloc_group_accounts") },
            ]}
            value={allocGroup}
            onChange={setAllocGroup}
          />
        </div>

        {allocChartType === "pie" ? (
          <AllocationTargetPie regroupedAlloc={regroupedAlloc} T={T} />
        ) : (
          <AllocationTargetBars regroupedAlloc={regroupedAlloc} T={T} />
        )}
      </div>
    </>
  );
}

function AllocationTargetPie({ regroupedAlloc, T }) {
  const pieData = regroupedAlloc
    .filter((a) => a.target_pct !== null && a.current_pct > 0)
    .map((a) => ({
      total: a.current_pct,
      category__color: a.color,
      category__name: a.name,
      _target: a.target_pct,
      _action: a.action,
    }));

  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "0 0 auto" }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--fg-soft)",
            textAlign: "center",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: 0,
          }}
        >
          {T("alloc_current")}
        </div>
        <PieChart
          data={pieData}
          size={160}
          tLabel={T("alloc_current")}
          tPctOfTotal="%"
        />
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        {regroupedAlloc
          .filter((a) => a.target_pct !== null)
          .map((a) => (
            <AllocationTargetRow key={a.id} item={a} T={T} />
          ))}
      </div>
    </div>
  );
}

function AllocationTargetRow({ item, T }) {
  const actionTone =
    { buy: "accent", sell: "warning", ok: "neutral" }[item.action] || "neutral";

  return (
    <div className="between" style={{ marginBottom: 10, alignItems: "center" }}>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <CategoryDot color={item.color || "var(--accent)"} />
        <span style={{ fontSize: 13 }}>{item.name}</span>
      </div>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span className="num" style={{ fontSize: 12, color: "var(--fg-soft)" }}>
          {item.current_pct.toFixed(1)}% / {item.target_pct.toFixed(1)}%
        </span>
        {item.action && (
          <Pill tone={actionTone}>{T(`alloc_action_${item.action}`)}</Pill>
        )}
      </div>
    </div>
  );
}

function AllocationTargetBars({ regroupedAlloc, T }) {
  return regroupedAlloc
    .filter((a) => a.target_pct !== null)
    .map((a) => {
      const actionTone =
        { buy: "accent", sell: "warning", ok: "neutral" }[a.action] ||
        "neutral";
      return (
        <div key={a.id} style={{ marginBottom: 12 }}>
          <div className="between" style={{ marginBottom: 4 }}>
            <span
              className="row"
              style={{ fontSize: 13, alignItems: "center", gap: 8 }}
            >
              <CategoryDot color={a.color || "var(--accent)"} />
              {a.name}
            </span>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span
                className="num"
                style={{ fontSize: 11, color: "var(--fg-soft)" }}
              >
                {a.current_pct.toFixed(1)}% / {a.target_pct.toFixed(1)}%
              </span>
              {a.action && (
                <Pill tone={actionTone}>{T(`alloc_action_${a.action}`)}</Pill>
              )}
            </div>
          </div>
          <div
            style={{
              height: 4,
              background: "var(--card-inset)",
              borderRadius: 2,
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(a.current_pct, 100)}%`,
                background: a.color || "var(--accent)",
                borderRadius: 2,
                transition: "width 0.4s",
              }}
            />
            {a.target_pct > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: -2,
                  bottom: -2,
                  width: 2,
                  left: `${Math.min(a.target_pct, 100)}%`,
                  background: "var(--fg)",
                  borderRadius: 1,
                }}
              />
            )}
          </div>
        </div>
      );
    });
}
