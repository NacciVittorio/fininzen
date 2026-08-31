FROM python:3.14-slim@sha256:cae66f2ef0ec51a9891263eeee7f987dacf0a9879e8aa9353d5606e0530619a5

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin fininzen

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# /app/staticfiles must exist (and be owned by fininzen) before the volume
# mount at that path, so Docker seeds the named volume with these permissions
# on first run instead of leaving it root-owned and unwritable by fininzen.
RUN chmod +x deploy/docker/backend/entrypoint.sh \
    && mkdir -p /app/staticfiles \
    && chown -R fininzen:fininzen /app

USER fininzen

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/health/ || exit 1

# The entrypoint runs migrate + collectstatic, then execs the CMD below.
ENTRYPOINT ["/app/deploy/docker/backend/entrypoint.sh"]
CMD ["gunicorn", "fininzen.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--max-requests", "1000", "--max-requests-jitter", "100"]
