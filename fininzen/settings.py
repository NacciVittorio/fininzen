"""
settings.py — Configurazione principale del progetto Django.

Usiamo Django invece di Flask/FastAPI perché:
- SQLite integrato: zero configurazione, è un semplice file .db locale
- Django Admin: pannello gratuito per gestire i dati senza toccare il frontend
- ORM potente: query Python invece di SQL raw
- Migrations: aggiornamenti automatici dello schema del database
- Se un giorno vogliamo passare a PostgreSQL, cambiamo solo DATABASE['ENGINE']
"""

import logging.handlers
import os
import sys
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlparse
from django.core.exceptions import ImproperlyConfigured
from django.db.backends.signals import connection_created

BASE_DIR = Path(__file__).resolve().parent.parent

# Directory per i log — creata automaticamente al primo avvio
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)


class _DatetimeRotatingFileHandler(logging.handlers.TimedRotatingFileHandler):
    """TimedRotatingFileHandler con naming django_YYYYMMDD.log invece di django.log.YYYYMMDD."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        import re

        self.suffix = "%Y%m%d"
        self.extMatch = re.compile(r"^\d{8}(\.\w+)?$", re.ASCII)

    def rotation_filename(self, default_name):
        suffix = default_name[len(self.baseFilename) + 1 :]
        p = Path(self.baseFilename)
        return str(p.parent / f"{p.stem}_{suffix}.log")


# SECRET_KEY: in dev usa il fallback, in produzione passa la variabile d'ambiente
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "dev-only-key-do-not-use-in-production",
)

# DEBUG must be explicitly enabled for local development. Pytest runs with the
# local profile unless a test explicitly overrides settings.
_is_pytest = "pytest" in str(Path(sys.argv[0]))
DEBUG = os.environ.get("DJANGO_DEBUG", "1" if _is_pytest else "0") == "1"

# ALLOWED_HOSTS: in dev "*", in produzione passare lista separata da virgole
_allowed = os.environ.get("DJANGO_ALLOWED_HOSTS", "*")
ALLOWED_HOSTS = [h.strip() for h in _allowed.split(",") if h.strip()]
if "fininzen.nacci.eu" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("fininzen.nacci.eu")
# Always allow loopback so local health checks (the container HEALTHCHECK
# curling 127.0.0.1) don't get rejected as DisallowedHost (which returns 400
# and would make the health check think the worker is broken).
for _loopback in ("127.0.0.1", "localhost"):
    if _loopback not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_loopback)

# Fail closed for server processes while keeping every manage.py maintenance
# command usable locally without production environment variables.
_is_management_cmd = (
    len(sys.argv) > 1
    and Path(sys.argv[0]).name == "manage.py"
    and sys.argv[1] != "runserver"
)
_is_management_cmd = _is_management_cmd or _is_pytest
if not _is_management_cmd and not DEBUG:
    if SECRET_KEY == "dev-only-key-do-not-use-in-production":
        raise ImproperlyConfigured(
            "SECURITY: DJANGO_SECRET_KEY non impostato — rifiuto di avviare in "
            "produzione (DEBUG=False) con la chiave di sviluppo. "
            "Imposta DJANGO_SECRET_KEY con almeno 50 caratteri random."
        )
    if "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured(
            "SECURITY: DJANGO_ALLOWED_HOSTS='*' in produzione (DEBUG=False). "
            "Imposta DJANGO_ALLOWED_HOSTS con il dominio (CSV)."
        )

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",  # Django REST Framework: standard per API REST con Django
    "rest_framework_simplejwt",  # JWT authentication
    "rest_framework_simplejwt.token_blacklist",  # revoca refresh token dopo rotation
    "drf_spectacular",  # OpenAPI schema generation -> typed frontend client
    "corsheaders",  # permette al frontend React (porta 3000) di chiamare il backend (porta 8000)
    "fininzen",  # app principale: modelli condivisi (DataAccessGrant)
    "expenses",  # nostra app per la gestione delle spese
    "portfolio",  # nostra app per il portafoglio investimenti
]

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    {"NAME": "fininzen.validators.StrongPasswordValidator"},
]

MIDDLEWARE = [
    # CorsMiddleware va messo il più in alto possibile, prima di CommonMiddleware
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "fininzen.middleware.SecurityHeadersMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "fininzen.middleware.ViewAsMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "fininzen.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "fininzen.wsgi.application"


# Database: Postgres in produzione (via DATABASE_URL o POSTGRES_*), SQLite come
# default per sviluppo/test. La produzione è bloccata sotto se non usa Postgres.
def _apply_pool(cfg):
    """Abilita il connection pool nativo di psycopg3 quando DB_POOL è impostato.

    Off di default e di proposito: con worker gunicorn *sync* (una connessione per
    worker alla volta) le connessioni persistenti (CONN_MAX_AGE) coprono già il caso
    comune, e un pool non dimensionato rischia di esaurire `max_connections` di
    Postgres — ogni processo worker possiede il proprio pool. Si abilita
    deliberatamente dopo il sizing: `max_size × n_worker` deve restare sotto il
    `max_connections` del server. Django richiede CONN_MAX_AGE=0 quando è il pool a
    gestire il ciclo di vita delle connessioni, quindi lo forziamo qui.

    Tuning via env: DB_POOL_MIN / DB_POOL_MAX / DB_POOL_TIMEOUT.
    """
    if os.environ.get("DB_POOL", "").strip().lower() not in ("1", "true", "yes", "on"):
        return cfg
    pool_cfg = {}
    if os.environ.get("DB_POOL_MIN"):
        pool_cfg["min_size"] = int(os.environ["DB_POOL_MIN"])
    if os.environ.get("DB_POOL_MAX"):
        pool_cfg["max_size"] = int(os.environ["DB_POOL_MAX"])
    if os.environ.get("DB_POOL_TIMEOUT"):
        pool_cfg["timeout"] = float(os.environ["DB_POOL_TIMEOUT"])
    options = dict(cfg.get("OPTIONS") or {})
    options["pool"] = pool_cfg or True
    cfg["OPTIONS"] = options
    cfg["CONN_MAX_AGE"] = 0  # obbligatorio con il pool psycopg
    return cfg


def _parse_database_url(url):
    """Minimal postgres:// URL parser (no extra dependency)."""
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme not in ("postgres", "postgresql"):
        raise ImproperlyConfigured(
            f"DATABASE_URL: schema non supportato '{scheme}://' "
            "(usa postgres:// o postgresql://)."
        )
    if not parsed.path or parsed.path == "/":
        raise ImproperlyConfigured("DATABASE_URL deve includere il nome database.")
    cfg = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": unquote(parsed.hostname or ""),
        "PORT": str(parsed.port or ""),
        "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
    }
    options = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if options:
        cfg["OPTIONS"] = options
    return _apply_pool(cfg)


def _build_default_database():
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if db_url:
        return _parse_database_url(db_url)
    pg_host = os.environ.get("POSTGRES_HOST") or os.environ.get("PGHOST")
    pg_name = os.environ.get("POSTGRES_DB") or os.environ.get("PGDATABASE")
    if pg_host or pg_name:
        cfg = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": pg_name or "fininzen",
            "USER": os.environ.get("POSTGRES_USER") or os.environ.get("PGUSER", ""),
            "PASSWORD": (
                os.environ.get("POSTGRES_PASSWORD") or os.environ.get("PGPASSWORD", "")
            ),
            "HOST": pg_host or "localhost",
            "PORT": os.environ.get("POSTGRES_PORT") or os.environ.get("PGPORT", ""),
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
        }
        sslmode = os.environ.get("POSTGRES_SSLMODE") or os.environ.get("PGSSLMODE")
        if sslmode:
            cfg["OPTIONS"] = {"sslmode": sslmode}
        return _apply_pool(cfg)
    # Default: SQLite file (dev/test).
    return {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": Path(os.environ.get("DB_PATH", BASE_DIR / "db.sqlite3")),
        "OPTIONS": {"timeout": 30},
    }


DATABASES = {"default": _build_default_database()}
DEFAULT_DB_IS_POSTGRES = DATABASES["default"]["ENGINE"].endswith("postgresql")

# Field-level encryption keys (AES-256-GCM). Comma-separated base64 32-byte keys;
# the first is the primary (used to encrypt), any others are kept for decryption
# during key rotation. Empty in dev/test → encrypted fields store plaintext.
# Generate one with:
#   python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
_field_keys_raw = os.environ.get("FIELD_ENCRYPTION_KEYS", "").strip()
if not _field_keys_raw:
    _field_keys_raw = os.environ.get("FIELD_ENCRYPTION_KEY", "").strip()
FIELD_ENCRYPTION_KEYS = [k.strip() for k in _field_keys_raw.split(",") if k.strip()]

# Opt-in per far girare la produzione su SQLite (VPS con poca RAM/disco: SQLite in
# WAL è un solo file, nessun processo/RAM extra rispetto a Postgres). Va impostato
# esplicitamente in modo che un deploy non finisca su SQLite per errore.
_allow_sqlite_prod = os.environ.get("ALLOW_SQLITE_IN_PRODUCTION", "").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)

# Fail closed for the running server (not maintenance commands / tests): production
# must use Postgres (o SQLite con opt-in esplicito) e deve avere una chiave di
# cifratura, o rifiutiamo il boot.
if not _is_management_cmd and not DEBUG:
    if not DEFAULT_DB_IS_POSTGRES and not _allow_sqlite_prod:
        raise ImproperlyConfigured(
            "SECURITY: la produzione (DEBUG=False) richiede PostgreSQL. "
            "Imposta DATABASE_URL=postgres://... oppure le variabili POSTGRES_*. "
            "Per usare SQLite in produzione (VPS piccola) imposta esplicitamente "
            "ALLOW_SQLITE_IN_PRODUCTION=1."
        )
    if not FIELD_ENCRYPTION_KEYS:
        raise ImproperlyConfigured(
            "SECURITY: FIELD_ENCRYPTION_KEYS non impostato in produzione. "
            "I campi sensibili verrebbero salvati in chiaro. Genera una chiave a "
            "32 byte base64 e impostala prima di avviare."
        )

# SQLite tuning: WAL gives concurrent readers + single writer, much better
# than the default rollback journal under E2E load. Applied via signal
# because sqlite3.connect() init_command only accepts a single statement.
# No-op on Postgres (the handler early-returns for non-sqlite vendors).


def _apply_sqlite_pragmas(sender, connection, **kwargs):
    if connection.vendor != "sqlite":
        return
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")
        cursor.execute("PRAGMA foreign_keys=ON;")


connection_created.connect(_apply_sqlite_pragmas)

# Auth/abuse throttle rates. These production-safe defaults are what pytest and
# the live app exercise. Setting E2E_RELAX_THROTTLES=1 lifts the per-IP/per-user
# auth buckets to a high ceiling so the Playwright suite — which logs in fresh
# on every test from a single loopback IP — does not trip the 20/min login
# limiter mid-run. The flag is opt-in: unset (prod, CI, pytest) the shipped
# limits apply unchanged. NEVER enable it on a public deployment.
_THROTTLE_RATES = {
    "login": "20/minute",
    "register": "10/minute",
    "search_ticker": "30/minute",
    "view_as_attempt": "30/minute",
    "grant": "20/minute",
    "webauthn": "20/minute",
    "account": "10/minute",
    "reset": "5/minute",
}
if os.environ.get("E2E_RELAX_THROTTLES"):
    _THROTTLE_RATES = {scope: "100000/minute" for scope in _THROTTLE_RATES}

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        "fininzen.permissions.IsNotDemoUser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # LOW-11: bound every list endpoint that uses the standard ListModelMixin so a
    # pathological query can't stream an unbounded result set. PageNumberPagination
    # wraps responses as {count, next, previous, results}. The web client pages
    # through `next` (see fetchAllPagesWithFetcher) so no list is silently truncated.
    # Custom list() actions that build their own Response (AllocationTargetViewSet,
    # FireViewSet) and APIView feeds (CashFlowFeedView, TransactionsFeedView — already
    # bounded, see CRIT-07) are unaffected: pagination only applies to views that call
    # paginate_queryset().
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 100,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": _THROTTLE_RATES,
}

# Unified application version: the root VERSION file is the single source of
# truth (bumped by `just release` / commitizen). Backend reads it at runtime so
# the OpenAPI contract and /api/health/ always report the deployed version; the
# web app inlines the same file at build time. See wiki/VERSIONING.md.
APP_VERSION = (BASE_DIR / "VERSION").read_text().strip()

# drf-spectacular: single source of truth for the API contract. The committed
# OpenAPI schema (just schema) is consumed by the frontend codegen to produce
# typed API clients, so backend changes surface as frontend build breaks.
SPECTACULAR_SETTINGS = {
    "TITLE": "Fininzen API",
    "DESCRIPTION": "Wealth-management API (expenses + portfolio).",
    "VERSION": APP_VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api",
    "COMPONENT_SPLIT_REQUEST": True,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# WebAuthn (Face ID / Touch ID). RP_ID must match the app's hostname exactly.
# WEBAUTHN_ORIGIN is the full origin (scheme + host[:port]) that the browser sends.
WEBAUTHN_RP_ID = os.environ.get("WEBAUTHN_RP_ID", "localhost")
WEBAUTHN_RP_NAME = os.environ.get("WEBAUTHN_RP_NAME", "Fininzen")
WEBAUTHN_ORIGIN = os.environ.get("WEBAUTHN_ORIGIN", "http://localhost:5173")
# Challenge TTL in seconds (5 minutes)
WEBAUTHN_CHALLENGE_TTL = 300

# DRF ScopedRateThrottle uses Django's cache. The default LocMemCache is
# process-local — with 2+ gunicorn workers each worker keeps its own bucket,
# so the effective limit is N×configured. Setting REDIS_URL switches to a
# shared backend so throttling is enforced across workers. Requires
# `pip install redis` on the prod host.
if os.environ.get("REDIS_URL"):
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": os.environ["REDIS_URL"],
        }
    }

# CORS: in dev whitelist del solo origin Vite; in produzione passare CORS_ALLOWED_ORIGINS="https://x,https://y"
_cors_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
if _cors_origins:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(",") if o.strip()]
else:
    # In dev, allow any LAN IP on port 5173 (access from other devices on the network)
    CORS_ALLOWED_ORIGIN_REGEXES = [r"^http://192\.168\.\d+\.\d+:5173$"]
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://fininzen.nacci.eu",
    ]
CORS_ALLOW_ALL_ORIGINS = False

_csrf_origins = os.environ.get("CSRF_TRUSTED_ORIGINS", "").strip()
_extra_csrf = (
    [o.strip() for o in _csrf_origins.split(",") if o.strip()] if _csrf_origins else []
)
CSRF_TRUSTED_ORIGINS = ["https://fininzen.nacci.eu"] + _extra_csrf

# Browser-visible path the httpOnly refresh cookie is scoped to. It must match
# the path the *frontend* calls, not the path Django's URLConf sees: the Next.js
# app calls `/fininzen/api/auth/*` (Caddy strips `/fininzen` before Django), so
# at cutover this is set to "/fininzen/api/auth/". The default keeps the legacy
# Vite SPA (served at "/api/...") working until the cutover.
REFRESH_COOKIE_PATH = os.environ.get("REFRESH_COOKIE_PATH", "/api/auth/")

LANGUAGE_CODE = "it-it"
TIME_ZONE = "Europe/Rome"
USE_I18N = True
USE_TZ = True

if not DEBUG:
    SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SECURE_SSL_REDIRECT", "1") == "1"
    # Cookie/transport hardening assumes the site is served over HTTPS. For a
    # trusted-LAN deploy served over plain HTTP (no TLS), set
    # DJANGO_SECURE_COOKIES=0 so the browser actually stores the auth cookies:
    # Secure-only cookies are silently dropped over http://, which breaks login
    # and silent token refresh even with username+password. Keep the default
    # (1) for any internet-facing deployment.
    _secure_cookies = os.environ.get("DJANGO_SECURE_COOKIES", "1") == "1"
    SESSION_COOKIE_SECURE = _secure_cookies
    CSRF_COOKIE_SECURE = _secure_cookies
    if _secure_cookies:
        SECURE_HSTS_SECONDS = int(
            os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "31536000")
        )
        SECURE_HSTS_INCLUDE_SUBDOMAINS = True
        SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{levelname}] {asctime} {name} ({module}:{lineno}): {message}",
            "style": "{",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
        "simple": {
            "format": "[{levelname}] {asctime} {name}: {message}",
            "style": "{",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    },
    "handlers": {
        "file": {
            "level": "DEBUG",
            "class": "fininzen.settings._DatetimeRotatingFileHandler",
            "filename": LOGS_DIR / "django.log",
            "when": "midnight",
            "interval": 1,
            "backupCount": 7,
            "formatter": "verbose",
            "encoding": "utf-8",
        },
        "console": {
            "level": "INFO",
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "portfolio": {
            "handlers": ["file", "console"],
            "level": "DEBUG",
            "propagate": False,
        },
        "expenses": {
            "handlers": ["file", "console"],
            "level": "DEBUG",
            "propagate": False,
        },
        "fininzen": {
            "handlers": ["file", "console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}


# ── Error tracking (HIGH-35) ─────────────────────────────────────────────────
# Opt-in Sentry: a no-op unless SENTRY_DSN is set, so dev/test and any deploy
# without the env var are unaffected. The sentry-sdk import is guarded so the
# app still boots if the package isn't installed. Set SENTRY_DSN (and optionally
# SENTRY_TRACES_SAMPLE_RATE / SENTRY_ENVIRONMENT) in the prod env to enable.
SENTRY_DSN = os.environ.get("SENTRY_DSN", "").strip()
if SENTRY_DSN and not _is_pytest:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[DjangoIntegration()],
            environment=os.environ.get(
                "SENTRY_ENVIRONMENT", "production" if not DEBUG else "development"
            ),
            traces_sample_rate=float(
                os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.0")
            ),
            # Don't ship PII (request bodies hold financial data). PII stays out
            # unless explicitly opted in — aligns with MED-34 logging hygiene.
            send_default_pii=False,
        )
    except ImportError:
        logging.getLogger("fininzen").warning(
            "SENTRY_DSN is set but sentry-sdk is not installed; error tracking disabled."
        )
