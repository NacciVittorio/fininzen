import logging
from rest_framework.exceptions import ParseError, PermissionDenied, Throttled

from finnet.models import DataAccessGrant

logger = logging.getLogger(__name__)

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


def _throttle_view_as_attempt(request):
    from finnet.throttles import ViewAsAttemptRateThrottle

    throttle = ViewAsAttemptRateThrottle()
    if not throttle.allow_request(request, view=None):
        raise Throttled(wait=throttle.wait())


def resolve_view_as(request):
    """Resolve X-View-As after DRF authentication and cache the result."""
    if getattr(request, "_view_as_resolved", False):
        return getattr(request, "view_as_user", None)

    request._view_as_resolved = True
    request.view_as_user = None
    request.view_as_permission = None
    raw_owner_id = request.headers.get("X-View-As")
    if not raw_owner_id:
        return None

    user = request.user
    if not (user and user.is_authenticated):
        return None
    try:
        owner_id = int(str(raw_owner_id).strip())
        if owner_id <= 0:
            raise ValueError
    except (TypeError, ValueError):
        _throttle_view_as_attempt(request)
        logger.warning("ViewAs: malformed owner id from user=%s", user)
        raise ParseError("X-View-As must be a positive integer.")

    grant = (
        DataAccessGrant.objects.filter(owner_id=owner_id, grantee=user)
        .select_related("owner")
        .first()
    )
    if not grant:
        _throttle_view_as_attempt(request)
        logger.warning(
            "ViewAs: rejected user=%s owner_id=%s ip=%s",
            user,
            owner_id,
            request.META.get("REMOTE_ADDR", "?"),
        )
        raise PermissionDenied("View-as grant not found.")

    request.view_as_user = grant.owner
    request.view_as_permission = grant.permission
    logger.debug(
        "ViewAs: user=%s viewing_as=%s permission=%s",
        user,
        grant.owner,
        grant.permission,
    )
    return grant.owner


def _effective_user(request):
    """Returns the target user for data access (view-as override or authenticated user)."""
    resolve_view_as(request)
    return getattr(request, "view_as_user", None) or request.user


def require_view_as_full(request):
    """Allow destructive shared-data actions only with a full grant."""
    resolve_view_as(request)
    if (
        getattr(request, "view_as_user", None)
        and getattr(request, "view_as_permission", None) != "full"
    ):
        raise PermissionDenied("Questa azione richiede un grant full.")


def require_personal_context(request):
    """Reject operations which must always target the authenticated account."""
    resolve_view_as(request)
    if getattr(request, "view_as_user", None):
        raise PermissionDenied("Operazione non disponibile in modalità view-as.")


class ViewAsMixin:
    """Mixin for ModelViewSet: routes queries to view_as_user when set, blocks writes on read-only grants."""

    def get_effective_user(self):
        return _effective_user(self.request)

    def check_permissions(self, request):
        view_as = resolve_view_as(request)
        if view_as and getattr(request, "view_as_permission", None) == "read":
            if request.method not in SAFE_METHODS:
                logger.warning(
                    "ViewAsMixin: write blocked for user=%s viewing as=%s method=%s",
                    request.user,
                    view_as,
                    request.method,
                )
                raise PermissionDenied("Accesso in sola lettura.")
        super().check_permissions(request)
