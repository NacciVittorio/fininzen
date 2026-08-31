# Frontend web — Next.js

Il frontend usa Next.js App Router, rendering server-side, React e TypeScript
strict. Richiede Node.js 24 o successivo.

## Ambiente

```bash
cp web/.env.example web/.env.local
```

`.env.local` è ignorato da Git. Le variabili `NEXT_PUBLIC_*` vengono incluse
nel bundle del browser e non devono mai contenere segreti.

| Variabile | Uso |
|---|---|
| `NEXT_PUBLIC_API_BASE` | Opzionale; il fallback è `/fininzen/api`. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Destinatario pubblico del link di contatto nella pagina About. |

## Comandi

```bash
npm run dev --prefix web
npm run build --prefix web
npm run lint --prefix web
npm run test:e2e --prefix web
npm run generate:api --prefix web
```

L'ultimo comando rigenera `web/src/api/schema.d.ts` da `openapi.json`; non
modificare manualmente il file generato.
