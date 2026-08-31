from datetime import timedelta

from django.utils import timezone
from rest_framework.permissions import BasePermission, SAFE_METHODS

from fininzen.models import ApiToken

DEMO_USERNAME = "demo@demo.com"

# How often UserProfile.last_activity_at is allowed to be re-written per user.
# A per-request write would be wasted I/O for no real gain in precision.
ACTIVITY_TOUCH_INTERVAL = timedelta(minutes=5)


class IsNotDemoUser(BasePermission):
    """Block write operations for the shared demo account."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if request.user and request.user.is_authenticated:
            if request.user.username == DEMO_USERNAME:
                return False
        return True


def touch_last_activity(user):
    """Stamp UserProfile.last_activity_at, throttled to ACTIVITY_TOUCH_INTERVAL.

    Called from the authentication classes (see fininzen.authentication) rather
    than from a permission class or middleware: most views set an explicit
    permission_classes list (overriding DEFAULT_PERMISSION_CLASSES entirely),
    but none override authentication_classes, so that's the one hook that
    reliably fires for every authenticated request. Also too early to live in
    plain Django middleware — ViewAsMiddleware documents that it runs before
    JWTAuthentication resolves request.user.
    """
    profile = getattr(user, "profile", None)
    if profile is None:
        return
    now = timezone.now()
    if (
        profile.last_activity_at is None
        or now - profile.last_activity_at >= ACTIVITY_TOUCH_INTERVAL
    ):
        profile.last_activity_at = now
        profile.save(update_fields=["last_activity_at"])


def requires_api_token_scope(scope):
    """Permission factory restricting a view to ApiToken auth with the given
    scope. Only one scope exists today (ApiToken.SCOPE_EXPENSES_WRITE), but
    this is still enforced (not just stored) so the scope field isn't dead:
    a token can only ever do what its scope says, even as more scopes are
    added later without redesigning this check."""

    class _HasApiTokenScope(BasePermission):
        def has_permission(self, request, view):
            token = request.auth
            return isinstance(token, ApiToken) and token.scope == scope

    return _HasApiTokenScope


class IsAdmin(BasePermission):
    """Only users whose profile role is 'admin'.

    Distinct from Django's own is_staff/is_superuser, which stay reserved for
    the (DEBUG-only) Django admin site rather than this app's admin portal.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        profile = getattr(user, "profile", None)
        return bool(profile and profile.role == profile.ROLE_ADMIN)
