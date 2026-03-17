#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

WORK_ROOT="${WORK_ROOT:-./.deploy/know-ragflow}"
MANIFEST_PATH="${MANIFEST_PATH:-${WORK_ROOT}/install.manifest}"
REMOVE_WORK_ROOT="${REMOVE_WORK_ROOT:-1}"
ALLOW_REMOVE_REUSED_STACK="${ALLOW_REMOVE_REUSED_STACK:-0}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/uninstall_full_ragflow_stack.sh

Behavior:
  1. Stops the frontend dev server started by install.sh, if present.
  2. If the install created a fresh Docker Compose stack, it runs docker compose down -v.
  3. If the install reused an existing local RAGFlow stack, it leaves that shared backend running by default.
  4. Removes generated deployment artifacts under ./.deploy/know-ragflow unless REMOVE_WORK_ROOT=0.

Optional environment variables:
  WORK_ROOT=./.deploy/know-ragflow
  REMOVE_WORK_ROOT=1
  ALLOW_REMOVE_REUSED_STACK=0
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

safe_remove_tree() {
  local target="$1"
  [[ -n "${target}" ]] || die "Refusing to remove an empty path"
  [[ "${target}" != "/" ]] || die "Refusing to remove /"
  [[ "${target}" != "." ]] || die "Refusing to remove current directory"
  if [[ -e "${target}" ]]; then
    rm -rf "${target}"
  fi
}

stop_pid_if_running() {
  local pid_file="$1"
  if [[ ! -f "${pid_file}" ]]; then
    return
  fi

  local pid
  pid="$(cat "${pid_file}")"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    log "Stopping frontend dev server PID ${pid}"
    kill "${pid}" || true
    sleep 1
    kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" || true
  fi
  rm -f "${pid_file}"
}

load_manifest() {
  if [[ ! -f "${MANIFEST_PATH}" ]]; then
    warn "Manifest not found at ${MANIFEST_PATH}; falling back to WORK_ROOT only cleanup"
    return
  fi

  # shellcheck disable=SC1090
  source "${MANIFEST_PATH}"
}

compose_down_if_needed() {
  if [[ "${REUSED_EXISTING_STACK:-1}" == "1" && "${ALLOW_REMOVE_REUSED_STACK}" != "1" ]]; then
    log "This install reused an existing local RAGFlow stack; shared Docker services will be left running"
    return
  fi

  if [[ -z "${DOCKER_DIR:-}" || ! -d "${DOCKER_DIR}" ]]; then
    warn "Docker runtime directory not found, skipping docker compose down"
    return
  fi

  if ! command_exists docker; then
    warn "Docker is unavailable, skipping docker compose down"
    return
  fi

  log "Stopping Docker Compose project ${COMPOSE_PROJECT_NAME:-know-ragflow}"
  (
    cd "${DOCKER_DIR}"
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-know-ragflow}" docker compose -f docker-compose.yml down -v --remove-orphans || true
  )
}

main() {
  load_manifest
  stop_pid_if_running "${FRONTEND_PID_PATH:-${WORK_ROOT}/frontend-dev.pid}"
  compose_down_if_needed

  if [[ "${REMOVE_WORK_ROOT}" == "1" ]]; then
    log "Removing deployment artifacts under ${WORK_ROOT}"
    safe_remove_tree "${WORK_ROOT}"
  else
    log "Keeping deployment artifacts under ${WORK_ROOT}"
  fi

  log "Uninstall finished"
}

main "$@"
