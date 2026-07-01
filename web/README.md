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

| Variable               | Web build            | Mobile build        |
| ---------------------- | -------------------- | ------------------- |
| `NEXT_PUBLIC_API_BASE` | optional (fallback `/fininzen/api`) | **required**, absolute URL |

## Scripts

```bash
npm run dev            # local dev server
npm run build          # web build (relative /fininzen/api by default)
npm run build:mobile   # Capacitor build; reads NEXT_PUBLIC_API_BASE from .env.local
npm run ios:sync       # build:mobile + cap sync ios (no run — for Xcode)
npm run ios:run        # build:mobile + cap sync + run on iOS
npm run test:e2e       # Playwright end-to-end tests
```

### Mobile / iOS

The native WebView loads over `capacitor://` or `file://`, so the API must be an
**absolute, cross-origin** URL reachable from the device/simulator on your LAN.
Set it in `web/.env.local`:

```
NEXT_PUBLIC_API_BASE=http://<YOUR_LAN_IP>/fininzen/api
```

Find your LAN IP with `ipconfig getifaddr en0` (macOS). In production this is the
HTTPS domain instead (e.g. `https://example.com/fininzen/api`).
