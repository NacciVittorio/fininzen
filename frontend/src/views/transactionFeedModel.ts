import { formatDate } from "../utils/formatters";
import type { NumericValue, Translator } from "../types";
import type { CashflowFilters } from "../context/feedDefaults";

type CashflowRecord = {
    date: string;
    type: string;
    amount?: NumericValue;
    is_verified?: boolean;
};

export type DecoratedDatedItem<Row> = {
    item: Row;
    monthKey: string;
    showMonthDivider: boolean;
    monthLabel: string;
    showDayDivider: boolean;
    dayLabel: string;
};

export function decorateDatedItems<Row extends { date: string }>(
    items: readonly Row[] | null | undefined,
    months: readonly string[],
    translate: Translator,
    now = new Date(),
): DecoratedDatedItem<Row>[] {
    let previousDate: string | null = null;
    let previousMonth: string | null = null;
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000)
        .toISOString()
        .slice(0, 10);

    return (items || []).map((item) => {
        const date = new Date(item.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const showMonthDivider = monthKey !== previousMonth;
        const showDayDivider = item.date !== previousDate;
        previousMonth = monthKey;
        previousDate = item.date;

        return {
            item,
            monthKey,
            showMonthDivider,
            monthLabel: `${months[date.getMonth()] ?? ""} ${date.getFullYear()}`,
            showDayDivider,
            dayLabel:
                item.date === today
                    ? translate("divider_today")
                    : item.date === yesterday
                      ? translate("divider_yesterday")
                      : formatDate(item.date),
        };
    });
}

export function getCashflowTotals(
    items: readonly CashflowRecord[] | null | undefined,
    summary?: Record<string, NumericValue> | null,
): { income: number; outcome: number; net: number } {
    const totalFor = (type: "income" | "outcome") =>
        summary?.[type] !== undefined
            ? Number.parseFloat(String(summary[type] || 0))
            : (items || []).reduce(
                  (total, item) =>
                      total +
                      (item.is_verified && item.type === type
                          ? Number.parseFloat(String(item.amount || 0))
                          : 0),
                  0,
              );
    const income = totalFor("income");
    const outcome = totalFor("outcome");
    return { income, outcome, net: income - outcome };
}

export type CashflowPeriod =
    | { kind: "all" }
    | { kind: "year"; year: number }
    | { kind: "month"; month: number; year: number };

export function getCashflowPeriod(
    filters: Pick<CashflowFilters, "date_from" | "date_to">,
): CashflowPeriod {
    const from = filters.date_from;
    const to = filters.date_to;
    if (!from) return { kind: "all" };
    const date = new Date(from);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    if (from === `${year}-01-01` && to === `${year}-12-31`) {
        return { kind: "year", year };
    }
    return { kind: "month", month, year };
}

export function countCashflowFilters(filters: CashflowFilters): number {
    return (
        (filters.types.length !== 4 ? 1 : 0) +
        (filters.verified !== null && filters.verified !== undefined ? 1 : 0) +
        (filters.account_ids?.length ? 1 : 0) +
        (filters.category_ids?.length ? 1 : 0) +
        ((filters.ordering || "-date") !== "-date" ? 1 : 0)
    );
}
