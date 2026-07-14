#!/usr/bin/env bash
set -euo pipefail

echo "==> migrate"
python manage.py migrate --noinput
