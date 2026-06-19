from django.utils import timezone

from fininzen.models import DemoSeedState

DEMO_EMAIL = "demo@demo.com"
DEMO_SEED_STATE_KEY = "shared-demo"
DEMO_SEED_VERSION = "v3"


def demo_month_key(now=None):
    return (now or timezone.localdate()).strftime("%Y-%m")


def demo_seed_is_complete(user):
    from expenses.models import Budget, Expense, RecurringExpense
    from portfolio.models import Asset, FireSettings

    today = timezone.localdate()
    return all(
        [
            Expense.objects.filter(owner=user).exists(),
            Expense.objects.filter(
                owner=user,
                date__year=today.year,
                date__month=today.month,
            ).exists(),
            Asset.objects.filter(owner=user, is_archived=False).exists(),
            Asset.objects.filter(
                owner=user, investment_type__is_bank_account=True
            ).exists(),
            Budget.objects.filter(owner=user).exists(),
            RecurringExpense.objects.filter(
                owner=user,
                status=RecurringExpense.STATUS_ACTIVE,
                is_active=True,
            ).exists(),
            FireSettings.objects.filter(owner=user).exists(),
        ]
    )


def ensure_demo_seed(user, Asset, InvestmentType, *, state=None):
    from expenses.services import seed_demo_for_user

    month_key = demo_month_key()
    if state is None:
        state, _ = DemoSeedState.objects.select_for_update().get_or_create(
            key=DEMO_SEED_STATE_KEY
        )
    should_seed = (
        state.last_seeded_month != month_key
        or state.seed_version != DEMO_SEED_VERSION
        or not demo_seed_is_complete(user)
    )
    if should_seed:
        seed_demo_for_user(user, Asset, InvestmentType, month_key=month_key)
        state.last_seeded_month = month_key
        state.seed_version = DEMO_SEED_VERSION
        state.last_seeded_at = timezone.now()
        state.save(
            update_fields=["last_seeded_month", "seed_version", "last_seeded_at"]
        )
    return should_seed, state
