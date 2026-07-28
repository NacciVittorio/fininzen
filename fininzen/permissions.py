from rest_framework.permissions import BasePermission, SAFE_METHODS

DEMO_USERNAME = "demo@demo.com"


class IsNotDemoUser(BasePermission):
    """Block write operations for the shared demo account."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if request.user and request.user.is_authenticated:
            if request.user.username == DEMO_USERNAME:
                return False
        return True


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
