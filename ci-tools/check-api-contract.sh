#!/usr/bin/env bash
# Regenerate openapi.json and web/src/api/schema.d.ts, then fail if either
# differs from what is checked in. Run after install-backend + install-web.
set -euo pipefail

echo "==> Regenerate OpenAPI schema"
python manage.py spectacular --format openapi-json --file openapi.json

echo "==> Regenerate typed client"
npm run generate:api --prefix web

echo "==> Check for drift"
if ! git diff --exit-code openapi.json web/src/api/schema.d.ts; then
    echo ""
    echo "ERROR: openapi.json or schema.d.ts are out of date."
    echo "Run 'just schema && npm run generate:api --prefix web' locally and commit the result."
    exit 1
fi
