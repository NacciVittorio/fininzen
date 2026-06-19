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
if "finnet.nacci.eu" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("finnet.nacci.eu")
# Always allow loopback so local health checks (scripts/deploy.sh) and
# systemd probes don't get rejected as DisallowedHost (which returns 400
# and would make the deploy health check think the worker is broken).
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
    "corsheaders",  # permette al frontend React (porta 3000) di chiamare il backend (porta 8000)
    "finnet",  # app principale: modelli condivisi (DataAccessGrant)
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
    {"NAME": "finnet.validators.StrongPasswordValidator"},
]

MIDDLEWARE = [
    # CorsMiddleware va messo il più in alto possibile, prima di CommonMiddleware
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "finnet.middleware.SecurityHeadersMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "finnet.middleware.ViewAsMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "finnet.urls"

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

WSGI_APPLICATION = "finnet.wsgi.application"

# Database: SQLite locale in sviluppo, percorso dedicato configurabile in produzione.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": Path(os.environ.get("DB_PATH", BASE_DIR / "db.sqlite3")),
        "OPTIONS": {"timeout": 30},
    }
}
# SQLite tuning: WAL gives concurrent readers + single writer, much better
# than the default rollback journal under E2E load. Applied via signal
# because sqlite3.connect() init_command only accepts a single statement.


def _apply_sqlite_pragmas(sender, connection, **kwargs):
    if connection.vendor != "sqlite":
        return
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")
        cursor.execute("PRAGMA foreign_keys=ON;")


connection_created.connect(_apply_sqlite_pragmas)

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        "finnet.permissions.IsNotDemoUser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "login": "20/minute",
        "register": "10/minute",
        "search_ticker": "30/minute",
        "view_as_attempt": "30/minute",
        "grant": "20/minute",
        "webauthn": "20/minute",
        "account": "10/minute",
        "reset": "5/minute",
    },
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
WEBAUTHN_RP_NAME = os.environ.get("WEBAUTHN_RP_NAME", "Finnet")
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
        "https://finnet.nacci.eu",
    ]
CORS_ALLOW_ALL_ORIGINS = False

_csrf_origins = os.environ.get("CSRF_TRUSTED_ORIGINS", "").strip()
_extra_csrf = (
    [o.strip() for o in _csrf_origins.split(",") if o.strip()] if _csrf_origins else []
)
CSRF_TRUSTED_ORIGINS = ["https://finnet.nacci.eu"] + _extra_csrf

LANGUAGE_CODE = "it-it"
TIME_ZONE = "Europe/Rome"
USE_I18N = True
USE_TZ = True

if not DEBUG:
    SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SECURE_SSL_REDIRECT", "1") == "1"
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "31536000"))
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
            "class": "finnet.settings._DatetimeRotatingFileHandler",
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
        "finnet": {
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
        logging.getLogger("finnet").warning(
            "SENTRY_DSN is set but sentry-sdk is not installed; error tracking disabled."
        )
