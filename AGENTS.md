# Repository Guidelines

## Project Structure & Module Organization

The Django project configuration and shared security code live in `fininzen/`. Domain apps are split across `expenses/`, `portfolio/`, and `splitting/`; keep models, serializers, services, views, migrations, commands, and tests within the owning app. The frontend is under `web/`: routes are in `web/src/app/`, reusable UI in `web/src/components/`, feature screens in `web/src/views/`, browser tests in `web/e2e/`, and static assets in `web/public/`. Deployment definitions live in `deploy/`, automation in `scripts/` and `ci-tools/`, and operational documentation in `wiki/`.

## Build, Test, and Development Commands

- `just doctor && just install` checks prerequisites and installs Python and Node dependencies.
- `just start` runs Django on port 8000 and Next.js on port 3000; use `just backend` or `just web` for one side only.
- `just test-backend` runs pytest with coverage; `just test-e2e` runs Playwright when Django is available. `just test` runs both.
- `just lint` runs Ruff, Prettier checks, ESLint, and TypeScript checking. `just format` applies Ruff and Prettier formatting.
- `just makemigrations` and `just migrate` create and apply schema changes.
- `just schema` regenerates `openapi.json`; then run `npm run generate:api --prefix web` when the API contract changes.

## Coding Style & Naming Conventions

Honor `.editorconfig` and let Ruff/Prettier determine final formatting. Python modules, functions, and variables use `snake_case`; classes use `PascalCase`. React components use `PascalCase.tsx`, hooks begin with `use`, and utility modules use descriptive camelCase names. TypeScript is strict: avoid `any`, use type-only imports where applicable, and prefer the `@/` path alias. Do not hand-edit generated `openapi.json` or `web/src/api/schema.d.ts`.

## Testing Guidelines

Place backend tests in `<app>/tests/test_*.py`; pytest-django reuses the test database and enforces at least 75% coverage through `just test-backend`. Add focused regression tests for API, tenant isolation, migrations, and security behavior. Name Playwright files `*.spec.ts`; start Django before `just test-e2e`.

## Commit & Pull Request Guidelines

Use Conventional Commits such as `fix(portfolio): handle missing historical price` or `feat(web): add allocation filter`. Keep commits scoped and include migrations or regenerated contracts with the code that requires them. Pull/merge requests should explain behavior and risk, link the issue, list commands run, and include screenshots for UI changes. Ensure lint, backend tests, frontend build, E2E tests, and API-contract checks pass before merging.

## Security & Configuration

Never commit secrets, production `.env` files, databases, or exports containing financial data. Use environment variables and the documented Docker examples; review authentication, authorization, and tenant ownership on every new endpoint.
