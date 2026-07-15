#!/usr/bin/env bash
set -euo pipefail

echo "==> ruff check"
ruff check .

echo "==> ruff format --check"
ruff format --check .
