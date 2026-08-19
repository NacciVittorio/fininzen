# Next.js frontend (web/). Build context is the repo ROOT, because next.config.ts
# reads ../VERSION at build and run time (the single source of truth for the app
# version — see wiki/VERSIONING.md), so VERSION must sit one level above web/.
#
#   docker build -f deploy/docker/web/Dockerfile -t fininzen-web .

# ---- build stage ----
FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS builder
WORKDIR /app/web

# Install deps first for layer caching. npm ci installs devDependencies too,
# which `next build` and the TypeScript next.config.ts loader both need.
COPY web/package.json web/package-lock.json ./
RUN npm ci

# App sources + the repo-root VERSION file next.config.ts inlines.
COPY web/ ./
COPY VERSION /app/VERSION
ARG NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL
RUN npm run build

# ---- runtime stage ----
FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/web
RUN useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin fininzen

# `next start` re-loads next.config.ts at boot, which still reads /app/VERSION
# and needs node_modules present (incl. the typescript loader), so carry the
# whole built app over rather than a trimmed standalone bundle.
COPY --from=builder /app/web/package.json /app/web/package-lock.json ./
COPY --from=builder /app/web/node_modules ./node_modules
COPY --from=builder /app/web/.next ./.next
COPY --from=builder /app/web/public ./public
COPY --from=builder /app/web/next.config.ts ./next.config.ts
COPY --from=builder /app/VERSION /app/VERSION
RUN chown -R fininzen:fininzen /app

USER fininzen

EXPOSE 3000

# Bind all interfaces so the Caddy container can reach it over the compose network.
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
