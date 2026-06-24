#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://fininzen.nacci.eu}"
ATTEMPTS="${2:-20}"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "${TMP_DIR}"' EXIT

BASE_URL="${BASE_URL%/}"

fail() {
    echo "smoke: $*" >&2
    exit 1
}

if [[ ! "$ATTEMPTS" =~ ^[0-9]+$ ]] || (( ATTEMPTS < 1 )); then
    fail "invalid attempts value: ${ATTEMPTS}"
fi

LAST_ERROR=""

record_failure() {
    LAST_ERROR="$*"
    return 1
}

request() {
    local path="$1"
    local label="$2"
    local headers="$TMP_DIR/headers"
    local body="$TMP_DIR/body"
    local status

    if ! status="$(curl --silent --show-error --location \
        --dump-header "$headers" \
        --output "$body" \
        --write-out "%{http_code}" \
        "${BASE_URL}${path}")"; then
        record_failure "${label} ${path} request failed"
        return 1
    fi
    if [[ "$status" != "200" ]]; then
        record_failure "${label} ${path} returned HTTP ${status}"
        return 1
    fi
}

request_status() {
    local path="$1"
    local label="$2"
    local expected="$3"
    local status

    if ! status="$(curl --silent --show-error --location \
        --output /dev/null \
        --write-out "%{http_code}" \
        "${BASE_URL}${path}")"; then
        record_failure "${label} ${path} request failed"
        return 1
    fi
    if [[ "$status" != "$expected" ]]; then
        record_failure "${label} ${path} returned HTTP ${status}, expected ${expected}"
        return 1
    fi
}

header_contains() {
    local pattern="$1"
    grep -Eiq "$pattern" "$TMP_DIR/headers"
}

run_check() {
    local html
    local asset
    local assets=()

    # /login is a real rendered Next.js page (/ is a 307 redirect to /dashboard).
    request "/login" "html" || return 1
    html="$(cat "$TMP_DIR/body")"

    # API still reachable through the Caddy /fininzen prefix, and the auth guard
    # rejects anonymous reads.
    request "/fininzen/api/health/" "backend health" || return 1
    request_status "/fininzen/api/auth/profile/" "auth guard" "401" || return 1

    while IFS= read -r asset; do
        assets+=("$asset")
    done < <(
        printf '%s' "$html" \
            | grep -Eo '(src|href)="[^"]+\.(js|css)(\?[^"]*)?"' \
            | sed -E 's/^(src|href)="([^"]+)"$/\2/' \
            | sort -u
    )
    if (( ${#assets[@]} == 0 )); then
        record_failure "html /login does not reference any JavaScript or CSS asset"
        return 1
    fi

    for asset in "${assets[@]}"; do
        if [[ "$asset" != /* ]]; then
            asset="/${asset}"
        fi
        request "$asset" "asset" || return 1
        # Next emits content-hashed bundles under /_next/static/* with a 1-year
        # immutable cache; assert it so a misconfigured proxy is caught.
        if [[ "$asset" == /_next/static/* ]] \
            && ! header_contains '^Cache-Control:.*immutable'; then
            record_failure "hashed asset ${asset} is missing Cache-Control: immutable"
            return 1
        fi
    done
}

for ((attempt = 1; attempt <= ATTEMPTS; attempt += 1)); do
    if run_check; then
        echo "smoke: pass ${attempt}/${ATTEMPTS}"
        echo "smoke: completed for ${BASE_URL}"
        exit 0
    fi

    echo "smoke: attempt ${attempt}/${ATTEMPTS} failed: ${LAST_ERROR}" >&2
    if (( attempt < ATTEMPTS )); then
        sleep 1
    fi
done

fail "failed after ${ATTEMPTS} attempts: ${LAST_ERROR:-unknown error}"
