# CHANGELOG

All notable changes to Fininzen are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/). This file is maintained
automatically by `just release` (commitizen) from Conventional Commits — see
[wiki/VERSIONING.md](wiki/VERSIONING.md).

## v0.0.1 (2026-06-24)

### Added

- Baseline beta release of the unified application version (backend Django + web
  Next.js share a single SemVer number sourced from the root `VERSION` file).
- App version is now surfaced in Settings → About and in the
  `GET /api/health/` response.
