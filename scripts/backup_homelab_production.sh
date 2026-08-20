#!/usr/bin/env bash
# Verified, age-encrypted recovery bundle for the homelab production-test stack.
set -euo pipefail

umask 077

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/deploy/docker/production/homelab.env}"
BASE_COMPOSE="${REPO_ROOT}/deploy/docker/production/compose.yml"
HOMELAB_COMPOSE="${REPO_ROOT}/deploy/docker/production/homelab.compose.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
    echo "backup_homelab_production: environment file not found: ${ENV_FILE}" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

for command_name in age docker find git mktemp mv sort tar; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
        echo "backup_homelab_production: missing command: ${command_name}" >&2
        exit 1
    fi
done

if [[ -z "${AGE_RECIPIENT:-}" ]]; then
    echo "backup_homelab_production: AGE_RECIPIENT is not configured" >&2
    exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-7}"
if [[ ! "${RETENTION_COUNT}" =~ ^[1-9][0-9]*$ ]]; then
    echo "backup_homelab_production: BACKUP_RETENTION_COUNT must be an integer greater than zero" >&2
    exit 1
fi

TIMESTAMP="$(date -u '+%Y-%m-%d_%H%M%S')"
TEMP_DIR="$(mktemp -d)"
BUNDLE="${TEMP_DIR}/fininzen-production-test-${TIMESTAMP}.tar.gz"
OUTPUT="${BACKUP_DIR}/fininzen-production-test-${TIMESTAMP}.tar.gz.age"
ENCRYPTED_TEMP=""
COMPOSE=(
    docker compose
    --env-file "${ENV_FILE}"
    -p fininzen-production-test
    -f "${BASE_COMPOSE}"
    -f "${HOMELAB_COMPOSE}"
)

cleanup() {
    rm -rf -- "${TEMP_DIR}"
    if [[ -n "${ENCRYPTED_TEMP}" ]]; then
        rm -f -- "${ENCRYPTED_TEMP}"
    fi
}
trap cleanup EXIT

mkdir -p "${BACKUP_DIR}"
ENCRYPTED_TEMP="$(
    mktemp "${BACKUP_DIR}/.fininzen-production-test-${TIMESTAMP}.age.XXXXXX"
)"

"${COMPOSE[@]}" exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' \
    > "${TEMP_DIR}/postgres.dump"

if [[ ! -s "${TEMP_DIR}/postgres.dump" ]]; then
    echo "backup_homelab_production: pg_dump produced an empty file" >&2
    exit 1
fi

"${COMPOSE[@]}" exec -T postgres pg_restore --list \
    < "${TEMP_DIR}/postgres.dump" >/dev/null

cp "${ENV_FILE}" "${TEMP_DIR}/homelab-production.env"
{
    echo "created_at_utc=${TIMESTAMP}"
    echo "project=fininzen-production-test"
    echo "git_commit=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
    echo "compose_images:"
    "${COMPOSE[@]}" config --images
} > "${TEMP_DIR}/manifest.txt"

tar -C "${TEMP_DIR}" -czf "${BUNDLE}" \
    postgres.dump homelab-production.env manifest.txt
tar -tzf "${BUNDLE}" >/dev/null
age --recipient "${AGE_RECIPIENT}" "${BUNDLE}" > "${ENCRYPTED_TEMP}"
if [[ ! -s "${ENCRYPTED_TEMP}" ]]; then
    echo "backup_homelab_production: age produced an empty encrypted file" >&2
    exit 1
fi
chmod 600 "${ENCRYPTED_TEMP}"
mv "${ENCRYPTED_TEMP}" "${OUTPUT}"
ENCRYPTED_TEMP=""

BACKUPS=()
while IFS= read -r backup; do
    BACKUPS+=("${backup}")
done < <(
    find "${BACKUP_DIR}" -maxdepth 1 -type f \
        -name 'fininzen-production-test-*.tar.gz.age' -print \
        | LC_ALL=C sort -r
)
for ((index = RETENTION_COUNT; index < ${#BACKUPS[@]}; index += 1)); do
    rm -f -- "${BACKUPS[index]}"
done

echo "backup_homelab_production: encrypted verified bundle written to ${OUTPUT}"
