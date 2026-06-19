"""Core FIRE computations used by API views."""

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation


def _q(val: Decimal) -> str:
    try:
        return str(val.quantize(Decimal("0.01"), ROUND_HALF_UP))
    except InvalidOperation:
        return str(int(round(float(val))))


def _clamp(v: Decimal, low: Decimal, high: Decimal) -> Decimal:
    return max(low, min(high, v))


def _fire_number(annual_expenses: Decimal, swr: Decimal) -> Decimal:
    if swr <= 0:
        return Decimal("0")
    return max(Decimal("0"), annual_expenses / swr)


def calculate_fire_metrics(
    current_nw: Decimal,
    annual_expenses: Decimal,
    withdrawal_rate: Decimal = Decimal("0.04"),
    annual_savings: Decimal = Decimal("0"),
    annual_growth: Decimal = Decimal("0.07"),
) -> dict:
    fire_number = _fire_number(annual_expenses, withdrawal_rate)
    progress_pct = (current_nw / fire_number * 100) if fire_number > 0 else Decimal("0")
    runway_years = (current_nw / annual_expenses) if annual_expenses > 0 else None

    years_to_fire = None
    if current_nw < fire_number:
        nw = current_nw
        for yr in range(1, 101):
            nw = nw * (1 + annual_growth) + annual_savings
            if nw >= fire_number:
                years_to_fire = yr
                break

    return {
        "fire_number": _q(fire_number),
        "progress_pct": _q(_clamp(progress_pct, Decimal("0"), Decimal("100"))),
        "already_fire": current_nw >= fire_number,
        "years_to_fire": years_to_fire,
        "runway_years": str(runway_years.quantize(Decimal("0.1"), ROUND_HALF_UP))
        if runway_years
        else None,
        "current_nw": str(current_nw),
        "annual_expenses": str(annual_expenses),
        "withdrawal_rate": str(withdrawal_rate),
    }


def calculate_fire_projection(
    initial_nw: Decimal,
    annual_savings: Decimal,
    annual_expenses: Decimal,
    withdrawal_rate: Decimal,
    scenarios: dict,
    inflation: Decimal = Decimal("0.02"),
    max_years: int = 50,
) -> tuple[list[dict], dict]:
    nw = {"bear": initial_nw, "base": initial_nw, "bull": initial_nw}
    fired = {"bear": False, "base": False, "bull": False}
    fired_year = {"bear": None, "base": None, "bull": None}

    results = []
    expenses = annual_expenses
    for yr in range(1, max_years + 1):
        expenses = expenses * (1 + inflation)
        fire_number = _fire_number(expenses, withdrawal_rate)

        for scenario, growth in scenarios.items():
            nw[scenario] = nw[scenario] * (1 + growth) + annual_savings
            if not fired[scenario] and nw[scenario] >= fire_number:
                fired[scenario] = True
                fired_year[scenario] = yr

        results.append(
            {
                "year": yr,
                "fire_number": _q(fire_number),
                "nw_bear": _q(nw["bear"]),
                "nw_base": _q(nw["base"]),
                "nw_bull": _q(nw["bull"]),
                "fired_bear": fired["bear"],
                "fired_base": fired["base"],
                "fired_bull": fired["bull"],
            }
        )

    return results, fired_year


def calculate_coast_fire(
    current_nw: Decimal,
    user_age: int,
    retirement_age: int,
    annual_expenses_at_retirement: Decimal,
    growth_pct: Decimal,
    inflation_pct: Decimal,
    withdrawal_rate: Decimal = Decimal("0.04"),
) -> dict:
    years_to_retirement = retirement_age - user_age
    if years_to_retirement <= 0:
        raise ValueError("retirement_age must be > user_age")

    fire_number_at_retirement = _fire_number(
        annual_expenses_at_retirement, withdrawal_rate
    )
    real_return = growth_pct - inflation_pct
    growth_factor = (1 + real_return) ** years_to_retirement
    coast_number = (
        fire_number_at_retirement / growth_factor
        if growth_factor > 0
        else fire_number_at_retirement
    )
    progress_pct = (
        (current_nw / coast_number * 100) if coast_number > 0 else Decimal("100")
    )

    return {
        "coast_number": _q(coast_number),
        "fire_number_at_retirement": _q(fire_number_at_retirement),
        "progress_pct": _q(_clamp(progress_pct, Decimal("0"), Decimal("100"))),
        "already_coast": current_nw >= coast_number,
        "real_return": str(real_return),
        "years_to_retirement": years_to_retirement,
    }


def calculate_sensitivity_matrix(
    initial_nw: Decimal,
    base_annual_savings: Decimal,
    base_annual_expenses: Decimal,
    withdrawal_rate: Decimal,
    growth_rate: Decimal,
    inflation: Decimal = Decimal("0.02"),
    steps: int = 5,
) -> dict:
    saving_multipliers = [
        Decimal("0.8"),
        Decimal("0.9"),
        Decimal("1.0"),
        Decimal("1.1"),
        Decimal("1.2"),
    ]
    spending_multipliers = [
        Decimal("0.8"),
        Decimal("0.9"),
        Decimal("1.0"),
        Decimal("1.1"),
        Decimal("1.2"),
    ]

    matrix = []
    for sm in saving_multipliers:
        row = []
        for pm in spending_multipliers:
            savings = base_annual_savings * sm
            expenses = base_annual_expenses * pm
            fire_number = _fire_number(expenses, withdrawal_rate)
            years = None
            nw = initial_nw
            for yr in range(1, 101):
                nw = nw * (1 + growth_rate) + savings
                if nw >= fire_number:
                    years = yr
                    break
            row.append(years)
        matrix.append(row)

    return {
        "saving_multipliers": [str(m) for m in saving_multipliers],
        "spending_multipliers": [str(m) for m in spending_multipliers],
        "matrix": matrix,
    }


def calculate_decumulation_projection(
    starting_nw: Decimal,
    annual_spending_need: Decimal,
    scenarios: dict,
    years: int,
) -> dict:
    runway = {}
    curves = {}
    for name, growth in scenarios.items():
        nw = starting_nw
        fail_year = None
        points = []
        for yr in range(1, years + 1):
            nw = nw * (1 + growth) - annual_spending_need
            points.append({"year": yr, "nw": _q(nw)})
            if fail_year is None and nw <= 0:
                fail_year = yr
        runway[name] = fail_year
        curves[name] = points
    return {"runway_failure_year": runway, "curves": curves}


def calculate_actionable_levers(
    current_nw: Decimal,
    annual_expenses_net: Decimal,
    annual_savings: Decimal,
    expected_return: Decimal,
    swr: Decimal,
) -> list[dict]:
    base = calculate_fire_metrics(
        current_nw=current_nw,
        annual_expenses=annual_expenses_net,
        withdrawal_rate=swr,
        annual_savings=annual_savings,
        annual_growth=expected_return,
    )
    base_years = base["years_to_fire"] or 0

    levers = [
        ("save_plus_100_month", Decimal("1200"), Decimal("0"), Decimal("0")),
        ("spend_minus_100_month", Decimal("0"), Decimal("1200"), Decimal("0")),
        ("return_plus_0_5pct", Decimal("0"), Decimal("0"), Decimal("0.005")),
    ]
    results = []
    for key, delta_save, delta_spend, delta_return in levers:
        probe = calculate_fire_metrics(
            current_nw=current_nw,
            annual_expenses=max(Decimal("0"), annual_expenses_net - delta_spend),
            withdrawal_rate=swr,
            annual_savings=annual_savings + delta_save,
            annual_growth=expected_return + delta_return,
        )
        probe_years = probe["years_to_fire"] or 0
        results.append(
            {
                "lever": key,
                "years_to_fire": probe["years_to_fire"],
                "delta_years": base_years - probe_years,
            }
        )

    return sorted(results, key=lambda x: x["delta_years"], reverse=True)
