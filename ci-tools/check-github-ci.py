#!/usr/bin/env python3
"""Wait for the mirrored GitHub Actions CI run for this SHA and fail on red."""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    import certifi
except ImportError:  # pragma: no cover - certifi is optional at runtime
    certifi = None


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise SystemExit(f"ERROR: {name} is required")
    return value


def _fetch_json(url: str) -> dict:
    request = Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "fininzen-gitlab-ci-gate",
        },
    )
    context = (
        ssl.create_default_context(cafile=certifi.where())
        if certifi is not None
        else ssl.create_default_context()
    )
    try:
        with urlopen(request, timeout=30, context=context) as response:
            return json.load(response)
    except ssl.SSLError as exc:
        if "certificate verify failed" not in str(exc):
            raise
        print(
            "==> Warning: GitHub API TLS verification failed; retrying without CA "
            "verification for this read-only gate.",
        )
        with urlopen(
            request,
            timeout=30,
            context=ssl._create_unverified_context(),
        ) as response:
            return json.load(response)


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    repo = _env("GITHUB_REPOSITORY", "NacciVittorio/fininzen")
    sha = _env("CI_COMMIT_SHA")
    workflow_path = os.environ.get("GITHUB_CI_WORKFLOW_PATH", ".github/workflows/ci.yml")
    workflow_name = os.environ.get("GITHUB_CI_WORKFLOW_NAME", "CI")
    timeout_seconds = int(os.environ.get("GITHUB_CI_GATE_TIMEOUT_SECONDS", "1200"))
    poll_seconds = int(os.environ.get("GITHUB_CI_GATE_POLL_SECONDS", "20"))
    deadline = time.monotonic() + timeout_seconds
    url = f"https://api.github.com/repos/{repo}/actions/runs?head_sha={sha}&per_page=100"

    print(f"==> Waiting for GitHub Actions CI on {sha}")
    while True:
        try:
            payload = _fetch_json(url)
        except (HTTPError, URLError, TimeoutError) as exc:
            if time.monotonic() >= deadline:
                print(f"ERROR: GitHub API error after waiting: {exc}", file=sys.stderr)
                return 1
            print(f"==> GitHub API temporarily unavailable, retrying: {exc}")
            time.sleep(poll_seconds)
            continue

        runs = [
            run
            for run in payload.get("workflow_runs", [])
            if run.get("path") == workflow_path and run.get("name") == workflow_name
        ]
        runs.sort(
            key=lambda run: (
                run.get("run_number") or 0,
                run.get("run_attempt") or 0,
                run.get("id") or 0,
            ),
            reverse=True,
        )

        if runs:
            run = runs[0]
            status = run.get("status") or "unknown"
            conclusion = run.get("conclusion") or "pending"
            html_url = run.get("html_url") or url
            print(
                f"==> GitHub CI {status} ({conclusion}) for {sha} at {html_url}",
            )
            if status == "completed":
                if conclusion == "success":
                    print("==> GitHub CI passed.")
                    return 0
                print(
                    f"ERROR: GitHub CI finished with conclusion={conclusion}",
                    file=sys.stderr,
                )
                return 1

        if time.monotonic() >= deadline:
            print(
                f"ERROR: Timed out after {timeout_seconds}s waiting for GitHub CI on {sha}",
                file=sys.stderr,
            )
            return 1

        print(f"==> { _iso_now() } still waiting...")
        time.sleep(poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
