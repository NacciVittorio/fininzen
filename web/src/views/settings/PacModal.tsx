"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import FieldLabel from "../../components/FieldLabel";
import Modal from "../../components/Modal";
import { filterAmountInput } from "../../utils/formatters";
import { DateRangeFields, ModalError } from "./RecurringExpenseModal";
import type { Asset } from "../../api/types";
import type { PacForm } from "../../context/formBuilders";
import type { EntityId } from "../../context/feedTypes";
import type { Translator } from "../../types";

export function PacModal({
    T,
    MONTHS,
    investments,
    bankAccounts,
    decimalSeparator,
    editingPacId,
    pacForm,
    setPacForm,
    pacError,
    pacSaving,
    closePacModal,
    submitPac,
}: {
    T: Translator;
    MONTHS: readonly string[];
    investments: readonly Asset[];
    bankAccounts: readonly Asset[];
    decimalSeparator: string | null;
    editingPacId: EntityId | null;
    pacForm: PacForm;
    setPacForm: Dispatch<SetStateAction<PacForm>>;
    pacError: string | null;
    pacSaving: boolean;
    closePacModal: () => void;
    submitPac: () => void;
}) {
    return (
        <Modal
            title={editingPacId ? T("modal_edit_pac") : T("modal_add_pac")}
            onClose={closePacModal}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                    <FieldLabel text={T("label_name")} />
                    <input
                        className="inp"
                        value={pacForm.name}
                        onChange={(event) =>
                            setPacForm((state) => ({
                                ...state,
                                name: event.target.value,
                            }))
                        }
                    />
                </div>
                <div>
                    <FieldLabel text={T("label_asset")} />
                    <select
                        className="inp"
                        value={pacForm.asset}
                        onChange={(event) =>
                            setPacForm((state) => ({
                                ...state,
                                asset: event.target.value,
                            }))
                        }
                    >
                        <option value="">{T("select_asset")}</option>
                        {investments
                            .filter(
                                (asset) =>
                                    asset.tracking_type === "AUTO" &&
                                    !asset.is_archived,
                            )
                            .map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                    {asset.investment_type_detail?.icon || ""}{" "}
                                    {asset.name}
                                </option>
                            ))}
                    </select>
                </div>
                <div>
                    <FieldLabel text={T("pac_source_account")} />
                    <select
                        className="inp"
                        value={pacForm.source_account}
                        onChange={(event) =>
                            setPacForm((state) => ({
                                ...state,
                                source_account: event.target.value,
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
                <div>
                    <FieldLabel text={T("label_amount")} />
                    <input
                        className="inp"
                        type="text"
                        inputMode="decimal"
                        placeholder={decimalSeparator === "," ? "0,00" : "0.00"}
                        value={pacForm.amount}
                        onChange={(event) =>
                            setPacForm((state) => ({
                                ...state,
                                amount: filterAmountInput(event.target.value),
                            }))
                        }
                    />
                </div>
                <PacFrequencyFields
                    T={T}
                    MONTHS={MONTHS}
                    pacForm={pacForm}
                    setPacForm={setPacForm}
                />
                <DateRangeFields
                    T={T}
                    form={pacForm}
                    setForm={setPacForm}
                    startField="start_date"
                    endField="end_date"
                />
                <PacCheckbox
                    checked={pacForm.generated_transactions_verified}
                    onChange={(checked) =>
                        setPacForm((state) => ({
                            ...state,
                            generated_transactions_verified: checked,
                        }))
                    }
                >
                    {T("pac_generated_verified")}
                </PacCheckbox>
                <PacCheckbox
                    checked={pacForm.is_active}
                    onChange={(checked) =>
                        setPacForm((state) => ({
                            ...state,
                            is_active: checked,
                        }))
                    }
                >
                    {T("recurring_active")}
                </PacCheckbox>
                {pacError && <ModalError>{pacError}</ModalError>}
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                    }}
                >
                    <button className="btn btn-g" onClick={closePacModal}>
                        {T("btn_cancel")}
                    </button>
                    <button
                        className="btn btn-p"
                        disabled={pacSaving}
                        onClick={submitPac}
                    >
                        {pacSaving
                            ? "..."
                            : editingPacId
                              ? T("btn_update")
                              : T("btn_add")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function PacFrequencyFields({
    T,
    MONTHS,
    pacForm,
    setPacForm,
}: {
    T: Translator;
    MONTHS: readonly string[];
    pacForm: PacForm;
    setPacForm: Dispatch<SetStateAction<PacForm>>;
}) {
    return (
        <>
            <div>
                <FieldLabel text={T("recurring_frequency")} />
                <select
                    className="inp"
                    value={pacForm.frequency}
                    onChange={(event) =>
                        setPacForm((state) => ({
                            ...state,
                            frequency: event.target.value,
                            anchor_month: [
                                "QUARTERLY",
                                "SEMIANNUAL",
                                "ANNUAL",
                            ].includes(event.target.value)
                                ? state.anchor_month ||
                                  String(new Date().getMonth() + 1)
                                : "",
                        }))
                    }
                >
                    <option value="WEEKLY">{T("frequency_WEEKLY")}</option>
                    <option value="MONTHLY">{T("frequency_MONTHLY")}</option>
                    <option value="QUARTERLY">
                        {T("frequency_QUARTERLY")}
                    </option>
                    <option value="SEMIANNUAL">
                        {T("frequency_SEMIANNUAL")}
                    </option>
                    <option value="ANNUAL">{T("frequency_ANNUAL")}</option>
                </select>
            </div>
            {pacForm.frequency === "WEEKLY" ? (
                <div>
                    <FieldLabel text={T("pac_day_of_week")} />
                    <select
                        className="inp"
                        value={pacForm.day_of_week}
                        onChange={(event) =>
                            setPacForm((state) => ({
                                ...state,
                                day_of_week: event.target.value,
                            }))
                        }
                    >
                        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                            <option key={day} value={day}>
                                {T(`weekday_${day}`)}
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <div>
                    <FieldLabel text={T("recurring_day")} />
                    <input
                        className="inp"
                        type="number"
                        min="1"
                        max="31"
                        value={pacForm.day_of_month}
                        onChange={(event) =>
                            setPacForm((state) => ({
                                ...state,
                                day_of_month: event.target.value,
                            }))
                        }
                    />
                </div>
            )}
            {["QUARTERLY", "SEMIANNUAL", "ANNUAL"].includes(
                pacForm.frequency,
            ) && (
                <div>
                    <FieldLabel text={T("pac_anchor_month")} />
                    <select
                        className="inp"
                        value={pacForm.anchor_month}
                        onChange={(event) =>
                            setPacForm((state) => ({
                                ...state,
                                anchor_month: event.target.value,
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
        </>
    );
}

function PacCheckbox({
    checked,
    onChange,
    children,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: ReactNode;
}) {
    return (
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
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
            />
            {children}
        </label>
    );
}
