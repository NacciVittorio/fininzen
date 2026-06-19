import { ToggleSwitch } from "../../components/ui";
import { useDragReorder } from "../../components/ui/useDragReorder";
import { useAuth } from "../../context/useAuth";
import { useSettings } from "../../context/useSettings";

export function DashboardSettingsSection() {
  const { T, isFeatureEnabled } = useAuth();
  const {
    dashConfig,
    toggleDashCard,
    moveDashCard,
    reorderDashCards,
    resetDashConfig,
  } = useSettings();
  const dashLabels = {
    wealth_trend: T("dash_wealth_trend"),
    kpi_cards: T("dash_kpi_cards"),
    monthly_overview: T("dash_monthly_overview"),
    budget_progress: T("dash_budget_progress"),
    expenses_pie: T("cash_flow_category"),
    expenses_trend: T("dash_expenses_trend"),
    portfolio_alloc: T("dash_portfolio_alloc"),
    currency_exposure: T("dash_currency_exposure"),
    recurring_overview: T("dash_recurring_overview"),
  };

  const isDashConfigFeatureEnabled = (id) => {
    const anyWealthFeature =
      isFeatureEnabled("accounts") || isFeatureEnabled("investments");
    const requirements = {
      wealth_trend: anyWealthFeature,
      monthly_overview: anyWealthFeature || isFeatureEnabled("cashflow"),
      expenses_pie: isFeatureEnabled("cashflow"),
      expenses_trend: isFeatureEnabled("cashflow"),
      budget_progress: isFeatureEnabled("cashflow"),
      recurring_overview: isFeatureEnabled("cashflow"),
      portfolio_alloc: isFeatureEnabled("investments"),
      currency_exposure: anyWealthFeature,
    };
    return requirements[id] ?? true;
  };

  const visibleDashCards = dashConfig.filter((card) =>
    isDashConfigFeatureEnabled(card.id),
  );
  const dashReorder = useDragReorder({
    count: visibleDashCards.length,
    rowHeight: 56,
    onCommit: (from, to) => {
      const ids = visibleDashCards.map((card) => card.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      reorderDashCards(ids);
    },
  });

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        {T("dash_settings")}
      </div>
      <div style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 12 }}>
        {T("dash_show_hide")}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 10,
        }}
      >
        <button
          className="btn btn-g btn-sm pressable"
          onClick={resetDashConfig}
        >
          ↺ {T("dash_reset")}
        </button>
      </div>
      <div className="grouped-list">
        {visibleDashCards.map((card, index) => (
          <DashboardCardSettingRow
            key={card.id}
            T={T}
            card={card}
            index={index}
            visibleDashCards={visibleDashCards}
            dashLabels={dashLabels}
            dashReorder={dashReorder}
            moveDashCard={moveDashCard}
            toggleDashCard={toggleDashCard}
          />
        ))}
      </div>
    </div>
  );
}

function DashboardCardSettingRow({
  T,
  card,
  index,
  visibleDashCards,
  dashLabels,
  dashReorder,
  moveDashCard,
  toggleDashCard,
}) {
  const handleProps = dashReorder.getHandleProps(index);

  return (
    <div
      className="grouped-list__item"
      style={{
        height: 56,
        boxSizing: "border-box",
        background: "var(--card)",
        ...dashReorder.getRowStyle(index),
      }}
    >
      <span
        {...handleProps}
        role="button"
        aria-label={T("dash_reorder_handle", "Reorder")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 44,
          color: "var(--fg-faint)",
          fontSize: 18,
          userSelect: "none",
          flexShrink: 0,
          ...handleProps.style,
        }}
      >
        ≡
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: 500,
          color: card.visible ? "var(--fg)" : "var(--fg-faint)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {dashLabels[card.id]}
      </span>
      <div className="row" style={{ gap: 4, alignItems: "center" }}>
        <DashboardMoveButton
          label="Move up"
          disabled={index === 0}
          onClick={() => index > 0 && moveDashCard(card.id, -1)}
        >
          ↑
        </DashboardMoveButton>
        <DashboardMoveButton
          label="Move down"
          disabled={index === visibleDashCards.length - 1}
          onClick={() =>
            index < visibleDashCards.length - 1 && moveDashCard(card.id, 1)
          }
        >
          ↓
        </DashboardMoveButton>
        <ToggleSwitch
          id={`dash-visible-${card.id}`}
          checked={card.visible}
          onChange={() => toggleDashCard(card.id)}
        />
      </div>
    </div>
  );
}

function DashboardMoveButton({ label, disabled, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: "var(--card-inset)",
        border: "1px solid var(--rule)",
        color: disabled ? "var(--fg-faint)" : "var(--fg-soft)",
        borderRadius: 8,
        width: 28,
        height: 28,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
