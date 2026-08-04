"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { BottomSheet, Card } from "../../components/ui";
import Select from "../../components/Select";
import FieldLabel from "../../components/FieldLabel";
import AmountCalculator from "../../components/AmountCalculator";
import { parseMoneyToString } from "../../utils/formatters";
import { resolveMySplitUserId, splitIdentityLabel } from "./splitIdentity";
import type {
    SplitBalanceEntry,
    SplitGroup,
    SplitSettlementPayload,
} from "../../api/split";

const todayIso = (): string => new Date().toISOString().slice(0, 10);

// "Salda debito" (piano sez. 1.6/7.5): amount pre-filled from the current
// balance, direction (who pays whom) derived from its sign — positive
// `entry.balance` means the other identity owes *me*, so I'm the payee.
// SplitSettlementSerializer.validate() (splitting/serializers.py) requires
// `request.user.id` to equal either payer_user or payee_user, so this can
// only ever submit once `mySplitUserId` resolves (see splitIdentity.ts).
export default function SplitSettleUpModal({
    open,
    entry,
    group,
    onClose,
    onSettled,
}: {
    open: boolean;
    entry: SplitBalanceEntry | null;
    group?: SplitGroup | null;
    onClose: () => void;
    onSettled?: () => void;
}) {
    const { T, user, bankAccounts, decimalSeparator, guardDemo } = useApp();
    const {
        groups,
        partnerLinksSent,
        partnerLinksReceived,
        addSplitSettlement,
        settlementsError,
        setSettlementsError,
    } = useSplit();

    const [amountText, setAmountText] = useState("");
    const [date, setDate] = useState(todayIso());
    const [notes, setNotes] = useState("");
    const [linkedAsset, setLinkedAsset] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mySplitUserId = resolveMySplitUserId({
        myEmail: user,
        groups,
        groupMembers: group?.members,
        partnerLinksSent,
        partnerLinksReceived,
    });

    useEffect(() => {
        if (!open || !entry) return;
        const amount = Math.abs(Number(entry.balance));
        setAmountText(
            amount
                .toFixed(2)
                .replace(".", decimalSeparator === "," ? "," : "."),
        );
        setDate(todayIso());
        setNotes("");
        setLinkedAsset(null);
        setSettlementsError(null);
        // piano Batch 4.3: this used to only surface at submit time, after
        // the user had already filled out the whole form — check upfront on
        // open instead, so a brand-new account with no groups/partner links
        // yet sees the explanation immediately.
        setError(
            mySplitUserId == null ? T("split_settle_missing_identity") : null,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, entry?.user_id, entry?.contact_id, entry?.balance]);

    if (!open || !entry) return null;

    const owedToMe = Number(entry.balance) > 0;
    const otherLabel = splitIdentityLabel(entry, { myEmail: user, T });
    // Read reactively at render time, not synchronously right after the
    // await below — addSplitSettlement's setSettlementsError(...) is an
    // async state update that isn't visible in this same function's closure
    // until the next render (piano Batch 3.3: the first failed submit in a
    // session always fell through to the generic error_network fallback
    // instead of the real server message). SplitExpenseFormModal.tsx's
    // displayError already does this correctly — same pattern here.
    const displayError = error ?? settlementsError;

    const handleSubmit = async () => {
        if (guardDemo()) return;
        if (mySplitUserId == null) {
            setError(T("split_settle_missing_identity"));
            return;
        }
        const amount = parseMoneyToString(amountText, decimalSeparator);
        if (!amount) {
            setError(T("error_invalid_amount"));
            return;
        }
        setSubmitting(true);
        setError(null);
        const payload: SplitSettlementPayload = {
            group: group?.id ?? null,
            payer_user: owedToMe ? entry.user_id : mySplitUserId,
            payer_contact: owedToMe
                ? entry.user_id == null
                    ? entry.contact_id
                    : null
                : null,
            payee_user: owedToMe ? mySplitUserId : entry.user_id,
            payee_contact: owedToMe
                ? null
                : entry.user_id == null
                  ? entry.contact_id
                  : null,
            amount,
            date,
            notes,
            linked_asset: linkedAsset,
        };
        const result = await addSplitSettlement(payload);
        setSubmitting(false);
        if (result) {
            onSettled?.();
            onClose();
        }
    };

    return (
        <BottomSheet open onClose={onClose} ariaLabel={T("split_settle_up")}>
            <div style={{ padding: "0 18px" }}>
                <div
                    style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: "var(--fg)",
                        padding: "2px 2px 14px",
                    }}
                >
                    {T("split_settle_up")}
                </div>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <div style={{ fontSize: 14, color: "var(--fg-soft)" }}>
                        {owedToMe
                            ? T("split_settle_you_receive")
                            : T("split_settle_you_pay")}{" "}
                        <strong style={{ color: "var(--fg)" }}>
                            {otherLabel}
                        </strong>
                    </div>
                    <div>
                        <FieldLabel
                            text={T("label_amount")}
                            htmlFor="split-settle-amount"
                        />
                        <AmountCalculator
                            id="split-settle-amount"
                            data-testid="split-settle-amount"
                            value={amountText}
                            onChange={setAmountText}
                            decimalSeparator={decimalSeparator}
                            placeholder={
                                decimalSeparator === "," ? "0,00" : "0.00"
                            }
                            suffix="EUR"
                            T={T}
                        />
                    </div>
                    <div>
                        <FieldLabel
                            text={T("label_date")}
                            htmlFor="split-settle-date"
                        />
                        <input
                            id="split-settle-date"
                            className="inp"
                            type="date"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                        />
                    </div>
                    <div>
                        <FieldLabel
                            text={T("label_linked_asset")}
                            htmlFor="split-settle-account"
                        />
                        <Select
                            id="split-settle-account"
                            usePortal
                            data-testid="split-settle-account"
                            value={
                                linkedAsset != null ? String(linkedAsset) : ""
                            }
                            onChange={(value) =>
                                setLinkedAsset(value ? Number(value) : null)
                            }
                            placeholder={T("no_linked_asset")}
                            options={bankAccounts.map((account) => ({
                                value: String(account.id),
                                label: `${account.investment_type_detail?.icon || ""} ${account.name}`.trim(),
                            }))}
                        />
                    </div>
                    <div>
                        <FieldLabel
                            text={T("label_notes")}
                            htmlFor="split-settle-notes"
                        />
                        <textarea
                            id="split-settle-notes"
                            className="inp"
                            rows={2}
                            data-testid="split-settle-notes"
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                        />
                    </div>
                    {displayError && (
                        <Card
                            tone="danger"
                            data-testid="split-settle-error"
                            style={{
                                padding: "8px 10px",
                                fontSize: 12,
                                color: "var(--danger)",
                            }}
                        >
                            {displayError}
                        </Card>
                    )}
                    <div
                        className="row"
                        style={{
                            justifyContent: "flex-end",
                            gap: 8,
                            marginTop: 8,
                        }}
                    >
                        <button className="btn btn-g" onClick={onClose}>
                            {T("btn_cancel")}
                        </button>
                        <button
                            className="btn btn-p"
                            data-testid="split-settle-submit"
                            disabled={submitting || mySplitUserId == null}
                            onClick={handleSubmit}
                        >
                            {submitting ? "…" : T("split_settle_up")}
                        </button>
                    </div>
                </div>
            </div>
        </BottomSheet>
    );
}
