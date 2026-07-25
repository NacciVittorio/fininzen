#!/usr/bin/env bash
# Install Python dependencies. Requires git for the api-contract check;
# install it here so every backend job has it available.
set -euo pipefail

# Only install git when it is actually missing. GitLab's python:3.12-slim image
# ships without it and runs as root, so the apt-get path is taken there. GitHub
# Actions runners already have git and run as an unprivileged user, where an
# unconditional `apt-get` would fail on permissions and kill the script.
if ! command -v git > /dev/null 2>&1 && command -v apt-get > /dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq git
fi

python -m pip install --upgrade pip
pip install -r requirements.txt
