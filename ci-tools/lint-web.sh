#!/usr/bin/env bash
set -euo pipefail

echo "==> prettier + eslint + tsc"
npm run lint --prefix web
