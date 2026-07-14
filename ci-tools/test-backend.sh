#!/usr/bin/env bash
set -euo pipefail

echo "==> pytest"
pytest -c pytest.ini --cov-fail-under=75
