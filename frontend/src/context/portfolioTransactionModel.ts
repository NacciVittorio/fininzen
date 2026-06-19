import type { TransactionForm } from "./formBuilders";
import type { DecimalInput, DecimalSeparator } from "../utils/formatters";

type ParseDecimal = (value: string) => number;
type ParseMoney = (
    value: DecimalInput,
    separator?: DecimalSeparator,
) => string | null;

export type PortfolioTransactionBody = Omit<
    TransactionForm,
    "linked_account_id" | "contribution_source"
> & {
    contribution_source: number | null;
    tax_amount_is_manual: boolean;
    source_account_id?: string;
    dest_account_id?: string;
};

type BuildPortfolioTransactionPayloadArgs = {
    form: TransactionForm;
    editingTxId?: number | string | null;
    taxIsManual?: boolean | null;
    parseFlexibleDecimal: ParseDecimal;
    parseMoneyToString: ParseMoney;
};

export type PortfolioTransactionPayloadResult =
    | { ok: false; errorKey: string }
    | { ok: true; body: PortfolioTransactionBody };

export const buildPortfolioTransactionPayload = ({
    form,
    editingTxId = null,
    taxIsManual,
    parseFlexibleDecimal,
    parseMoneyToString,
}: BuildPortfolioTransactionPayloadArgs): PortfolioTransactionPayloadResult => {
    if (!form.shares || !form.price_per_share || !form.date) {
        return { ok: false, errorKey: "tx_error_fields" };
    }

    const parsedShares = parseFlexibleDecimal(form.shares);
    const parsedPrice = parseFlexibleDecimal(form.price_per_share);
    const parsedFee = form.fee ? parseFlexibleDecimal(form.fee) : 0;
    const parsedTaxAmount = form.tax_amount
        ? parseFlexibleDecimal(form.tax_amount)
        : 0;
    if (
        Number.isNaN(parsedShares) ||
        Number.isNaN(parsedPrice) ||
        Number.isNaN(parsedFee) ||
        Number.isNaN(parsedTaxAmount) ||
        parsedShares <= 0 ||
        parsedPrice <= 0 ||
        parsedFee < 0 ||
        parsedTaxAmount < 0
    ) {
        return { ok: false, errorKey: "error_invalid_amount" };
    }

    const { linked_account_id: linkedAccountId, ...formWithoutLinkedAccount } =
        form;
    const contributionSource = form.contribution_source
        ? parseInt(form.contribution_source, 10)
        : null;
    const shares = parseMoneyToString(form.shares, null);
    const pricePerShare = parseMoneyToString(form.price_per_share, null);
    const fee = form.fee ? parseMoneyToString(form.fee, null) : "0";
    const taxAmount =
        form.transaction_type === "sell" && form.tax_amount
            ? parseMoneyToString(form.tax_amount, null)
            : "0";
    if (
        shares == null ||
        pricePerShare == null ||
        fee == null ||
        taxAmount == null
    ) {
        return { ok: false, errorKey: "error_invalid_amount" };
    }
    const body: PortfolioTransactionBody = {
        ...formWithoutLinkedAccount,
        shares,
        price_per_share: pricePerShare,
        fee,
        tax_amount: taxAmount,
        tax_amount_is_manual:
            taxIsManual != null
                ? taxIsManual
                : form.transaction_type === "sell" && Boolean(form.tax_amount),
        contribution_source:
            form.transaction_type === "buy" && !linkedAccountId
                ? contributionSource
                : null,
    };

    if (form.transaction_type === "buy") {
        if (editingTxId || linkedAccountId) {
            body.source_account_id = linkedAccountId || "";
        }
    } else if (editingTxId || linkedAccountId) {
        body.dest_account_id = linkedAccountId || "";
    }

    return { ok: true, body };
};
