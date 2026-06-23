import { useSettings } from "../../context/useSettings";
import { useFormatters } from "../../utils/useFormatters";
import type { Asset, Category, RecurringExpense } from "../../api/types";
import type { NumericValue, Translator } from "../../types";

type GenerateRecurringMsg = { created?: number; skipped?: number };

export function RecurringExpensesSection({
    setDeleteRecurringTarget,
}: {
    setDeleteRecurringTarget: (recurring: RecurringExpense) => void;
}) {
    const {
        T,
        categories,
        assets,
        recurringExpenses,
        showRecurringModal,
        recurringError,
        recurringSaving,
        generateRecurringMsg,
        openRecurringModal,
        toggleRecurringStatus,
        generateRecurringForMonth,
    } = useSettings();
    const { formatEur } = useFormatters();
    const recurringMsg = generateRecurringMsg as GenerateRecurringMsg | null;

    return (
        <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {T("recurring_title")}
            </div>
            <div
                style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    marginBottom: 16,
                }}
            >
                {T("recurring_desc")}
            </div>
            <div className="row" style={{ gap: 8, marginBottom: 16 }}>
                <button
                    className="btn btn-p btn-sm"
                    onClick={() => openRecurringModal()}
                >
                    + {T("add_recurring")}
                </button>
                <button
                    className="btn btn-g btn-sm"
                    disabled={recurringSaving}
                    onClick={() => generateRecurringForMonth()}
                >
                    {recurringSaving ? "..." : T("generate_recurring")}
                </button>
            </div>

            {recurringMsg && (
                <div
                    style={{
                        marginBottom: 14,
                        padding: "10px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        background: "var(--success-soft)",
                        border: "1px solid var(--success-soft)",
                        color: "var(--success)",
                    }}
                >
                    ✓ {recurringMsg.created} {T("generate_done")},{" "}
                    {recurringMsg.skipped} {T("generate_skipped")}
                </div>
            )}

            {recurringError && !showRecurringModal && (
                <div
                    style={{
                        marginBottom: 14,
                        padding: "10px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        background: "#ff6b6b11",
                        border: "1px solid #ff6b6b33",
                        color: "var(--danger)",
                    }}
                >
                    {recurringError}
                </div>
            )}

            {recurringExpenses.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                    {T("no_recurring")}
                </div>
            ) : (
                <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                    {recurringExpenses.map((recurringExpense) => (
                        <RecurringExpenseRow
                            key={recurringExpense.id}
                            T={T}
                            recurringExpense={recurringExpense}
                            category={categories.find(
                                (category) =>
                                    category.id === recurringExpense.category,
                            )}
                            linkedAccount={assets.find(
                                (asset) =>
                                    asset.id === recurringExpense.linked_asset,
                            )}
                            recurringSaving={recurringSaving}
                            openRecurringModal={openRecurringModal}
                            toggleRecurringStatus={toggleRecurringStatus}
                            setDeleteRecurringTarget={setDeleteRecurringTarget}
                            formatEur={formatEur}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function RecurringExpenseRow({
    T,
    recurringExpense,
    category,
    linkedAccount,
    recurringSaving,
    openRecurringModal,
    toggleRecurringStatus,
    setDeleteRecurringTarget,
    formatEur,
}: {
    T: Translator;
    recurringExpense: RecurringExpense;
    category: Category | undefined;
    linkedAccount: Asset | undefined;
    recurringSaving: boolean;
    openRecurringModal: (recurring?: RecurringExpense | null) => void;
    toggleRecurringStatus: (recurring: RecurringExpense) => unknown;
    setDeleteRecurringTarget: (recurring: RecurringExpense) => void;
    formatEur: (value: NumericValue) => string;
}) {
    return (
        <div className="card" style={{ padding: "12px 16px" }}>
            <div className="between">
                <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {category?.icon} {recurringExpense.description}
                    </div>
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--fg-soft)",
                            marginTop: 3,
                        }}
                    >
                        {category?.name} · {T("recurring_day")}{" "}
                        {recurringExpense.day_of_month}
                        {recurringExpense.start_date &&
                            ` · ${recurringExpense.start_date}`}
                        {recurringExpense.end_date &&
                            ` -> ${recurringExpense.end_date}`}
                        {linkedAccount && ` · ${linkedAccount.name}`}
                        {recurringExpense.status !== "ACTIVE" && (
                            <span
                                style={{
                                    color: "var(--danger)",
                                    marginLeft: 6,
                                }}
                            >
                                ● {recurringExpense.status}
                            </span>
                        )}
                    </div>
                </div>
                <div className="row" style={{ alignItems: "center", gap: 8 }}>
                    <span
                        style={{
                            fontSize: 15,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                            color: "var(--danger)",
                        }}
                    >
                        -{formatEur(recurringExpense.amount)}
                    </span>
                    <button
                        className="btn btn-g btn-sm"
                        onClick={() => openRecurringModal(recurringExpense)}
                    >
                        {T("btn_edit")}
                    </button>
                    <button
                        className="btn btn-g btn-sm"
                        disabled={recurringSaving}
                        onClick={() => toggleRecurringStatus(recurringExpense)}
                    >
                        {recurringExpense.status === "ACTIVE"
                            ? T("btn_disable")
                            : T("btn_enable")}
                    </button>
                    <button
                        className="btn btn-r btn-sm"
                        style={{ padding: "4px 8px" }}
                        onClick={() =>
                            setDeleteRecurringTarget(recurringExpense)
                        }
                    >
                        {T("btn_delete")}
                    </button>
                </div>
            </div>
        </div>
    );
}
