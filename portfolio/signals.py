import threading

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Asset, AssetTransaction, DashboardSummary
from .services import (
    _recompute_asset_locked,
    _refresh_manual_asset,
    invalidate_dashboard_summary,
)

# Thread-local flag: when True, signal handlers skip per-item recomputation.
# Bulk operations set this before their loop and clear it in a finally block;
# they perform a single _refresh_assets_strict() pass at the end.
#
# CONTRACT: every new post_delete/post_save handler added to Expense or
# AssetTransaction MUST check this flag before triggering a recompute.
# The flag is set in expenses/bulk.py and read here and in expenses/signals.py.
_bulk_state = threading.local()


@receiver(post_delete, sender=AssetTransaction)
def refresh_asset_after_transaction_delete(sender, instance, **kwargs):
    """Keep balances/history in sync when a transaction is removed outside the API."""
    if getattr(_bulk_state, "skip_recompute", False):
        return

    asset_id = instance.asset_id
    owner_id = instance.owner_id

    if not asset_id:
        return

    try:
        asset = Asset.objects.get(pk=asset_id)
    except Asset.DoesNotExist:
        if owner_id:
            invalidate_dashboard_summary(
                DashboardSummary.REASON_TRANSACTION,
                user_id=owner_id,
            )
        return

    if asset.tracking_type == Asset.MANUAL:
        _refresh_manual_asset(asset)
    else:
        _recompute_asset_locked(asset)

    invalidate_dashboard_summary(
        DashboardSummary.REASON_TRANSACTION,
        user_id=asset.owner_id,
    )
