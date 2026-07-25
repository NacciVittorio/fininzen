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
    // Signed total of the day group, set only on the group's first item (the
    // one that renders the divider) and only when `netOf` is supplied.
    dayNet?: number;
};

export function decorateDatedItems<Row extends { date: string }>(
    items: readonly Row[] | null | undefined,
    months: readonly string[],
    translate: Translator,
    now = new Date(),
    netOf?: (row: Row) => number,
): DecoratedDatedItem<Row>[] {
    let previousDate: string | null = null;
    let previousMonth: string | null = null;
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000)
        .toISOString()
        .slice(0, 10);

    const decorated: DecoratedDatedItem<Row>[] = (items || []).map((item) => {
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

    // Second pass: day groups are only known once the dividers are placed, so
    // sum each group and hang the total on the row that renders its divider.
    if (netOf) {
        let groupStart: DecoratedDatedItem<Row> | null = null;
        for (const entry of decorated) {
            if (entry.showDayDivider) {
                groupStart = entry;
                groupStart.dayNet = 0;
            }
            if (groupStart) {
                groupStart.dayNet =
                    (groupStart.dayNet ?? 0) + netOf(entry.item);
            }
        }
    }

    return decorated;
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

/**
 * Both feeds open on the current month, so a period only counts as an active
 * filter once it deviates from it — otherwise the badge would read "1" on a
 * freshly loaded page (which is what the Investments count used to do).
 *
 * Several ranges can qualify as "the current month": the feeds are seeded with a
 * calendar month while Cash Flow's header pages by accounting month, and those
 * differ when the accounting month doesn't start on the 1st. Any of them means
 * "the user hasn't narrowed the period".
 */
export function isDefaultPeriod(
    dateFrom: string,
    dateTo: string,
    defaultRanges: readonly { from: string; to: string }[],
): boolean {
    return defaultRanges.some(
        (range) => dateFrom === range.from && dateTo === range.to,
    );
}

export function countCashflowFilters(
    filters: CashflowFilters,
    defaultRanges: readonly { from: string; to: string }[] = [],
): number {
    return (
        (filters.types.length !== 4 ? 1 : 0) +
        (filters.verified !== null && filters.verified !== undefined ? 1 : 0) +
        (filters.account_ids?.length ? 1 : 0) +
        (filters.category_ids?.length ? 1 : 0) +
        ((filters.ordering || "-date") !== "-date" ? 1 : 0) +
        (defaultRanges.length &&
        !isDefaultPeriod(filters.date_from, filters.date_to, defaultRanges)
            ? 1
            : 0)
    );
}
