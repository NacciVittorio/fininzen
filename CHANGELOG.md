# CHANGELOG

All notable changes to Fininzen are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/). This file is maintained
automatically by `just release` (commitizen) from Conventional Commits — see
[wiki/VERSIONING.md](wiki/VERSIONING.md).

## v0.11.0 (2026-07-25)

### Feat

- **web**: unify Cash Flow / Investments filters and refresh the add-transaction sheet

### Fix

- **web**: patch next and transitive deps for known CVEs

## v0.10.0 (2026-07-25)

### Feat

- **web**: amount calculator in CashFlow amount fields

## v0.9.2 (2026-07-24)

### Fix

- **web**: show full, scrollable account/category lists in CashFlow forms

## v0.9.1 (2026-07-24)

### Fix

- **web**: custom dropdown for CashFlow account/asset selects

## v0.9.0 (2026-07-24)

### Feat

- **web**: show all cashflow categories and lead summary with balance

## v0.8.1 (2026-07-24)

### Fix

- **web**: render native select popups in the app dark theme

## v0.8.0 (2026-07-23)

### Feat

- **web**: align Investments page to Cash Flow redesign

## v0.7.2 (2026-07-22)

### Fix

- **web**: stop iOS zoom on cashflow and investments search inputs

## v0.7.1 (2026-07-22)

### Fix

- **web**: stop iOS zoom on category search and un-clip filter category list

## v0.7.0 (2026-07-21)

### Feat

- **web**: searchable category picker in add-transaction & filters
- **web**: cash flow category card — parents by default + child deep-dive
- **web**: cashflow feed restyle — taller rows, daily net, pager in summary
- **web**: desktop structural redesign — centered container, multi-column layouts
- **web**: Quiet Ledger restyle — neutral palette, Inter, quiet type

### Fix

- **web**: align cash flow category rows without a drill-down chevron
- **web**: label accounting months by their dominant calendar month
- **web**: dashboard desktop — 4-up KPI row, adaptive half-card interiors
- **web**: close desktop-redesign coverage gaps from the full-app audit

## v0.6.3 (2026-07-16)

### Fix

- **web**: emit the iOS standalone signals from the document head

## v0.6.2 (2026-07-16)

### Fix

- **web**: keep PWA content clear of the notch and status bar

## v0.6.1 (2026-07-16)

### Fix

- add changelog close button and read the app version live

## v0.6.0 (2026-07-16)

### Feat

- **release-notes**: notifica le novità di ogni release al primo accesso

### Fix

- **pwa**: serve fresh API data instead of the previous fetch
- **ui**: portala il Popover su body così il menu non finisce fuori schermo
- **deploy**: use bare venv path outside devenv so bare-metal deploy works

### Refactor

- **auth**: migrate WebAuthn views to py-webauthn 3.0 API

## v0.5.0 (2026-07-14)

### Feat

- **deploy**: daily DB backup timer + fix off-site glob for SQLite

## v0.4.0 (2026-07-14)

### Feat

- **web**: add biometric (Face ID / Touch ID) sign-in to the login screen
- **web**: mount dormant UI shells (error boundary, app-lock, demo & tax modals)
- **web**: surface spending clearly and improve entry a11y

### Fix

- **web**: keep sign-off only in Settings, remove from header/sidebar

## v0.3.1 (2026-07-12)

### Fix

- **web**: align all month charts to the accounting month-start day
- **web**: disambiguate the aggregated "Other" bucket in the cashflow donut
- **web**: allow a cross-origin API base in the CSP connect-src
- **web**: guard CategorySelect against non-array categories
- **web**: theme tokens for description-suggestions dropdown
- **web**: unique pie-slice keys for cashflow category donut
- **web**: hide nav tabs for disabled features

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
