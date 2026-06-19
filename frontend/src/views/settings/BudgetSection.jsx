import { deleteBudget, saveBudget } from "../../api/planning";
import { useSettings } from "../../context/useSettings";
import { useFormatters } from "../../utils/useFormatters";

export function BudgetSection() {
  const {
    T,
    categories,
    budgets,
    editingBudgetCat,
    setEditingBudgetCat,
    budgetInputVal,
    setBudgetInputVal,
    apiFetch,
    fetchBudgets,
  } = useSettings();
  const { formatEur } = useFormatters();
  const expenseCategories = categories.filter(
    (category) => !category.parent && category.category_type === "expense",
  );

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
        {T("budget_title")}
      </div>
      <div style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 20 }}>
        {T("budget_desc")}
      </div>
      {expenseCategories.length === 0 ? (
        <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
          {T("budget_no_cats")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {expenseCategories.map((category) => (
            <BudgetCategoryRow
              key={category.id}
              T={T}
              category={category}
              budget={budgets.find((item) => item.category === category.id)}
              isEditing={editingBudgetCat === category.id}
              budgetInputVal={budgetInputVal}
              setBudgetInputVal={setBudgetInputVal}
              setEditingBudgetCat={setEditingBudgetCat}
              apiFetch={apiFetch}
              fetchBudgets={fetchBudgets}
              formatEur={formatEur}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetCategoryRow({
  T,
  category,
  budget,
  isEditing,
  budgetInputVal,
  setBudgetInputVal,
  setEditingBudgetCat,
  apiFetch,
  fetchBudgets,
  formatEur,
}) {
  const saveCurrentBudget = async () => {
    const val = parseFloat(budgetInputVal);
    if (!isNaN(val) && val > 0) {
      await saveBudget(apiFetch, { category: category.id, amount: val });
      fetchBudgets();
    }
    setEditingBudgetCat(null);
  };

  return (
    <div className="card" style={{ padding: "12px 16px" }}>
      <div className="between">
        <span style={{ fontSize: 14 }}>
          {category.icon} {category.name}
        </span>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {!isEditing && (
            <span
              style={{
                fontSize: 13,
                color: budget ? "var(--fg)" : "var(--fg-soft)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {budget ? `${formatEur(budget.amount)}/mo` : "-"}
            </span>
          )}
          {isEditing ? (
            <>
              <input
                className="inp"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                style={{ width: 110, textAlign: "right" }}
                value={budgetInputVal}
                onChange={(event) => setBudgetInputVal(event.target.value)}
                autoFocus
              />
              <button className="btn btn-p btn-sm" onClick={saveCurrentBudget}>
                {T("budget_set")}
              </button>
              <button
                className="btn btn-g btn-sm"
                onClick={() => setEditingBudgetCat(null)}
              >
                {T("btn_cancel")}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-g btn-sm"
                onClick={() => {
                  setEditingBudgetCat(category.id);
                  setBudgetInputVal(budget ? String(budget.amount) : "");
                }}
              >
                {T("btn_edit")}
              </button>
              {budget && (
                <button
                  className="btn btn-g btn-sm"
                  style={{ color: "var(--danger)", padding: "4px 8px" }}
                  onClick={async () => {
                    await deleteBudget(apiFetch, budget.id);
                    fetchBudgets();
                  }}
                >
                  x
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
