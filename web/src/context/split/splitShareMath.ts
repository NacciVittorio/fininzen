/**
 * splitShareMath.ts — Client-side mirror of splitting/services.py's quote
 * calculation (compute_equal_shares/compute_exact_shares/
 * compute_percentage_shares/compute_weighted_shares + _distribute_remainder),
 * used by useSplitExpenseForm.ts for an instant live preview while the user
 * fills the expense form — the backend recomputes and validates the same
 * numbers server-side on submit, this is UI feedback only, never the
 * authoritative source.
 *
 * Works in integer cents (not Decimal — there is no Decimal type in JS)
 * rather than floating dollars/euros throughout, so intermediate roundoff
 * never accumulates before the final `Math.round`. Every amount here is
 * assumed non-negative, so `Math.round` on a .5 boundary rounds away from
 * zero — the same behaviour as Python's ROUND_HALF_UP used server-side
 * (see splitting/services.py::_q2).
 */

export type SplitShareComputeError =
    | "no_participants"
    | "exact_amounts_mismatch"
    | "percentages_not_100"
    | "weights_not_positive";

export type SplitShareComputeResult =
    | { ok: true; shares: number[] }
    | { ok: false; error: SplitShareComputeError };

const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => cents / 100;

/** Round every raw (fractional-cent) share to the nearest cent, then push the
 * residual rounding drift (e.g. 100/3 = 33.33+33.33+33.33 = 99.99 → +0.01 to
 * the first share) onto the leading shares so sum(shares) === totalCents
 * exactly — mirror of _distribute_remainder in splitting/services.py. */
function distributeRemainderCents(
    totalCents: number,
    rawCentsList: number[],
): number[] {
    const quantized = rawCentsList.map((c) => Math.round(c));
    const sum = quantized.reduce((a, b) => a + b, 0);
    const diff = totalCents - sum;
    const step = diff > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(diff); i++) {
        const idx = i % quantized.length;
        quantized[idx] = (quantized[idx] ?? 0) + step;
    }
    return quantized;
}

export function computeEqualShares(
    total: number,
    n: number,
): SplitShareComputeResult {
    if (!n || n <= 0) return { ok: false, error: "no_participants" };
    const totalCents = toCents(total);
    const base = totalCents / n;
    const shares = distributeRemainderCents(totalCents, Array(n).fill(base));
    return { ok: true, shares: shares.map(fromCents) };
}

export function computeExactShares(
    total: number,
    exactAmounts: number[],
): SplitShareComputeResult {
    if (!exactAmounts.length) return { ok: false, error: "no_participants" };
    const totalCents = toCents(total);
    const cents = exactAmounts.map(toCents);
    const sum = cents.reduce((a, b) => a + b, 0);
    if (sum !== totalCents)
        return { ok: false, error: "exact_amounts_mismatch" };
    return { ok: true, shares: cents.map(fromCents) };
}

export function computePercentageShares(
    total: number,
    percentages: number[],
): SplitShareComputeResult {
    if (!percentages.length) return { ok: false, error: "no_participants" };
    const totalCents = toCents(total);
    const sumPct = percentages.reduce((a, b) => a + b, 0);
    // Compare at cent precision (2 decimals), same as _q2(sum(pcts)) != 100.00
    // server-side, so a user-facing 33.33+33.33+33.34 passes.
    if (Math.round(sumPct * 100) !== 10000) {
        return { ok: false, error: "percentages_not_100" };
    }
    const raw = percentages.map((p) => (totalCents * p) / 100);
    return {
        ok: true,
        shares: distributeRemainderCents(totalCents, raw).map(fromCents),
    };
}

export function computeWeightedShares(
    total: number,
    weights: number[],
): SplitShareComputeResult {
    if (!weights.length) return { ok: false, error: "no_participants" };
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) return { ok: false, error: "weights_not_positive" };
    const totalCents = toCents(total);
    const raw = weights.map((w) => (totalCents * w) / totalWeight);
    return {
        ok: true,
        shares: distributeRemainderCents(totalCents, raw).map(fromCents),
    };
}
