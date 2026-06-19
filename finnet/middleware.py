class ViewAsMiddleware:
    """Initialise view-as state.

    Resolution happens inside DRF after authentication. Django middleware runs
    before JWTAuthentication, so resolving grants here silently ignored JWT
    users and made session and token authentication behave differently.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.view_as_user = None
        request.view_as_permission = None
        return self.get_response(request)


class SecurityHeadersMiddleware:
    # HIGH-03: the strict policy for the API (JSON) and any app-served HTML.
    # Inline styles are NOT allowed — script-style XSS would otherwise be able to
    # exfiltrate via injected CSS. The SPA carries its own (font-aware) CSP via
    # the build-injected <meta> (HIGH-23); this header covers Django responses.
    _STRICT_CSP = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "font-src 'self'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "base-uri 'self'; "
        "object-src 'none'; "
        "frame-ancestors 'none';"
    )
    # The Django admin (mounted only under DEBUG, never in production — see
    # finnet/urls.py) ships inline styles/scripts in its widgets. Relax just for
    # those paths so local admin keeps working without weakening the API/SPA.
    _ADMIN_CSP = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "font-src 'self'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-Frame-Options"] = "DENY"
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "strict-origin-when-cross-origin"
        path = request.path
        is_admin = path.startswith("/admin/") or path.startswith("/static/admin/")
        response["Content-Security-Policy"] = (
            self._ADMIN_CSP if is_admin else self._STRICT_CSP
        )
        return response
