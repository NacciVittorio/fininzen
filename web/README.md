# web/ — fininzen frontend (Next.js App Router, SSR)

## Environment

Copy the template and fill in the values for your machine:

```bash
cp web/.env.example web/.env.local
```

`.env.local` is git-ignored; `.env.example` is the committed reference listing
every variable the build understands. Next.js loads `.env.local` automatically.

> `NEXT_PUBLIC_*` variables are inlined into the client bundle at build time —
> they are **public** and must never contain secrets.

| Variable               | Web build            |
| ---------------------- | --------------------- |
| `NEXT_PUBLIC_API_BASE` | optional (fallback `/fininzen/api`) |

## Scripts

```bash
npm run dev            # local dev server
npm run build          # web build (relative /fininzen/api by default)
npm run test:e2e       # Playwright end-to-end tests
```
