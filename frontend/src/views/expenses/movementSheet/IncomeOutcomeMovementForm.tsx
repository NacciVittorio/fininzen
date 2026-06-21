import type { Dispatch, SetStateAction } from "react";
import CategorySelect from "../../../components/CategorySelect";
import FieldLabel from "../../../components/FieldLabel";
import { VerifiedToggleButton } from "../../../components/ui";
import { filterAmountInput } from "../../../utils/formatters";
import type { DecimalSeparator } from "../../../utils/formatters";
import type { Asset, Category } from "../../../api/types";
import type { Translator } from "../../../types";
import type { ExpenseForm } from "../../../context/formBuilders";
import {
    selectLikeCategoryChevronStyle,
    selectLikeCategoryShellStyle,
    selectLikeCategoryStyle,
} from "./selectStyles";

export default function IncomeOutcomeMovementForm({
    expForm,
    setExpForm,
    expError,
    setExpError,
    modalDir,
    assets,
    categories,
    handleExpenseCategoryChange,
    descSuggestions,
    showSuggestions,
    setShowSuggestions,
    setDescTouched,
    T,
    decimalSeparator,
}: {
    expForm: ExpenseForm;
    setExpForm: Dispatch<SetStateAction<ExpenseForm>>;
    expError?: string | null;
    setExpError: (value: string | null) => void;
    modalDir: string;
    assets: readonly Asset[];
    categories: readonly Category[];
    handleExpenseCategoryChange: (value: string) => void;
    descSuggestions: readonly string[];
    showSuggestions: boolean;
    setShowSuggestions: (value: boolean) => void;
    setDescTouched: (value: boolean) => void;
    T: Translator;
    decimalSeparator: DecimalSeparator;
}) {
    return (
        <>
            <div>
                <FieldLabel text={T("label_category")} />
                <CategorySelect
                    value={expForm.category}
                    onChange={handleExpenseCategoryChange}
                    categoryType={modalDir}
                    placeholder={T("no_category")}
                    categories={categories}
                />
            </div>
            <div style={{ position: "relative" }}>
                <FieldLabel text={T("label_description")} />
                <input
                    className="inp"
                    placeholder={T("placeholder_description")}
                    value={expForm.description}
                    onChange={(event) => {
                        setDescTouched(true);
                        setExpForm((previous) => ({
                            ...previous,
                            description: event.target.value,
                        }));
                    }}
                    onBlur={() =>
                        setTimeout(() => setShowSuggestions(false), 150)
                    }
                    onFocus={() =>
                        descSuggestions.length > 0 && setShowSuggestions(true)
                    }
                    autoComplete="off"
                />
                {showSuggestions && descSuggestions.length > 0 && (
                    <div
                        style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            zIndex: 100,
                            background: "#1a1f2e",
                            border: "1px solid var(--rule)",
                            borderRadius: 10,
                            marginTop: 4,
                            overflow: "hidden",
                        }}
                    >
                        {descSuggestions.map((text) => (
                            <button
                                key={text}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    setExpForm((previous) => ({
                                        ...previous,
                                        description: text,
                                    }));
                                    setShowSuggestions(false);
                                    setDescTouched(false);
                                }}
                                style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "9px 14px",
                                    background: "transparent",
                                    border: "none",
                                    borderBottom: "1px solid var(--card-inset)",
                                    color: "#e2e8f0",
                                    fontSize: 13,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                }}
                                onMouseEnter={(event) =>
                                    (event.currentTarget.style.background =
                                        "var(--card-inset)")
                                }
                                onMouseLeave={(event) =>
                                    (event.currentTarget.style.background =
                                        "transparent")
                                }
                            >
                                {text}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div>
                <FieldLabel text={T("label_amount")} />
                <div style={{ position: "relative" }}>
                    <input
                        className="inp"
                        type="text"
                        inputMode="decimal"
                        placeholder={decimalSeparator === "," ? "0,00" : "0.00"}
                        style={{ paddingRight: 52 }}
                        value={expForm.amount}
                        onChange={(event) => {
                            setExpError(null);
                            setExpForm((previous) => ({
                                ...previous,
                                amount: filterAmountInput(event.target.value),
                            }));
                        }}
                    />
                    <span
                        style={{
                            position: "absolute",
                            right: 14,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--fg-soft)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 13,
                            pointerEvents: "none",
                        }}
                    >
                        EUR
                    </span>
                </div>
            </div>
            <div>
                <FieldLabel text={T("label_date")} />
                <div style={{ overflow: "hidden", borderRadius: 10 }}>
                    <input
                        className="inp"
                        type="date"
                        value={expForm.date}
                        onChange={(event) =>
                            setExpForm((previous) => ({
                                ...previous,
                                date: event.target.value,
                            }))
                        }
                    />
                </div>
            </div>
            <div>
                <FieldLabel text={T("label_linked_asset")} />
                <div style={selectLikeCategoryShellStyle}>
                    <select
                        className="inp"
                        value={expForm.linked_asset}
                        onChange={(event) =>
                            setExpForm((previous) => ({
                                ...previous,
                                linked_asset: event.target.value,
                            }))
                        }
                        style={selectLikeCategoryStyle}
                    >
                        <option value="">{T("no_linked_asset")}</option>
                        {assets
                            .filter(
                                (asset) =>
                                    asset.tracking_type === "MANUAL" &&
                                    !asset.is_archived,
                            )
                            .map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                    {asset.investment_type_detail?.icon || ""}{" "}
                                    {asset.name}
                                </option>
                            ))}
                    </select>
                    <span
                        aria-hidden="true"
                        style={selectLikeCategoryChevronStyle}
                    >
                        ▼
                    </span>
                </div>
            </div>
            <div>
                <FieldLabel text={T("verified_filter_label")} />
                <VerifiedToggleButton
                    checked={expForm.is_verified}
                    onToggle={() =>
                        setExpForm((previous) => ({
                            ...previous,
                            is_verified: !previous.is_verified,
                        }))
                    }
                    T={T}
                />
            </div>
            {expError && (
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
                    {expError}
                </div>
            )}
        </>
    );
}
