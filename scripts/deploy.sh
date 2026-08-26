#!/usr/bin/env bash
set -euo pipefail

# Deploy della produzione Docker.
# Uso (come root sul server): /opt/fininzen/scripts/deploy.sh [branch]
#
# Il checkout e Docker restano dell'utente di deploy. Lo script aggiorna il
# checkout alla revisione remota, verifica Compose, crea un backup PostgreSQL,
# ricostruisce i servizi applicativi attivi e li riavvia. Se qualcosa fallisce
# dopo l'aggiornamento, ripristina il commit precedente e ricrea i container.
# Il database non viene riportato indietro automaticamente: le migrazioni dati
# devono essere ripristinate da un backup con una procedura separata.

BRANCH="${1:-main}"
DEPLOY_USER="${FININZEN_DEPLOY_USER:-dockerapp}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${FININZEN_ENV_FILE:-${REPO_ROOT}/deploy/docker/production/.env}"
COMPOSE_FILE="${FININZEN_COMPOSE_FILE:-${REPO_ROOT}/deploy/docker/production/compose.yml}"
PROJECT_NAME="${FININZEN_COMPOSE_PROJECT_NAME:-}"
PROJECT_NAME_CONFIGURED=0
if [[ -n "${PROJECT_NAME}" ]]; then
    PROJECT_NAME_CONFIGURED=1
fi
PUBLIC_URL="${FININZEN_PUBLIC_URL:-}"
API_PREFIX="${FININZEN_API_PREFIX:-/api}"
RUNNING_SERVICES=()
PREVIOUS_REV=""
DEPLOY_STARTED=0

if (( EUID != 0 )); then
    echo "deploy: eseguire questo script come root (usa sudo)." >&2
    exit 77
fi

if [[ -z "${BRANCH}" || "${BRANCH}" == -* || "${BRANCH}" == *".."* || "${BRANCH}" == *"@{"* ]] \
    || [[ "${BRANCH}" =~ [^A-Za-z0-9._/-] ]] \
    || ! git check-ref-format --branch "${BRANCH}" >/dev/null 2>&1; then
    echo "deploy: nome branch non valido: ${BRANCH}" >&2
    exit 64
fi

for command_name in docker git id runuser sort; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
        echo "deploy: comando mancante: ${command_name}" >&2
        exit 1
    fi
done

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
    echo "deploy: utente di deploy non trovato: ${DEPLOY_USER}" >&2
    exit 1
fi
if [[ ! -d "${REPO_ROOT}/.git" ]]; then
    echo "deploy: ${REPO_ROOT} non è un checkout Git." >&2
    exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
    echo "deploy: file ambiente non trovato: ${ENV_FILE}" >&2
    exit 1
fi
if [[ ! -f "${COMPOSE_FILE}" ]]; then
    echo "deploy: file Compose non trovato: ${COMPOSE_FILE}" >&2
    exit 1
fi

trim_whitespace() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "${value}"
}

if [[ -z "${PROJECT_NAME}" ]]; then
    while IFS='=' read -r env_key env_value; do
        env_key="$(trim_whitespace "${env_key}")"
        if [[ "${env_key}" == "COMPOSE_PROJECT_NAME" ]]; then
            PROJECT_NAME="$(trim_whitespace "${env_value}")"
            PROJECT_NAME="${PROJECT_NAME#\"}"
            PROJECT_NAME="${PROJECT_NAME%\"}"
            PROJECT_NAME_CONFIGURED=1
        fi
    done < "${ENV_FILE}"
fi
PROJECT_NAME="${PROJECT_NAME:-production}"
if [[ ! "${PROJECT_NAME}" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
    echo "deploy: nome progetto Compose non valido: ${PROJECT_NAME}" >&2
    exit 64
fi

COMPOSE=(
    docker compose
    -p "${PROJECT_NAME}"
    --project-directory "${REPO_ROOT}"
    --env-file "${ENV_FILE}"
    -f "${COMPOSE_FILE}"
)

run_as_deploy_user() {
    # runuser mantiene la directory di lavoro del chiamante solo in alcuni
    # ambienti; entrare esplicitamente nel checkout evita errori quando lo
    # script viene lanciato da /root.
    runuser -u "${DEPLOY_USER}" -- bash -c '
        cd -- "$1"
        shift
        exec "$@"
    ' bash "${REPO_ROOT}" "$@"
}

if ! run_as_deploy_user git -C "${REPO_ROOT}" diff --quiet \
    || ! run_as_deploy_user git -C "${REPO_ROOT}" diff --cached --quiet; then
    echo "deploy: il checkout contiene modifiche locali tracciate; deploy annullato." >&2
    exit 1
fi

run_as_deploy_user "${COMPOSE[@]}" config --quiet

collect_running_services() {
    RUNNING_SERVICES=()
    while IFS= read -r service_name; do
        [[ -n "${service_name}" ]] && RUNNING_SERVICES+=("${service_name}")
    done < <(run_as_deploy_user "${COMPOSE[@]}" ps --services --filter status=running)
}

collect_running_services

# Older installations may have been started with an explicit project name
# (for example `production-test`) before COMPOSE_PROJECT_NAME was added to the
# environment file. Discover that project from Compose labels before failing.
if (( ${#RUNNING_SERVICES[@]} == 0 && !PROJECT_NAME_CONFIGURED )); then
    while IFS= read -r discovered_project; do
        [[ -z "${discovered_project}" || "${discovered_project}" == "${PROJECT_NAME}" ]] && continue
        PROJECT_NAME="${discovered_project}"
        COMPOSE=(
            docker compose
            -p "${PROJECT_NAME}"
            --project-directory "${REPO_ROOT}"
            --env-file "${ENV_FILE}"
            -f "${COMPOSE_FILE}"
        )
        collect_running_services
        if (( ${#RUNNING_SERVICES[@]} > 0 )); then
            echo "deploy: rilevato il progetto Compose attivo ${PROJECT_NAME}."
            break
        fi
    done < <(
        {
            run_as_deploy_user docker ps \
                --filter "label=com.docker.compose.project.working_dir=${REPO_ROOT}" \
                --format '{{.Label "com.docker.compose.project"}}'
            run_as_deploy_user docker ps \
                --filter "label=com.docker.compose.project.config_files=${COMPOSE_FILE}" \
                --format '{{.Label "com.docker.compose.project"}}'
        } | sort -u
    )
    if [[ ! " ${RUNNING_SERVICES[*]} " =~ [[:space:]]postgres[[:space:]] ]]; then
        RUNNING_SERVICES=()
    fi
fi

if (( ${#RUNNING_SERVICES[@]} == 0 )); then
    echo "deploy: nessun servizio Docker è attualmente in esecuzione; avvia prima lo stack." >&2
    exit 1
fi
if [[ ! " ${RUNNING_SERVICES[*]} " =~ [[:space:]]postgres[[:space:]] ]]; then
    echo "deploy: il servizio postgres non è in esecuzione; backup e deploy annullati." >&2
    exit 1
fi

PREVIOUS_REV="$(run_as_deploy_user git -C "${REPO_ROOT}" rev-parse HEAD)"
echo "deploy: revisione precedente = ${PREVIOUS_REV}"

run_as_deploy_user git -C "${REPO_ROOT}" fetch origin "${BRANCH}"
CANDIDATE_REV="$(run_as_deploy_user git -C "${REPO_ROOT}" rev-parse FETCH_HEAD)"
echo "deploy: revisione candidata = ${CANDIDATE_REV}"

if [[ "${PREVIOUS_REV}" == "${CANDIDATE_REV}" ]]; then
    echo "deploy: la revisione ${CANDIDATE_REV} è già installata."
    exit 0
fi

rollback() {
    local exit_code=$?
    trap - ERR

    if (( DEPLOY_STARTED )); then
        echo "deploy: errore rilevato, ripristino della revisione ${PREVIOUS_REV}." >&2
        run_as_deploy_user git -C "${REPO_ROOT}" reset --hard "${PREVIOUS_REV}" || true
        run_as_deploy_user "${COMPOSE[@]}" config --quiet || true
        run_as_deploy_user "${COMPOSE[@]}" up -d --build "${RUNNING_SERVICES[@]}" || true
        echo "deploy: rollback del checkout e dei container completato." >&2
        echo "deploy: il database non è stato ripristinato automaticamente." >&2
    fi

    exit "${exit_code}"
}
trap rollback ERR

# Il backup viene eseguito prima di cambiare il checkout e prima di avviare le
# migrazioni dell'entrypoint backend.
run_as_deploy_user env \
    ENV_FILE="${ENV_FILE}" \
    COMPOSE_FILE="${COMPOSE_FILE}" \
    COMPOSE_PROJECT_NAME="${PROJECT_NAME}" \
    "${REPO_ROOT}/scripts/backup_postgres.sh"

DEPLOY_STARTED=1
run_as_deploy_user git -C "${REPO_ROOT}" reset --hard "${CANDIDATE_REV}"
run_as_deploy_user git -C "${REPO_ROOT}" checkout -B "${BRANCH}" "${CANDIDATE_REV}"

run_as_deploy_user "${COMPOSE[@]}" config --quiet
run_as_deploy_user "${COMPOSE[@]}" up -d --build "${RUNNING_SERVICES[@]}"
run_as_deploy_user "${COMPOSE[@]}" ps

if [[ -n "${PUBLIC_URL}" ]]; then
    API_PREFIX="${API_PREFIX}" run_as_deploy_user \
        "${REPO_ROOT}/scripts/smoke_test.sh" "${PUBLIC_URL}" "${FININZEN_SMOKE_ATTEMPTS:-20}"
else
    echo "deploy: smoke test saltato (impostare FININZEN_PUBLIC_URL per abilitarlo)."
fi

trap - ERR
echo "deploy: completato con successo alla revisione ${CANDIDATE_REV}."
