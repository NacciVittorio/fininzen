import FieldLabel from "../../../components/FieldLabel";
import { VerifiedToggleButton } from "../../../components/ui";
import type { Translator } from "../../../types";
import type { AddTransactionForm } from "../portfolioViewModel";
import type { SetAddTxForm } from "./addTransactionTypes";

export default function TransactionNotesVerification({
    addTxForm,
    setAddTxForm,
    T,
}: {
    addTxForm: AddTransactionForm;
    setAddTxForm: SetAddTxForm;
    T: Translator;
}) {
    return (
        <>
            <div>
                <FieldLabel text={T("tx_notes")} />
                <input
                    className="inp"
                    placeholder={T("tx_notes")}
                    value={addTxForm.notes}
                    onChange={(event) =>
                        setAddTxForm((previous) => ({
                            ...previous,
                            notes: event.target.value,
                        }))
                    }
                />
            </div>
            <div>
                <FieldLabel text={T("verified_filter_label")} />
                <VerifiedToggleButton
                    checked={addTxForm.is_verified}
                    onToggle={() =>
                        setAddTxForm((previous) => ({
                            ...previous,
                            is_verified: !previous.is_verified,
                        }))
                    }
                    T={T}
                />
            </div>
        </>
    );
}
