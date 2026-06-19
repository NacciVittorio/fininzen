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
