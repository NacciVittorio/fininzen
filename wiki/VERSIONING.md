# Versioning — Fininzen

This document describes how Fininzen is versioned: the scheme, the single source
of truth, how the number propagates to backend and frontend, and how a release is
cut.

## Scheme: Semantic Versioning

The app uses [SemVer](https://semver.org/) in the form **`Major.Minor.Patch`**
(e.g. `1.4.2`). A **single version** covers the whole application — the Django
backend and the Next.js web app are always released together under the same
number.

| Part    | When to increment                                                       |
| ------- | ----------------------------------------------------------------------- |
| `Major` | **Incompatible** changes (broken API, user-facing breaking change).     |
| `Minor` | New **backward-compatible** features.                                    |
| `Patch` | **Bug fixes** and backward-compatible corrections.                      |

### Beta (0.x) phase

The project currently ships in **beta**, starting at **`0.0.1`**. While the major
is `0` the public API is considered unstable, so `commitizen` is configured with
`major_version_zero = true`: during beta a breaking change bumps the **minor**
(`0.x.0`) instead of jumping to `1.0.0`.

| Commit while in 0.x          | Result          |
| ---------------------------- | --------------- |
| `fix:`                       | `0.0.1 → 0.0.2` |
| `feat:`                      | `0.0.1 → 0.1.0` |
| `feat!:` / `BREAKING CHANGE` | `0.0.1 → 0.1.0` |

When the app is ready for its first stable release, flip `major_version_zero` to
`false` in `.cz.toml` (or run `cz bump --increment MAJOR`) to cut `1.0.0`.

### Database note

The database does **not** share the app's SemVer number: Django versions the
schema through its **migration sequence** (`*/migrations/0001…`), which is its own
monotonic mechanism. Likewise `DEMO_SEED_VERSION` and `Asset.source_version` are
*data* versions, not app versions. When a release introduces migrations or schema
changes, note it in the CHANGELOG under that version (e.g. _"includes migration
`portfolio 0048`"_).

## Single source of truth

The **`VERSION`** file at the repo root holds the current number in plain text
(e.g. `0.0.1`). Everything derives from it:

```
VERSION ──┬── Backend  → fininzen/settings.py reads it at runtime (APP_VERSION):
          │              feeds SPECTACULAR VERSION (OpenAPI) and GET /api/health/.
          ├── Web       → web/next.config.ts inlines it at build time as
          │              NEXT_PUBLIC_APP_VERSION → shown in Settings → About.
          └── Tooling   → commitizen (.cz.toml) keeps VERSION, web/package.json
                          and CHANGELOG.md in sync on every bump.
```

Do not edit these numbers by hand: use `just release` (below).

## Where the version is visible

- **Settings → About** in the web app (the real value instead of the old `dev`).
- **`GET /api/health/`** → `{"status":"ok","database":"ok","version":"0.0.1"}`.
- **OpenAPI contract** (`frontend/openapi.json`, field `info.version`).
- **GitHub → Releases** and git tags `vX.Y.Z`.

## How to cut a release

Releases are driven by **Conventional Commits** (already used in this repo). The
tool is [commitizen](https://commitizen-tools.github.io/commitizen/), wrapped by
the `just release` recipe.

### Commit → increment mapping

| Commit type                                       | Increment (stable / beta) |
| ------------------------------------------------- | ------------------------- |
| `fix: …`                                          | Patch / Patch             |
| `feat: …`                                         | Minor / Minor             |
| `feat!: …` / `fix!: …` / `BREAKING CHANGE:` footer | Major / Minor (0.x)     |
| `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `style:`, `ci:` | no bump on their own |

### Procedure

1. Make sure you are on **`main`**, up to date, with a **clean working tree**.
2. Run:

   ```sh
   just release            # increment inferred automatically from the commits
   # or force it:
   just release patch      # likewise  minor  /  major
   ```

3. `just release` runs `cz bump`, which:
   - computes the next version from the commits since the last tag;
   - rewrites `VERSION` and `web/package.json`;
   - updates `CHANGELOG.md` with the new section;
   - creates the release commit and the `vX.Y.Z` tag;
   - finally runs `git push --follow-tags`.
4. Pushing the tag triggers the GitHub Action **`.github/workflows/release.yml`**,
   which creates the **GitHub Release** with notes extracted from `CHANGELOG.md`.

From then on the backend (at runtime) and the web app (on its next build/deploy)
report the new version, and the Release is visible on GitHub.

### What NOT to do by hand

- Don't edit the number in `VERSION`, `web/package.json` or `CHANGELOG.md`.
- Don't create tags manually: let `cz bump` do it.

## Files involved

| File                              | Role                                                |
| --------------------------------- | --------------------------------------------------- |
| `VERSION`                         | Single source of truth for the number.              |
| `.cz.toml`                        | Commitizen config (`version_files`, tag, beta flag).|
| `CHANGELOG.md`                    | History, generated/updated by commitizen.           |
| `fininzen/settings.py`            | `APP_VERSION` read from `VERSION` at runtime.        |
| `fininzen/views.py`               | `HealthView` exposes `version`.                     |
| `web/next.config.ts`              | Inlines `NEXT_PUBLIC_APP_VERSION` at build time.     |
| `justfile`                        | The `release` recipe.                               |
| `.github/workflows/release.yml`   | Publishes the GitHub Release on tag push.            |
