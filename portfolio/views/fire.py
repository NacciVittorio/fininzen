import logging
from django.db.models import Min
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import (
    AllocationTarget,
    Asset,
    InvestmentType,
)
from ..serializers import (
    AllocationTargetSerializer,
)
from ..services import (
    asset_current_value_eur,
)
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from fininzen.mixins import ViewAsMixin, _effective_user


from portfolio import views as _pv

logger = logging.getLogger(__name__)


class FireViewSet(ViewAsMixin, viewsets.ViewSet):
    """GET /api/portfolio/fire/ — metriche FIRE. PATCH /api/portfolio/fire/settings/ — aggiorna config."""

    def list(self, request):
        from ..fire import (
            calculate_fire_metrics,
            calculate_fire_projection,
            calculate_coast_fire,
            calculate_sensitivity_matrix,
            calculate_decumulation_projection,
            calculate_actionable_levers,
        )
        from ..models import FireSettings
        from expenses.models import Expense
        from django.db.models import Sum, Max
        from datetime import date

        settings = FireSettings.get_singleton(user=_effective_user(request))
        owner = _effective_user(request)
        _pv._reconcile_due_manual_assets_safe(owner)

        one_year_ago = date.today() - timedelta(days=365)
        flow_qs = Expense.objects.filter(
            owner=owner, is_verified=True, date__range=(one_year_ago, date.today())
        )
        expense_agg = flow_qs.filter(category__category_type="expense").aggregate(
            total=Sum("amount"), mn=Min("date"), mx=Max("date")
        )
        income_agg = flow_qs.filter(category__category_type="income").aggregate(
            total=Sum("amount"), mn=Min("date"), mx=Max("date")
        )

        def _annualize(agg):
            total = Decimal(str(agg["total"] or 0))
            if agg["mn"] and agg["mx"]:
                months = max(
                    (agg["mx"].year - agg["mn"].year) * 12
                    + agg["mx"].month
                    - agg["mn"].month
                    + 1,
                    1,
                )
            else:
                months = 12
            return (total / Decimal(str(months))) * Decimal("12")

        annual_expenses_computed = _annualize(expense_agg)
        annual_income_computed = _annualize(income_agg)

        # Annual expenses: override or computed.
        if settings.annual_expenses_override:
            annual_expenses = settings.annual_expenses_override
        else:
            annual_expenses = annual_expenses_computed

        current_nw = sum(
            (
                value
                for value in (
                    asset_current_value_eur(asset)
                    for asset in Asset.objects.filter(owner=owner, is_archived=False)
                )
                if value is not None
            ),
            Decimal("0"),
        )
        annual_savings_auto = annual_income_computed - annual_expenses
        annual_contribution = (
            settings.annual_contribution
            if settings.annual_contribution is not None
            else annual_savings_auto
        )

        model_mode = (
            settings.model_mode
            if settings.model_mode in ("classic", "real", "dual")
            else "dual"
        )
        withdrawal_rate = (
            settings.withdrawal_rate
            if settings.withdrawal_rate and settings.withdrawal_rate > 0
            else Decimal("0.04")
        )
        swr_base = (
            settings.swr_base
            if settings.swr_base and settings.swr_base > 0
            else withdrawal_rate
        )
        annual_passive_income = settings.annual_passive_income_retirement or Decimal(
            "0"
        )
        annual_expenses_retirement = (
            settings.annual_expenses_retirement or annual_expenses
        )
        annual_expenses_net = max(
            Decimal("0"), annual_expenses_retirement - annual_passive_income
        )
        fire_number_classic = annual_expenses / withdrawal_rate
        fire_number_real = (
            annual_expenses_net / swr_base if swr_base > 0 else Decimal("0")
        )
        active_fire_number = (
            fire_number_classic if model_mode == "classic" else fire_number_real
        )

        wr = withdrawal_rate if model_mode == "classic" else swr_base
        scenarios = {
            "bear": settings.growth_rate_bear,
            "base": settings.expected_nominal_return,
            "bull": settings.growth_rate_bull,
        }

        metrics = calculate_fire_metrics(
            current_nw=current_nw,
            annual_expenses=annual_expenses
            if model_mode == "classic"
            else annual_expenses_net,
            withdrawal_rate=wr,
            annual_savings=annual_contribution,
            annual_growth=settings.expected_nominal_return,
        )
        metrics["safe_spending_annual"] = str(
            (current_nw * swr_base).quantize(Decimal("0.01"))
        )
        metrics["fire_number_classic"] = str(
            fire_number_classic.quantize(Decimal("0.01"))
        )
        metrics["fire_number_real"] = str(fire_number_real.quantize(Decimal("0.01")))
        metrics["model_mode"] = model_mode

        projection, fired_year = calculate_fire_projection(
            initial_nw=current_nw,
            annual_savings=annual_contribution,
            annual_expenses=annual_expenses
            if model_mode == "classic"
            else annual_expenses_net,
            withdrawal_rate=wr,
            scenarios=scenarios,
            inflation=settings.inflation_rate,
        )

        try:
            coast = calculate_coast_fire(
                current_nw=current_nw,
                user_age=settings.user_age,
                retirement_age=settings.target_retirement_age
                or settings.retirement_age,
                annual_expenses_at_retirement=annual_expenses_retirement,
                growth_pct=settings.expected_nominal_return,
                inflation_pct=settings.inflation_rate,
                withdrawal_rate=wr,
            )
        except ValueError:
            coast = {
                "coast_number": "0.00",
                "fire_number_at_retirement": "0.00",
                "progress_pct": "100.00",
                "already_coast": True,
                "real_return": "0",
                "years_to_retirement": 0,
            }

        sensitivity = calculate_sensitivity_matrix(
            initial_nw=current_nw,
            base_annual_savings=annual_contribution,
            base_annual_expenses=annual_expenses
            if model_mode == "classic"
            else annual_expenses_net,
            withdrawal_rate=wr,
            growth_rate=settings.expected_nominal_return,
            inflation=settings.inflation_rate,
        )
        decumulation = calculate_decumulation_projection(
            starting_nw=active_fire_number,
            annual_spending_need=annual_expenses_net,
            scenarios=scenarios,
            years=max(
                1,
                int(
                    (settings.life_expectancy or 95)
                    - (settings.target_retirement_age or 65)
                ),
            ),
        )
        actionable_levers = calculate_actionable_levers(
            current_nw=current_nw,
            annual_expenses_net=annual_expenses_net,
            annual_savings=annual_contribution,
            expected_return=settings.expected_nominal_return,
            swr=swr_base,
        )
        probability_band = {
            "p50": {"years_to_fire": fired_year.get("base"), "scenario": "base"},
            "p80": {"years_to_fire": fired_year.get("bear"), "scenario": "bear"},
            "p20": {"years_to_fire": fired_year.get("bull"), "scenario": "bull"},
        }

        return Response(
            {
                "metrics": metrics,
                "kpis": {
                    "fire_number_classic": str(
                        fire_number_classic.quantize(Decimal("0.01"))
                    ),
                    "fire_number_real": str(fire_number_real.quantize(Decimal("0.01"))),
                    "years_to_fire": metrics.get("years_to_fire"),
                    "coast_status": coast.get("already_coast"),
                    "safe_spending_annual": metrics["safe_spending_annual"],
                },
                "coast_fire": coast,
                "projection": projection,
                "accumulation_projection": projection,
                "fired_year": fired_year,
                "sensitivity": sensitivity,
                "decumulation_projection": decumulation,
                "probability_band": probability_band,
                "actionable_levers": actionable_levers,
                "settings": {
                    "user_age": settings.user_age,
                    "retirement_age": settings.retirement_age,
                    "withdrawal_rate": str(settings.withdrawal_rate),
                    "annual_expenses_override": str(settings.annual_expenses_override)
                    if settings.annual_expenses_override
                    else None,
                    "growth_rate_bear": str(settings.growth_rate_bear),
                    "growth_rate_base": str(settings.growth_rate_base),
                    "growth_rate_bull": str(settings.growth_rate_bull),
                    "inflation_rate": str(settings.inflation_rate),
                    "net_worth_goal": str(settings.net_worth_goal)
                    if settings.net_worth_goal is not None
                    else None,
                    "model_mode": model_mode,
                    "swr_base": str(settings.swr_base),
                    "swr_min": str(settings.swr_min),
                    "swr_max": str(settings.swr_max),
                    "annual_expenses_retirement": str(
                        settings.annual_expenses_retirement
                    )
                    if settings.annual_expenses_retirement is not None
                    else None,
                    "annual_passive_income_retirement": str(
                        settings.annual_passive_income_retirement
                    ),
                    "expected_real_return": str(settings.expected_real_return),
                    "expected_nominal_return": str(settings.expected_nominal_return),
                    "annual_contribution": str(settings.annual_contribution)
                    if settings.annual_contribution is not None
                    else None,
                    "tax_drag_rate": str(settings.tax_drag_rate),
                    "target_retirement_age": settings.target_retirement_age,
                    "life_expectancy": settings.life_expectancy,
                    "portfolio_equity_pct": str(settings.portfolio_equity_pct),
                },
                "computed_annual_expenses": str(annual_expenses),
                "computed_annual_income": str(annual_income_computed),
                "computed_annual_savings": str(annual_savings_auto),
                "effective_annual_contribution": str(annual_contribution),
                "annual_expenses_net": str(annual_expenses_net),
                "current_nw": str(current_nw),
            }
        )

    @action(detail=False, methods=["patch"], url_path="settings")
    def update_settings(self, request):
        from ..models import FireSettings

        settings = FireSettings.get_singleton(user=_effective_user(request))
        fields = [
            "user_age",
            "retirement_age",
            "withdrawal_rate",
            "annual_expenses_override",
            "growth_rate_bear",
            "growth_rate_base",
            "growth_rate_bull",
            "inflation_rate",
            "net_worth_goal",
            "model_mode",
            "swr_base",
            "swr_min",
            "swr_max",
            "annual_expenses_retirement",
            "annual_passive_income_retirement",
            "expected_real_return",
            "expected_nominal_return",
            "annual_contribution",
            "tax_drag_rate",
            "target_retirement_age",
            "life_expectancy",
            "portfolio_equity_pct",
        ]
        RATE_FIELDS = {
            "withdrawal_rate",
            "growth_rate_bear",
            "growth_rate_base",
            "growth_rate_bull",
            "inflation_rate",
            "swr_base",
            "swr_min",
            "swr_max",
            "expected_real_return",
            "expected_nominal_return",
            "tax_drag_rate",
        }
        nullable_fields = {
            "annual_expenses_override",
            "net_worth_goal",
            "annual_expenses_retirement",
            "annual_contribution",
        }
        integer_fields = {
            "user_age",
            "retirement_age",
            "target_retirement_age",
            "life_expectancy",
        }
        decimal_fields = set(fields) - integer_fields - {"model_mode"}
        non_negative_fields = decimal_fields - {
            "growth_rate_bear",
            "growth_rate_base",
            "growth_rate_bull",
            "expected_real_return",
            "expected_nominal_return",
        }
        strictly_positive_rates = {"withdrawal_rate", "swr_base", "swr_min", "swr_max"}
        for field in fields:
            if field in request.data:
                val = request.data[field]
                if val in (None, "", "null"):
                    if field not in nullable_fields:
                        return Response(
                            {"error": f"{field} cannot be null"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    setattr(settings, field, None)
                else:
                    try:
                        if field in integer_fields:
                            val = int(val)
                            if val <= 0:
                                raise ValueError
                        elif field in decimal_fields:
                            val = Decimal(str(val))
                    except (TypeError, ValueError, InvalidOperation):
                        return Response(
                            {"error": f"Valore non valido per {field}"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    setattr(settings, field, val)

        for f in RATE_FIELDS:
            v = getattr(settings, f, None)
            if v is not None:
                try:
                    v = Decimal(str(v))
                except Exception:
                    return Response(
                        {"error": f"Valore non valido per {f}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not (Decimal("-0.9999") <= v <= Decimal("0.9999")):
                    return Response(
                        {
                            "error": f"'{f}' deve essere un valore decimale (es. 0.07 per 7%), non una percentuale (es. 7)."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                setattr(settings, f, v)
        for f in non_negative_fields:
            value = getattr(settings, f, None)
            if value is not None and Decimal(str(value)) < 0:
                return Response(
                    {"error": f"{f} must be >= 0"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        for f in strictly_positive_rates:
            value = getattr(settings, f, None)
            if value is None or Decimal(str(value)) <= 0:
                return Response(
                    {"error": f"{f} must be > 0"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if settings.model_mode not in ("classic", "real", "dual"):
            return Response(
                {"error": "model_mode must be one of: classic, real, dual"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (
            settings.swr_min
            and settings.swr_max
            and settings.swr_min > settings.swr_max
        ):
            return Response(
                {"error": "swr_min must be <= swr_max"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (
            settings.user_age
            and settings.retirement_age
            and settings.retirement_age <= settings.user_age
        ):
            return Response(
                {"error": "retirement_age must be > user_age"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (
            settings.user_age
            and settings.target_retirement_age
            and settings.target_retirement_age <= settings.user_age
        ):
            return Response(
                {"error": "target_retirement_age must be > user_age"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (
            settings.target_retirement_age
            and settings.life_expectancy
            and settings.life_expectancy <= settings.target_retirement_age
        ):
            return Response(
                {"error": "life_expectancy must be > target_retirement_age"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings.save()
        return Response(
            {
                "user_age": settings.user_age,
                "retirement_age": settings.retirement_age,
                "withdrawal_rate": str(settings.withdrawal_rate),
                "annual_expenses_override": str(settings.annual_expenses_override)
                if settings.annual_expenses_override
                else None,
                "growth_rate_bear": str(settings.growth_rate_bear),
                "growth_rate_base": str(settings.growth_rate_base),
                "growth_rate_bull": str(settings.growth_rate_bull),
                "inflation_rate": str(settings.inflation_rate),
                "net_worth_goal": str(settings.net_worth_goal)
                if settings.net_worth_goal is not None
                else None,
                "model_mode": settings.model_mode,
                "swr_base": str(settings.swr_base),
                "swr_min": str(settings.swr_min),
                "swr_max": str(settings.swr_max),
                "annual_expenses_retirement": str(settings.annual_expenses_retirement)
                if settings.annual_expenses_retirement is not None
                else None,
                "annual_passive_income_retirement": str(
                    settings.annual_passive_income_retirement
                ),
                "expected_real_return": str(settings.expected_real_return),
                "expected_nominal_return": str(settings.expected_nominal_return),
                "annual_contribution": str(settings.annual_contribution)
                if settings.annual_contribution is not None
                else None,
                "tax_drag_rate": str(settings.tax_drag_rate),
                "target_retirement_age": settings.target_retirement_age,
                "life_expectancy": settings.life_expectancy,
                "portfolio_equity_pct": str(settings.portfolio_equity_pct),
            }
        )

    def create(self, request):
        """Crea o aggiorna il target per un tipo di investimento."""
        inv_type_id = request.data.get("investment_type")
        target_pct = request.data.get("target_percent")
        if not inv_type_id or target_pct is None:
            return Response(
                {"error": "investment_type e target_percent richiesti"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        inv_type = get_object_or_404(
            InvestmentType, pk=inv_type_id, owner=_effective_user(request)
        )
        target, created = AllocationTarget.objects.update_or_create(
            investment_type=inv_type,
            owner=_effective_user(request),
            defaults={"target_percent": Decimal(str(target_pct))},
        )
        return Response(
            AllocationTargetSerializer(target).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def destroy(self, request, pk=None):
        target = get_object_or_404(
            AllocationTarget, pk=pk, owner=_effective_user(request)
        )
        target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
