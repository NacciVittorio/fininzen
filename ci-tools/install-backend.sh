#!/usr/bin/env bash
# Install Python dependencies. Requires git for the api-contract check;
# install it here so every backend job has it available.
set -euo pipefail

if command -v apt-get > /dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq git
fi

python -m pip install --upgrade pip
pip install -r requirements.txt
