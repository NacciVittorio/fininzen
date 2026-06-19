from django.conf import settings
from django.db import models


FEATURE_DASHBOARD = "dashboard"
FEATURE_CASHFLOW = "cashflow"
FEATURE_ACCOUNTS = "accounts"
FEATURE_INVESTMENTS = "investments"
FEATURE_FIRE = "fire"

ENABLED_FEATURE_KEYS = (
    FEATURE_DASHBOARD,
    FEATURE_CASHFLOW,
    FEATURE_ACCOUNTS,
    FEATURE_INVESTMENTS,
    FEATURE_FIRE,
)

DEFAULT_ENABLED_FEATURES = {key: True for key in ENABLED_FEATURE_KEYS}


def normalize_enabled_features(value):
    source = value if isinstance(value, dict) else {}
    return {
        key: bool(source[key]) if key in source else True
        for key in ENABLED_FEATURE_KEYS
    }


# Transaction-creation preferences. All default to False so existing users keep
# the historical behaviour (transactions created unverified, no account autofill).
TRANSACTION_PREFERENCE_KEYS = (
    "cashflow_default_verified",
    "cashflow_autofill_last_account",
    "investments_default_verified",
)


def normalize_transaction_preferences(value):
    source = value if isinstance(value, dict) else {}
    return {
        key: bool(source[key]) if key in source else False
        for key in TRANSACTION_PREFERENCE_KEYS
    }


class UserProfile(models.Model):
    DECIMAL_COMMA = ","
    DECIMAL_DOT = "."
    DECIMAL_SEPARATOR_CHOICES = [
        (DECIMAL_COMMA, "Comma"),
        (DECIMAL_DOT, "Dot"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    decimal_separator = models.CharField(
        max_length=1,
        choices=DECIMAL_SEPARATOR_CHOICES,
        default=DECIMAL_COMMA,
    )
    name = models.CharField(max_length=120, blank=True, default="")
    privacy_preferences = models.JSONField(default=dict, blank=True)
    enabled_features = models.JSONField(default=dict, blank=True)
    # Dashboard layout (ordered [{id, visible}]) and per-section view prefs
    # (monthly_overview year/range/mode, wealth chart metrics/range). Synced
    # server-side so the dashboard looks identical across the user's devices.
    dashboard_config = models.JSONField(default=list, blank=True)
    dashboard_preferences = models.JSONField(default=dict, blank=True)
    # Transaction-creation behaviour, synced server-side so it's consistent
    # across the user's devices. Known keys (all default False for backward
    # compatibility): cashflow_default_verified, cashflow_autofill_last_account,
    # investments_default_verified. See TRANSACTION_PREFERENCE_KEYS.
    transaction_preferences = models.JSONField(default=dict, blank=True)
    accounting_month_start_day = models.PositiveSmallIntegerField(default=1)

    def __str__(self):
        return f"Profile<{self.user_id}>"


class DataAccessGrant(models.Model):
    PERMISSION_CHOICES = [("read", "Read"), ("write", "Write"), ("full", "Full")]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="grants_given",
        on_delete=models.CASCADE,
    )
    grantee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="grants_received",
        on_delete=models.CASCADE,
        db_index=True,
    )
    permission = models.CharField(
        max_length=10, choices=PERMISSION_CHOICES, default="read"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("owner", "grantee")

    def __str__(self):
        return f"{self.owner} → {self.grantee} ({self.permission})"


class DemoSeedState(models.Model):
    """Persistenza leggera per il seed del demo condiviso."""

    key = models.CharField(max_length=32, unique=True)
    last_seeded_month = models.CharField(max_length=7, blank=True, default="")
    seed_version = models.CharField(max_length=16, blank=True, default="")
    last_seeded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Demo Seed State"
        verbose_name_plural = "Demo Seed States"

    def __str__(self):
        return f"DemoSeedState<{self.key}:{self.last_seeded_month}:{self.seed_version}>"

    @classmethod
    def get_singleton(cls, key: str = "shared-demo"):
        obj, _ = cls.objects.get_or_create(key=key)
        return obj


class WebAuthnCredential(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="webauthn_credentials",
    )
    credential_id = models.BinaryField(unique=True)
    public_key = models.BinaryField()
    sign_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"WebAuthnCredential<user={self.user_id}>"


class WebAuthnChallenge(models.Model):
    REGISTER = "register"
    AUTHENTICATE = "authenticate"

    challenge = models.BinaryField()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="webauthn_challenges",
    )
    purpose = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user", "purpose"])]

    def __str__(self):
        return f"WebAuthnChallenge<user={self.user_id}, purpose={self.purpose}>"
