from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class RegisterRateThrottle(AnonRateThrottle):
    scope = "register"


class GrantRateThrottle(UserRateThrottle):
    # HIGH-02: the grant endpoints require authentication, and AnonRateThrottle
    # returns None (no throttle) for authenticated requests — so the previous
    # AnonRateThrottle base left email enumeration via POST /grants/ effectively
    # unlimited. UserRateThrottle keys on the user pk, actually capping how fast
    # one account can probe which emails are registered.
    scope = "grant"


class WebAuthnRateThrottle(AnonRateThrottle):
    """Throttle the unauthenticated WebAuthn auth endpoints (challenge/verify).

    Keyed by IP (AnonRateThrottle): on the authenticated register endpoints it
    no-ops, so it only guards the AllowAny brute-force surface.
    """

    scope = "webauthn"


class ResetRateThrottle(UserRateThrottle):
    """Throttle destructive reset endpoints per authenticated user."""

    scope = "reset"


class ViewAsAttemptRateThrottle(UserRateThrottle):
    scope = "view_as_attempt"


class MfaRateThrottle(AnonRateThrottle):
    """Throttle TOTP setup/enable/verify — verify in particular is a 6-digit
    brute-force surface and needs the same care as WebAuthnRateThrottle.
    Keyed by IP (AnonRateThrottle) so it also guards the AllowAny verify
    endpoint used mid-login, before a token exists.
    """

    scope = "mfa"
