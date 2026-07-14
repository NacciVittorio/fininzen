#!/usr/bin/env bash
set -euo pipefail

echo "==> next build"
npm run build --prefix web
