import type { Dispatch, ReactNode, SetStateAction } from "react";
import CategorySelect from "../../components/CategorySelect";
import FieldLabel from "../../components/FieldLabel";
import Modal from "../../components/Modal";
import { filterAmountInput } from "../../utils/formatters";
import type { Asset, Category } from "../../api/types";
import type { RecurringForm } from "../../context/formBuilders";
import type { EntityId } from "../../context/feedTypes";
import type { Translator } from "../../types";

export function RecurringExpenseModal({
    T,
    MONTHS,
    categories,
    bankAccounts,
    decimalSeparator,
    editingRecurringId,
    recurringForm,
    setRecurringForm,
    recurringError,
    recurringSaving,
    closeRecurringModal,
    submitRecurring,
}: {
    T: Translator;
    MONTHS: readonly string[];
    categories: readonly Category[];
    bankAccounts: readonly Asset[];
    decimalSeparator: string | null;
    editingRecurringId: EntityId | null;
    recurringForm: RecurringForm;
    setRecurringForm: Dispatch<SetStateAction<RecurringForm>>;
    recurringError: string | null;
    recurringSaving: boolean;
    closeRecurringModal: () => void;
    submitRecurring: () => void;
}) {
    return (
        <Modal
            title={
                editingRecurringId
                    ? T("modal_edit_recurring")
                    : T("modal_add_recurring")
            }
            onClose={closeRecurringModal}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                    <FieldLabel text={T("label_description")} />
                    <input
                        className="inp"
                        placeholder={T("placeholder_description")}
                        value={recurringForm.description}
                        onChange={(event) =>
                            setRecurringForm((state) => ({
                                ...state,
                                description: event.target.value,
                            }))
                        }
                    />
                </div>
                <div>
                    <FieldLabel text={T("label_amount")} />
                    <input
                        className="inp"
                        type="text"
                        inputMode="decimal"
                        placeholder={decimalSeparator === "," ? "0,00" : "0.00"}
                        value={recurringForm.amount}
                        onChange={(event) =>
                            setRecurringForm((state) => ({
                                ...state,
                                amount: filterAmountInput(event.target.value),
                            }))
                        }
                    />
                </div>
                <div>
                    <FieldLabel text={T("label_category")} />
                    <CategorySelect
                        value={recurringForm.category}
                        onChange={(value) =>
                            setRecurringForm((state) => ({
                                ...state,
                                category: value,
                            }))
                        }
                        categoryType="expense"
                        categories={categories}
                        placeholder={T("no_category")}
                    />
                </div>
                <div>
                    <FieldLabel text={T("label_linked_asset")} />
                    <select
                        className="inp"
                        value={recurringForm.linked_asset}
                        onChange={(event) =>
                            setRecurringForm((state) => ({
                                ...state,
                                linked_asset: event.target.value,
                            }))
                        }
                    >
                        <option value="">{T("no_linked_asset")}</option>
                        {bankAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                                {account.investment_type_detail?.icon || ""}{" "}
                                {account.name}
                            </option>
                        ))}
                    </select>
                </div>
                <RecurringFrequencyFields
                    T={T}
                    MONTHS={MONTHS}
                    recurringForm={recurringForm}
                    setRecurringForm={setRecurringForm}
                />
                <DateRangeFields
                    T={T}
                    form={recurringForm}
                    setForm={setRecurringForm}
                    startField="start_date"
                    endField="end_date"
                />
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        fontSize: 13,
                    }}
                >
                    <input
                        type="checkbox"
                        checked={recurringForm.is_active}
                        onChange={(event) =>
                            setRecurringForm((state) => ({
                                ...state,
                                is_active: event.target.checked,
                            }))
                        }
                    />
                    {T("recurring_active")}
                </label>
                {recurringError && <ModalError>{recurringError}</ModalError>}
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                    }}
                >
                    <button className="btn btn-g" onClick={closeRecurringModal}>
                        {T("btn_cancel")}
                    </button>
                    <button
                        className="btn btn-p"
                        disabled={recurringSaving}
                        onClick={submitRecurring}
                    >
                        {recurringSaving
                            ? "..."
                            : editingRecurringId
                              ? T("btn_update")
                              : T("btn_add")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function RecurringFrequencyFields({
    T,
    MONTHS,
    recurringForm,
    setRecurringForm,
}: {
    T: Translator;
    MONTHS: readonly string[];
    recurringForm: RecurringForm;
    setRecurringForm: Dispatch<SetStateAction<RecurringForm>>;
}) {
    return (
        <>
            <div>
                <FieldLabel text={T("recurring_frequency")} />
                <select
                    className="inp"
                    value={recurringForm.frequency}
                    onChange={(event) =>
                        setRecurringForm((state) => ({
                            ...state,
                            frequency: event.target.value,
                            month_of_year:
                                event.target.value === "YEARLY"
                                    ? state.month_of_year ||
                                      String(new Date().getMonth() + 1)
                                    : "",
                        }))
                    }
                >
                    <option value="MONTHLY">{T("frequency_MONTHLY")}</option>
                    <option value="YEARLY">{T("frequency_YEARLY")}</option>
                </select>
            </div>
            {recurringForm.frequency === "YEARLY" && (
                <div>
                    <FieldLabel text={T("recurring_month")} />
                    <select
                        className="inp"
                        value={recurringForm.month_of_year}
                        onChange={(event) =>
                            setRecurringForm((state) => ({
                                ...state,
                                month_of_year: event.target.value,
                            }))
                        }
                    >
                        {MONTHS.map((monthName, index) => (
                            <option key={monthName} value={index + 1}>
                                {monthName}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            <div>
                <FieldLabel text={T("recurring_day")} />
                <input
                    className="inp"
                    type="number"
                    min="1"
                    max="31"
                    value={recurringForm.day_of_month}
                    onChange={(event) =>
                        setRecurringForm((state) => ({
                            ...state,
                            day_of_month: event.target.value,
                        }))
                    }
                />
            </div>
        </>
    );
}

export function DateRangeFields<F>({
    T,
    form,
    setForm,
    startField,
    endField,
}: {
    T: Translator;
    form: F;
    setForm: Dispatch<SetStateAction<F>>;
    startField: keyof F & string;
    endField: keyof F & string;
}) {
    const fieldValue = (field: keyof F & string) =>
        String((form as Record<string, unknown>)[field] ?? "");
    const setField = (field: keyof F & string, value: string) =>
        setForm((state) => ({ ...state, [field]: value }) as F);

    return (
        <>
            <div>
                <FieldLabel text={T("recurring_start_date")} />
                <input
                    className="inp"
                    type="date"
                    required
                    value={fieldValue(startField)}
                    onChange={(event) =>
                        setField(startField, event.target.value)
                    }
                />
            </div>
            <div>
                <FieldLabel text={T("recurring_end_date")} />
                <input
                    className="inp"
                    type="date"
                    value={fieldValue(endField)}
                    onChange={(event) => setField(endField, event.target.value)}
                />
            </div>
        </>
    );
}

export function ModalError({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                fontSize: 12,
                color: "var(--danger)",
                background: "#ff6b6b11",
                border: "1px solid #ff6b6b33",
                borderRadius: 8,
                padding: "8px 10px",
            }}
        >
            {children}
        </div>
    );
}
