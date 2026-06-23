import type { Dispatch, SetStateAction } from "react";
import FieldLabel from "../../components/FieldLabel";
import { BottomSheet, SheetTitle } from "../../components/ui";
import { parseFlexibleDecimal } from "../../utils/formatters";
import type { NumericValue, Translator } from "../../types";

export type RealizeModalAsset = {
    effective_tax_rate?: NumericValue;
    invested_capital?: NumericValue;
    investment_type_detail?: { tax_rate?: NumericValue } | null;
};

export type RealizeForm = {
    sale_price: string;
    dest_account_id: string;
    fee: string;
};

type RealizeAccount = { id: number | string; name?: string | null };

export default function RealizeAssetSheet({
    realizeModal,
    setRealizeModal,
    realizeForm,
    setRealizeForm,
    realizeError,
    realizeLoading,
    submitRealizeAsset,
    bankAccounts,
    T,
    formatEur,
}: {
    realizeModal: RealizeModalAsset | null;
    setRealizeModal: (modal: RealizeModalAsset | null) => void;
    realizeForm: RealizeForm;
    setRealizeForm: Dispatch<SetStateAction<RealizeForm>>;
    realizeError?: string | null;
    realizeLoading: boolean;
    submitRealizeAsset: () => void;
    bankAccounts: readonly RealizeAccount[];
    T: Translator;
    formatEur: (value: NumericValue) => string;
}) {
    const salePrice = parseFlexibleDecimal(realizeForm.sale_price);
    const fee = realizeForm.fee ? parseFlexibleDecimal(realizeForm.fee) : 0;
    const rate = Number.parseFloat(
        String(
            realizeModal?.effective_tax_rate ??
                realizeModal?.investment_type_detail?.tax_rate ??
                0,
        ),
    );
    const taxPreview =
        Number.isFinite(salePrice) && Number.isFinite(fee)
            ? Math.max(
                  salePrice -
                      Number.parseFloat(
                          String(realizeModal?.invested_capital || 0),
                      ) -
                      fee,
                  0,
              ) * rate
            : 0;

    return (
        <BottomSheet
            open={!!realizeModal}
            onClose={() => setRealizeModal(null)}
            ariaLabel={T("modal_realize_asset")}
        >
            {realizeModal && (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                        padding: "8px 18px 18px",
                    }}
                >
                    <SheetTitle>{T("modal_realize_asset")}</SheetTitle>
                    <div>
                        <FieldLabel text={T("label_sale_price")} />
                        <input
                            type="text"
                            inputMode="decimal"
                            className="inp"
                            value={realizeForm.sale_price}
                            onChange={(event) =>
                                setRealizeForm((previous) => ({
                                    ...previous,
                                    sale_price: event.target.value,
                                }))
                            }
                        />
                    </div>
                    <div>
                        <FieldLabel text={T("tx_dest_account")} />
                        <select
                            className="inp"
                            value={realizeForm.dest_account_id}
                            onChange={(event) =>
                                setRealizeForm((previous) => ({
                                    ...previous,
                                    dest_account_id: event.target.value,
                                }))
                            }
                        >
                            <option value="">{T("no_linked_account")}</option>
                            {bankAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {account.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <FieldLabel text={T("tx_fee")} />
                        <input
                            type="text"
                            inputMode="decimal"
                            className="inp"
                            placeholder="0.00"
                            value={realizeForm.fee}
                            onChange={(event) =>
                                setRealizeForm((previous) => ({
                                    ...previous,
                                    fee: event.target.value,
                                }))
                            }
                        />
                    </div>
                    <div
                        style={{
                            background: "var(--card-inset)",
                            border: "1px solid var(--rule)",
                            borderRadius: 8,
                            padding: "10px 12px",
                            fontSize: 13,
                            color: "var(--fg-soft)",
                        }}
                    >
                        {T("tx_estimated_tax")}: {formatEur(taxPreview)}
                    </div>
                    {realizeError && (
                        <div style={{ color: "var(--danger)", fontSize: 13 }}>
                            {realizeError}
                        </div>
                    )}
                    <div
                        className="row"
                        style={{ justifyContent: "flex-end", gap: 8 }}
                    >
                        <button
                            className="btn btn-g"
                            onClick={() => setRealizeModal(null)}
                        >
                            {T("btn_cancel")}
                        </button>
                        <button
                            className="btn btn-p"
                            disabled={realizeLoading}
                            onClick={submitRealizeAsset}
                        >
                            {realizeLoading ? "..." : T("btn_realize_asset")}
                        </button>
                    </div>
                </div>
            )}
        </BottomSheet>
    );
}
