"""
urls.py — Router principale del progetto.

Raggruppiamo le URL per app (expenses, portfolio) con il prefisso /api/
così il frontend sa sempre che le chiamate API iniziano con /api/.
"""

from django.conf import settings
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from fininzen.export_views import ExportView
from fininzen.views import (
    TokenObtainPairView,
    CookieTokenRefreshView,
    LogoutView,
    RegisterView,
    DemoLoginView,
    GrantsView,
    GrantDetailView,
    ProfileView,
    ChangePasswordView,
    AccountView,
    HealthView,
)
from fininzen.webauthn_views import (
    WebAuthnRegisterChallengeView,
    WebAuthnRegisterVerifyView,
    WebAuthnAuthChallengeView,
    WebAuthnAuthVerifyView,
    WebAuthnCredentialsView,
)

urlpatterns = [
    # Django Admin: pannello di amministrazione automatico.
    # Raggiungibile su http://localhost:8000/admin/
    # Permette di vedere/modificare tutti i dati senza scrivere codice.
    *([path("admin/", admin.site.urls)] if settings.DEBUG else []),
    # Auth endpoints
    path("api/auth/token/", TokenObtainPairView.as_view()),
    path("api/auth/token/refresh/", CookieTokenRefreshView.as_view()),
    path("api/auth/logout/", LogoutView.as_view()),
    path("api/auth/register/", RegisterView.as_view()),
    path("api/auth/demo/", DemoLoginView.as_view()),
    path("api/auth/profile/", ProfileView.as_view()),
    path("api/auth/change-password/", ChangePasswordView.as_view()),
    path("api/auth/account/", AccountView.as_view()),
    path("api/health/", HealthView.as_view()),
    # Grant endpoints
    path("api/auth/grants/", GrantsView.as_view()),
    path("api/auth/grants/<int:pk>/", GrantDetailView.as_view()),
    # WebAuthn (Face ID / Touch ID)
    path(
        "api/auth/webauthn/register/challenge/", WebAuthnRegisterChallengeView.as_view()
    ),
    path("api/auth/webauthn/register/verify/", WebAuthnRegisterVerifyView.as_view()),
    path("api/auth/webauthn/auth/challenge/", WebAuthnAuthChallengeView.as_view()),
    path("api/auth/webauthn/auth/verify/", WebAuthnAuthVerifyView.as_view()),
    path("api/auth/webauthn/credentials/", WebAuthnCredentialsView.as_view()),
    # Tutte le API delle spese sotto /api/expenses/
    path("api/expenses/", include("expenses.urls")),
    # Tutte le API del portafoglio sotto /api/portfolio/
    path("api/portfolio/", include("portfolio.urls")),
    # Data export (Feature F)
    path("api/export/", ExportView.as_view()),
    # OpenAPI schema (source of truth for the frontend typed client).
    # The raw schema is always available for codegen; the Swagger UI is dev-only.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    *(
        [
            path(
                "api/docs/",
                SpectacularSwaggerView.as_view(url_name="schema"),
                name="swagger-ui",
            )
        ]
        if settings.DEBUG
        else []
    ),
]
