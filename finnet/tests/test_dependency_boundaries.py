"""Pin the blast radius of the heavy price-fetching dependencies.

yfinance (and its transitive web-scraping stack: bs4, curl_cffi, pandas, numpy)
is heavyweight and brittle. We deliberately confine every *direct* import of it
to the two price-provider modules so it cannot creep across the codebase. The
rest of the app must go through the persisted price data those modules write.

This is a static check (it greps source, it does not import anything), so it is
cheap and has no side effects. If you legitimately need the heavy stack in a new
module, add it to ALLOWED below — and think hard about whether you should.

NOTE: this pins the *import surface*, not request-path isolation. Today
``portfolio/prices.py`` is still imported by some views (lazy fetch on cache
miss), so yfinance is loaded in the web process. Moving all live fetching behind
the out-of-band refresh job is a separate, larger refactor (see
wiki/HEAVY_DEPS.md).
"""

import re
from pathlib import Path

import pytest

# App packages whose source we police (tests and migrations are exempt).
APP_PACKAGES = ("portfolio", "expenses", "finnet")

# The only modules allowed to import the heavy price-fetching stack directly.
ALLOWED = {
    Path("portfolio/prices.py"),
    Path("portfolio/price_providers.py"),
}

HEAVY_IMPORT = re.compile(
    r"^\s*(?:import|from)\s+(?:yfinance|bs4|curl_cffi|pandas|numpy|peewee)\b",
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _app_source_files():
    for package in APP_PACKAGES:
        for path in (REPO_ROOT / package).rglob("*.py"):
            parts = set(path.relative_to(REPO_ROOT).parts)
            if "tests" in parts or "migrations" in parts or "__pycache__" in parts:
                continue
            yield path


def _imports_heavy_stack(path: Path) -> bool:
    for line in path.read_text(encoding="utf-8").splitlines():
        if HEAVY_IMPORT.match(line):
            return True
    return False


def test_heavy_deps_confined_to_price_modules():
    offenders = {
        path.relative_to(REPO_ROOT)
        for path in _app_source_files()
        if _imports_heavy_stack(path)
    }
    unexpected = offenders - ALLOWED
    assert not unexpected, (
        "Heavy price-fetching deps (yfinance/bs4/curl_cffi/pandas/numpy/peewee) "
        f"leaked into modules outside the allowed set: {sorted(map(str, unexpected))}. "
        "Route through persisted price data instead, or update ALLOWED if this is "
        "a deliberate new price provider."
    )


@pytest.mark.parametrize("expected", sorted(ALLOWED, key=str))
def test_price_modules_still_present(expected):
    # Guard against ALLOWED drifting away from reality (e.g. a module renamed
    # but left in the allowlist), which would silently weaken the test above.
    assert (REPO_ROOT / expected).exists(), f"{expected} no longer exists"
