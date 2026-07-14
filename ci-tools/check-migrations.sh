#!/usr/bin/env bash
# Fail if any model change is missing a migration.
set -euo pipefail

echo "==> Migration drift check"
python manage.py makemigrations --check --dry-run
