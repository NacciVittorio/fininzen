# CHANGELOG

All notable changes to Fininzen are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/). This file is maintained
automatically by `just release` (commitizen) from Conventional Commits — see
[wiki/VERSIONING.md](wiki/VERSIONING.md).

## v0.3.0 (2026-07-06)

### Feat

- **pwa**: show an offline banner and disable write actions when offline
- **pwa**: offline read via persisted query cache + Serwist service worker
- **mobile**: add native status bar, keyboard, haptics and lifecycle plugins
- **mobile-nav**: replace top nav bar with responsive Sidebar/MobileBottomNav
- **mobile**: add native iOS Capacitor project (M3)
- **mobile**: Capacitor config + Keychain refresh-token backend
- **web**: static-export mobile build target + offline cache + body-auth wiring
- **auth**: body-based JWT refresh for native mobile clients

### Fix

- **mobile**: set viewport-fit=cover to activate safe-area insets
- **auth**: allow X-Client header in CORS preflight for mobile login

## v0.2.1 (2026-06-30)

### Fix

- **docker**: strip only /fininzen in Caddy so Django API routes resolve

## v0.2.0 (2026-06-30)

### Refactor

- **docker**: rename deploy/docker/stack/ → production/
- **docker**: rename prod/ → backend/ for the Django image

## v0.1.0 (2026-06-29)

### Feat

- **docker**: full containerized stack (Caddy + Next.js + Django + PG + Redis)
- **api**: global DRF pagination on list endpoints (LOW-11)
- **portfolio**: backfill EUR baseline via management command (MED-08)
- **web**: restore PWA assets dropped in the Vite→Next migration
- **expenses**: allow negative-amount expenses as refunds (LOW-07)
- **web**: chart empty states + memoized charts (MED-33, LOW-16)
- **web**: add nonce-based CSP to the Next.js SPA (HIGH-23)
- **api**: add sanitized client-error helper

### Fix

- **docker**: mount postgres volume at /var/lib/postgresql for PG18
- **api**: sanitize provider error message reaching price-history response

### Refactor

- **backend**: code-review quality batch (NEW-LOW-02, MED-16/17/21/23)
- **views**: route validation errors through safe helper

## v0.0.1 (2026-06-24)

### Added

- Baseline beta release of the unified application version (backend Django + web
  Next.js share a single SemVer number sourced from the root `VERSION` file).
- App version is now surfaced in Settings → About and in the
  `GET /api/health/` response.
