#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROJECT_ROOT="."
FRONTEND_DIR="${FRONTEND_DIR:-./frontend}"
WORK_ROOT="${WORK_ROOT:-./.deploy/know-ragflow}"
UPSTREAM_DIR="${UPSTREAM_DIR:-${WORK_ROOT}/upstream}"
RUNTIME_DIR="${RUNTIME_DIR:-${WORK_ROOT}/runtime}"
DOCKER_DIR="${DOCKER_DIR:-${RUNTIME_DIR}/docker}"
LOG_DIR="${LOG_DIR:-${WORK_ROOT}/logs}"
ENV_OUTPUT_PATH="${ENV_OUTPUT_PATH:-${WORK_ROOT}/frontend.generated.env}"
FRONTEND_PID_PATH="${FRONTEND_PID_PATH:-${WORK_ROOT}/frontend-dev.pid}"
MANIFEST_PATH="${MANIFEST_PATH:-${WORK_ROOT}/install.manifest}"
RAGFLOW_VERSION="${RAGFLOW_VERSION:-v0.24.0}"
RAGFLOW_REPO="${RAGFLOW_REPO:-https://github.com/infiniflow/ragflow.git}"
RAGFLOW_IMAGE="${RAGFLOW_IMAGE:-infiniflow/ragflow:${RAGFLOW_VERSION}}"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.0.39}"
REDIS_IMAGE="${REDIS_IMAGE:-valkey/valkey:8}"
INFINITY_IMAGE="${INFINITY_IMAGE:-infiniflow/infinity:v0.7.0-dev2}"
MINIO_IMAGE="${MINIO_IMAGE:-quay.io/minio/minio:RELEASE.2025-06-13T11-33-47Z}"
DOCKER_CE_REPO_URL="${DOCKER_CE_REPO_URL:-https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo}"
DOCKER_REGISTRY_MIRRORS="${DOCKER_REGISTRY_MIRRORS:-https://docker.m.daocloud.io,https://docker.1ms.run}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-know-ragflow}"
RAGFLOW_DEVICE="${RAGFLOW_DEVICE:-cpu}"
RAGFLOW_DOC_ENGINE="${RAGFLOW_DOC_ENGINE:-elasticsearch}"
TIME_ZONE="${TIME_ZONE:-Asia/Shanghai}"
FRONTEND_ACTION="${FRONTEND_ACTION:-dev}"
REUSE_EXISTING_RAGFLOW="${REUSE_EXISTING_RAGFLOW:-1}"
AUTO_INSTALL_DEPS="${AUTO_INSTALL_DEPS:-1}"
AUTO_REGISTER_USER="${AUTO_REGISTER_USER:-1}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
RAGFLOW_AUTO_USER_EMAIL="${RAGFLOW_AUTO_USER_EMAIL:-}"
RAGFLOW_AUTO_USER_PASSWORD="${RAGFLOW_AUTO_USER_PASSWORD:-}"
RAGFLOW_AUTO_USER_NICKNAME="${RAGFLOW_AUTO_USER_NICKNAME:-Know Admin}"
TEI_MODEL="${TEI_MODEL:-}"
COMPOSE_MEM_LIMIT="${COMPOSE_MEM_LIMIT:-}"
HOST_WEB_PORT="${HOST_WEB_PORT:-80}"
HOST_HTTPS_PORT="${HOST_HTTPS_PORT:-443}"
HOST_API_PORT="${HOST_API_PORT:-9380}"
HOST_ADMIN_PORT="${HOST_ADMIN_PORT:-9381}"
HOST_MCP_PORT="${HOST_MCP_PORT:-9382}"
HOST_ES_PORT="${HOST_ES_PORT:-1200}"
HOST_MYSQL_PORT="${HOST_MYSQL_PORT:-5455}"
HOST_REDIS_PORT="${HOST_REDIS_PORT:-6379}"
HOST_MINIO_PORT="${HOST_MINIO_PORT:-9000}"
HOST_MINIO_CONSOLE_PORT="${HOST_MINIO_CONSOLE_PORT:-9001}"
HOST_FRONTEND_PORT="${HOST_FRONTEND_PORT:-5173}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/install_full_ragflow_stack.sh

Environment overrides:
  RAGFLOW_VERSION=v0.24.0
  COMPOSE_PROJECT_NAME=know-ragflow
  WORK_ROOT=./.deploy/know-ragflow
  FRONTEND_ACTION=dev|build|skip
  RAGFLOW_IMAGE=infiniflow/ragflow:v0.24.0
  MYSQL_IMAGE=mysql:8.0.39
  REDIS_IMAGE=valkey/valkey:8
  INFINITY_IMAGE=infiniflow/infinity:v0.7.0-dev2
  MINIO_IMAGE=quay.io/minio/minio:RELEASE.2025-06-13T11-33-47Z
  REUSE_EXISTING_RAGFLOW=1
  AUTO_REGISTER_USER=1
  RAGFLOW_AUTO_USER_EMAIL=admin@example.com
  RAGFLOW_AUTO_USER_PASSWORD='StrongPassword'
  RAGFLOW_AUTO_USER_NICKNAME='Know Admin'
  HOST_WEB_PORT=80
  HOST_API_PORT=9380
  HOST_FRONTEND_PORT=5173

Behavior:
  1. Auto-installs required host dependencies when missing.
  2. Clones the official RAGFlow repo at the requested tag.
  3. Copies the official docker runtime into WORK_ROOT/runtime/docker.
  4. Reuses an already running local RAGFlow stack when possible.
  5. Otherwise starts a fresh Docker Compose stack, auto-remapping busy ports.
  6. Waits for RAGFlow to become reachable.
  7. Installs frontend dependencies.
  8. Optionally creates/verifies an auto-login user.
  9. Writes a generated frontend env file and optionally starts Vite dev server.
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

run_as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    die "This step needs root privileges but sudo is unavailable: $*"
  fi
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

detect_pkg_manager() {
  if command_exists apt-get; then
    printf 'apt'
  elif command_exists dnf; then
    printf 'dnf'
  elif command_exists yum; then
    printf 'yum'
  elif command_exists brew; then
    printf 'brew'
  else
    printf 'unknown'
  fi
}

PKG_MANAGER="$(detect_pkg_manager)"

install_basic_packages() {
  local missing=()
  local binary
  for binary in git curl openssl ss; do
    if ! command_exists "${binary}"; then
      missing+=("${binary}")
    fi
  done

  if [[ "${#missing[@]}" -eq 0 ]]; then
    return
  fi

  if [[ "${AUTO_INSTALL_DEPS}" != "1" ]]; then
    die "Missing required host commands: ${missing[*]}"
  fi

  log "Installing base host packages: ${missing[*]}"
  case "${PKG_MANAGER}" in
    apt)
      run_as_root apt-get update
      run_as_root apt-get install -y curl git openssl iproute2 ca-certificates gnupg
      ;;
    dnf)
      run_as_root dnf install -y curl git openssl iproute ca-certificates
      ;;
    yum)
      run_as_root yum install -y curl git openssl iproute ca-certificates
      ;;
    brew)
      brew install curl git openssl
      ;;
    *)
      die "Unsupported package manager. Install manually: ${missing[*]}"
      ;;
  esac
}

install_docker_if_needed() {
  if command_exists docker && docker compose version >/dev/null 2>&1; then
    return
  fi

  if [[ "${AUTO_INSTALL_DEPS}" != "1" ]]; then
    die "Docker or Docker Compose plugin is missing"
  fi

  case "${PKG_MANAGER}" in
    dnf|yum)
      log "Installing Docker CE from the official yum repository"
      run_as_root "${PKG_MANAGER}" install -y dnf-plugins-core yum-utils device-mapper-persistent-data lvm2 curl ca-certificates || true
      run_as_root mkdir -p /etc/yum.repos.d
      run_as_root curl -fsSL "${DOCKER_CE_REPO_URL}" -o /tmp/docker-ce.repo
      run_as_root mv /tmp/docker-ce.repo /etc/yum.repos.d/docker-ce.repo
      run_as_root sed -i 's#https://download.docker.com/linux/centos#https://mirrors.aliyun.com/docker-ce/linux/centos#g' /etc/yum.repos.d/docker-ce.repo
      run_as_root "${PKG_MANAGER}" makecache
      run_as_root "${PKG_MANAGER}" install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    *)
      log "Installing Docker using the official convenience script"
      curl -fsSL https://get.docker.com | run_as_root sh
      ;;
  esac
}

ensure_docker_running() {
  install_docker_if_needed
  configure_docker_registry_mirrors

  if docker info >/dev/null 2>&1; then
    return
  fi

  log "Docker daemon is not running, attempting to start it"
  if command_exists systemctl; then
    run_as_root systemctl enable --now docker
  fi

  sleep 3
  docker info >/dev/null 2>&1 || die "Docker daemon is unavailable"
}

configure_docker_registry_mirrors() {
  local daemon_dir="/etc/docker"
  local daemon_file="${daemon_dir}/daemon.json"
  local mirror_json='['
  local item
  local first='1'

  IFS=',' read -r -a docker_mirror_items <<< "${DOCKER_REGISTRY_MIRRORS}"
  for item in "${docker_mirror_items[@]}"; do
    item="${item#"${item%%[![:space:]]*}"}"
    item="${item%"${item##*[![:space:]]}"}"
    [[ -n "${item}" ]] || continue
    if [[ "${first}" == '1' ]]; then
      first='0'
    else
      mirror_json+=','
    fi
    mirror_json+="\"${item}\""
  done
  mirror_json+=']'

  run_as_root mkdir -p "${daemon_dir}"
  printf '{\n  "registry-mirrors": %s\n}\n' "${mirror_json}" | run_as_root tee "${daemon_file}" >/dev/null

  if command_exists systemctl; then
    run_as_root systemctl daemon-reload || true
    run_as_root systemctl restart docker || true
  fi
}

install_node_if_needed() {
  if command_exists node && command_exists npm; then
    return
  fi

  if [[ "${AUTO_INSTALL_DEPS}" != "1" ]]; then
    die "Node.js and npm are required"
  fi

  log "Installing Node.js 20 LTS"
  case "${PKG_MANAGER}" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_20.x | run_as_root bash
      run_as_root apt-get install -y nodejs
      ;;
    dnf)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | run_as_root bash
      run_as_root dnf install -y nodejs
      ;;
    yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | run_as_root bash
      run_as_root yum install -y nodejs
      ;;
    brew)
      brew install node@20
      ;;
    *)
      die "Unsupported package manager for Node.js installation"
      ;;
  esac
}

ensure_vm_max_map_count() {
  if ! command_exists sysctl; then
    warn "sysctl is unavailable; skipping vm.max_map_count check"
    return
  fi

  local current
  current="$(sysctl -n vm.max_map_count 2>/dev/null || printf '0')"
  if [[ "${current}" =~ ^[0-9]+$ ]] && (( current >= 262144 )); then
    return
  fi

  log "Raising vm.max_map_count to 262144 for Elasticsearch"
  run_as_root sysctl -w vm.max_map_count=262144
  if [[ -w /etc/sysctl.conf ]]; then
    if grep -q '^vm.max_map_count=' /etc/sysctl.conf 2>/dev/null; then
      run_as_root sed -i 's/^vm\.max_map_count=.*/vm.max_map_count=262144/' /etc/sysctl.conf
    else
      printf 'vm.max_map_count=262144\n' | run_as_root tee -a /etc/sysctl.conf >/dev/null
    fi
  fi
}

ensure_runtime_dirs() {
  mkdir -p "${WORK_ROOT}" "${RUNTIME_DIR}" "${LOG_DIR}"
}

clone_or_update_ragflow() {
  if [[ -d "${UPSTREAM_DIR}/.git" ]]; then
    log "Refreshing existing upstream RAGFlow checkout"
    git -C "${UPSTREAM_DIR}" fetch --tags --force origin
  else
    log "Cloning official RAGFlow ${RAGFLOW_VERSION}"
    git clone --branch "${RAGFLOW_VERSION}" --depth 1 "${RAGFLOW_REPO}" "${UPSTREAM_DIR}"
  fi

  git -C "${UPSTREAM_DIR}" checkout "${RAGFLOW_VERSION}" >/dev/null 2>&1
}

prepare_runtime_files() {
  log "Preparing runtime docker files in ${DOCKER_DIR}"
  rm -rf "${DOCKER_DIR}"
  mkdir -p "${RUNTIME_DIR}"
  cp -a "${UPSTREAM_DIR}/docker" "${DOCKER_DIR}"
}

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

rewrite_runtime_image_refs() {
  local compose_file="${DOCKER_DIR}/docker-compose-base.yml"
  local infinity_image mysql_image minio_image redis_image

  [[ -f "${compose_file}" ]] || return

  infinity_image="$(escape_sed_replacement "${INFINITY_IMAGE}")"
  mysql_image="$(escape_sed_replacement "${MYSQL_IMAGE}")"
  minio_image="$(escape_sed_replacement "${MINIO_IMAGE}")"
  redis_image="$(escape_sed_replacement "${REDIS_IMAGE}")"

  sed -i \
    -e "s|image: infiniflow/infinity:v0.7.0-dev2|image: ${infinity_image}|" \
    -e "s|image: mysql:8.0.39|image: ${mysql_image}|" \
    -e "s|image: quay.io/minio/minio:RELEASE.2025-06-13T11-33-47Z|image: ${minio_image}|" \
    -e "s|image: valkey/valkey:8|image: ${redis_image}|" \
    "${compose_file}"
}

port_in_use() {
  local port="$1"
  ss -ltn "sport = :${port}" 2>/dev/null | tail -n +2 | grep -q .
}

next_free_port() {
  local port="$1"
  while port_in_use "${port}"; do
    port=$((port + 1))
  done
  printf '%s' "${port}"
}

probe_ragflow_target() {
  local web_port="$1"
  local api_port="$2"
  local web_code api_code
  web_code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${web_port}/" || true)"
  api_code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${api_port}/v1/system/status" || true)"
  [[ "${web_code}" == "200" && ( "${api_code}" == "200" || "${api_code}" == "401" ) ]]
}

choose_ports() {
  if [[ "${REUSE_EXISTING_RAGFLOW}" == "1" ]] && probe_ragflow_target "${HOST_WEB_PORT}" "${HOST_API_PORT}"; then
    REUSED_EXISTING_STACK="1"
    log "Detected an already running local RAGFlow stack on ports ${HOST_WEB_PORT}/${HOST_API_PORT}; reusing it"
    return
  fi

  REUSED_EXISTING_STACK="0"
  HOST_WEB_PORT="$(next_free_port "${HOST_WEB_PORT}")"
  HOST_HTTPS_PORT="$(next_free_port "${HOST_HTTPS_PORT}")"
  HOST_API_PORT="$(next_free_port "${HOST_API_PORT}")"
  HOST_ADMIN_PORT="$(next_free_port "${HOST_ADMIN_PORT}")"
  HOST_MCP_PORT="$(next_free_port "${HOST_MCP_PORT}")"
  HOST_ES_PORT="$(next_free_port "${HOST_ES_PORT}")"
  HOST_MYSQL_PORT="$(next_free_port "${HOST_MYSQL_PORT}")"
  HOST_REDIS_PORT="$(next_free_port "${HOST_REDIS_PORT}")"
  HOST_MINIO_PORT="$(next_free_port "${HOST_MINIO_PORT}")"
  HOST_MINIO_CONSOLE_PORT="$(next_free_port "${HOST_MINIO_CONSOLE_PORT}")"
  HOST_FRONTEND_PORT="$(next_free_port "${HOST_FRONTEND_PORT}")"
}

replace_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -q "^${key}=" "${file}"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

random_secret() {
  openssl rand -hex 16
}

prepare_docker_env() {
  local env_file="${DOCKER_DIR}/.env"
  local elastic_password mysql_password minio_password redis_password opensearch_password

  elastic_password="$(random_secret)"
  mysql_password="$(random_secret)"
  minio_password="$(random_secret)"
  redis_password="$(random_secret)"
  opensearch_password="Aa1!$(random_secret)"

  replace_env_var "${env_file}" DOC_ENGINE "${RAGFLOW_DOC_ENGINE}"
  replace_env_var "${env_file}" DEVICE "${RAGFLOW_DEVICE}"
  replace_env_var "${env_file}" COMPOSE_PROFILES "${RAGFLOW_DOC_ENGINE},${RAGFLOW_DEVICE}"
  replace_env_var "${env_file}" TZ "${TIME_ZONE}"
  replace_env_var "${env_file}" RAGFLOW_IMAGE "${RAGFLOW_IMAGE}"
  if [[ -n "${COMPOSE_MEM_LIMIT}" ]]; then
    replace_env_var "${env_file}" MEM_LIMIT "${COMPOSE_MEM_LIMIT}"
  fi
  replace_env_var "${env_file}" ES_PORT "${HOST_ES_PORT}"
  replace_env_var "${env_file}" EXPOSE_MYSQL_PORT "${HOST_MYSQL_PORT}"
  replace_env_var "${env_file}" REDIS_PORT "${HOST_REDIS_PORT}"
  replace_env_var "${env_file}" MINIO_PORT "${HOST_MINIO_PORT}"
  replace_env_var "${env_file}" MINIO_CONSOLE_PORT "${HOST_MINIO_CONSOLE_PORT}"
  replace_env_var "${env_file}" SVR_WEB_HTTP_PORT "${HOST_WEB_PORT}"
  replace_env_var "${env_file}" SVR_WEB_HTTPS_PORT "${HOST_HTTPS_PORT}"
  replace_env_var "${env_file}" SVR_HTTP_PORT "${HOST_API_PORT}"
  replace_env_var "${env_file}" ADMIN_SVR_HTTP_PORT "${HOST_ADMIN_PORT}"
  replace_env_var "${env_file}" SVR_MCP_PORT "${HOST_MCP_PORT}"
  replace_env_var "${env_file}" ELASTIC_PASSWORD "${elastic_password}"
  replace_env_var "${env_file}" MYSQL_PASSWORD "${mysql_password}"
  replace_env_var "${env_file}" MINIO_PASSWORD "${minio_password}"
  replace_env_var "${env_file}" REDIS_PASSWORD "${redis_password}"
  replace_env_var "${env_file}" OPENSEARCH_PASSWORD "${opensearch_password}"

  if [[ -n "${TEI_MODEL}" ]]; then
    replace_env_var "${env_file}" TEI_MODEL "${TEI_MODEL}"
  fi
}

compose() {
  (
    cd "${DOCKER_DIR}"
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" docker compose -f docker-compose.yml "$@"
  )
}

start_ragflow_stack() {
  if [[ "${REUSED_EXISTING_STACK}" == "1" ]]; then
    return
  fi

  log "Starting a fresh RAGFlow Docker stack with project ${COMPOSE_PROJECT_NAME}"
  compose up -d
}

wait_for_ragflow() {
  local timeout_seconds="${1:-900}"
  local elapsed=0

  log "Waiting for RAGFlow to become reachable on http://127.0.0.1:${HOST_WEB_PORT}"
  while (( elapsed < timeout_seconds )); do
    if probe_ragflow_target "${HOST_WEB_PORT}" "${HOST_API_PORT}"; then
      log "RAGFlow is reachable"
      return
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done

  if [[ "${REUSED_EXISTING_STACK}" != "1" ]]; then
    compose ps || true
    compose logs --tail=120 || true
  fi
  die "Timed out waiting for RAGFlow"
}

load_existing_frontend_credentials() {
  local env_file="${FRONTEND_DIR}/.env.local"
  if [[ ! -f "${env_file}" ]]; then
    return
  fi

  if [[ -z "${RAGFLOW_AUTO_USER_EMAIL}" ]]; then
    RAGFLOW_AUTO_USER_EMAIL="$(grep -E '^VITE_AUTO_LOGIN_EMAIL=' "${env_file}" | tail -n 1 | cut -d= -f2- || true)"
  fi
  if [[ -z "${RAGFLOW_AUTO_USER_PASSWORD}" ]]; then
    RAGFLOW_AUTO_USER_PASSWORD="$(grep -E '^VITE_AUTO_LOGIN_PASSWORD=' "${env_file}" | tail -n 1 | cut -d= -f2- || true)"
    RAGFLOW_AUTO_USER_PASSWORD="${RAGFLOW_AUTO_USER_PASSWORD%\"}"
    RAGFLOW_AUTO_USER_PASSWORD="${RAGFLOW_AUTO_USER_PASSWORD#\"}"
  fi
}

ensure_frontend_dependencies() {
  if [[ ! -d "${FRONTEND_DIR}" ]]; then
    warn "Frontend directory not found at ${FRONTEND_DIR}; skipping frontend setup"
    FRONTEND_ACTION="skip"
    return
  fi

  install_node_if_needed
  if [[ -f "${FRONTEND_DIR}/package-lock.json" ]]; then
    log "Installing frontend dependencies with npm ci"
    (cd "${FRONTEND_DIR}" && npm ci)
  else
    log "Installing frontend dependencies with npm install"
    (cd "${FRONTEND_DIR}" && npm install)
  fi
}

bootstrap_or_verify_user() {
  if [[ "${AUTO_REGISTER_USER}" != "1" ]]; then
    warn "AUTO_REGISTER_USER=0, skipping auto-login user bootstrap"
    return
  fi

  load_existing_frontend_credentials

  if [[ -z "${RAGFLOW_AUTO_USER_EMAIL}" ]]; then
    RAGFLOW_AUTO_USER_EMAIL="know-admin@local.test"
  fi

  if [[ -z "${RAGFLOW_AUTO_USER_PASSWORD}" ]]; then
    RAGFLOW_AUTO_USER_PASSWORD="Know#$(openssl rand -hex 8)"
  fi

  log "Ensuring RAGFlow user ${RAGFLOW_AUTO_USER_EMAIL} is available"
  node "${FRONTEND_DIR}/scripts/ragflow-user-bootstrap.mjs" \
    --base-url "http://127.0.0.1:${HOST_API_PORT}" \
    --email "${RAGFLOW_AUTO_USER_EMAIL}" \
    --nickname "${RAGFLOW_AUTO_USER_NICKNAME}" \
    --password "${RAGFLOW_AUTO_USER_PASSWORD}" \
    > "${WORK_ROOT}/user-bootstrap.json"
}

write_frontend_env() {
  local api_base_escaped email_escaped password_escaped proxy_escaped frontend_port_escaped
  printf -v api_base_escaped '%q' '/api'
  printf -v email_escaped '%q' "${RAGFLOW_AUTO_USER_EMAIL}"
  printf -v password_escaped '%q' "${RAGFLOW_AUTO_USER_PASSWORD}"
  printf -v proxy_escaped '%q' "http://127.0.0.1:${HOST_API_PORT}"
  printf -v frontend_port_escaped '%q' "${HOST_FRONTEND_PORT}"
  cat > "${ENV_OUTPUT_PATH}" <<EOF
VITE_RAGFLOW_API_BASE=${api_base_escaped}
VITE_AUTO_LOGIN_EMAIL=${email_escaped}
VITE_AUTO_LOGIN_PASSWORD=${password_escaped}
RAGFLOW_PROXY_TARGET=${proxy_escaped}
HOST_FRONTEND_PORT=${frontend_port_escaped}
EOF
}

frontend_pid_alive() {
  if [[ ! -f "${FRONTEND_PID_PATH}" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "${FRONTEND_PID_PATH}")"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

run_frontend_with_env() {
  local mode="$1"
  (
    set -a
    # shellcheck disable=SC1090
    source "${ENV_OUTPUT_PATH}"
    set +a
    if [[ "${mode}" == "build" ]]; then
      npm --prefix "${FRONTEND_DIR}" run build
    else
      if command_exists setsid; then
        nohup setsid bash -lc "cd \"${FRONTEND_DIR}\" && exec npm run dev -- --host \"${FRONTEND_HOST}\" --port \"${HOST_FRONTEND_PORT}\"" \
          < /dev/null > "${LOG_DIR}/frontend-dev.log" 2>&1 &
      else
        nohup bash -lc "cd \"${FRONTEND_DIR}\" && exec npm run dev -- --host \"${FRONTEND_HOST}\" --port \"${HOST_FRONTEND_PORT}\"" \
          < /dev/null > "${LOG_DIR}/frontend-dev.log" 2>&1 &
      fi
      echo $! > "${FRONTEND_PID_PATH}"
    fi
  )
}

wait_for_frontend_dev() {
  local timeout_seconds="${1:-30}"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    if curl -s -o /dev/null -w '%{http_code}' "http://${FRONTEND_HOST}:${HOST_FRONTEND_PORT}" | grep -q '^200$'; then
      return
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  warn "Frontend dev server did not become reachable within ${timeout_seconds}s"
  if [[ -f "${LOG_DIR}/frontend-dev.log" ]]; then
    warn "Frontend log tail:"
    tail -n 40 "${LOG_DIR}/frontend-dev.log" >&2 || true
  fi
  die "Frontend dev server failed to stay up"
}

start_or_build_frontend() {
  case "${FRONTEND_ACTION}" in
    skip)
      log "Skipping frontend startup"
      ;;
    build)
      log "Building frontend bundle"
      run_frontend_with_env build
      ;;
    dev)
      if frontend_pid_alive; then
        warn "Frontend dev server already running with PID $(cat "${FRONTEND_PID_PATH}"), leaving it in place"
      else
        HOST_FRONTEND_PORT="$(next_free_port "${HOST_FRONTEND_PORT}")"
        log "Starting frontend dev server on http://${FRONTEND_HOST}:${HOST_FRONTEND_PORT}"
        run_frontend_with_env dev
        wait_for_frontend_dev
      fi
      ;;
    *)
      die "Unsupported FRONTEND_ACTION=${FRONTEND_ACTION}"
      ;;
  esac
}

print_summary() {
  cat <<EOF

Deployment summary
  RAGFlow source: ${UPSTREAM_DIR}
  Docker runtime: ${DOCKER_DIR}
  Compose project: ${COMPOSE_PROJECT_NAME}
  Web UI: http://127.0.0.1:${HOST_WEB_PORT}
  API: http://127.0.0.1:${HOST_API_PORT}
  Admin API: http://127.0.0.1:${HOST_ADMIN_PORT}
  Frontend env file: ${ENV_OUTPUT_PATH}
  Frontend action: ${FRONTEND_ACTION}
EOF

  if [[ "${REUSED_EXISTING_STACK}" == "1" ]]; then
    cat <<EOF
  Docker mode: reused existing local RAGFlow stack
EOF
  else
    cat <<EOF
  Docker mode: started a fresh compose stack
EOF
  fi

  if [[ "${FRONTEND_ACTION}" == "dev" ]]; then
    cat <<EOF
  Frontend dev URL: http://${FRONTEND_HOST}:${HOST_FRONTEND_PORT}
  Frontend dev log: ${LOG_DIR}/frontend-dev.log
EOF
  fi

  if [[ -n "${RAGFLOW_AUTO_USER_EMAIL}" ]]; then
    cat <<EOF
  Auto-login user: ${RAGFLOW_AUTO_USER_EMAIL}
  Bootstrap result: ${WORK_ROOT}/user-bootstrap.json
EOF
  fi

  cat <<EOF

Useful commands
EOF

  if [[ "${REUSED_EXISTING_STACK}" != "1" ]]; then
    cat <<EOF
  Compose status: (cd ${DOCKER_DIR} && COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME} docker compose ps)
  Compose logs:   (cd ${DOCKER_DIR} && COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME} docker compose logs -f ragflow-${RAGFLOW_DEVICE})
EOF
  else
    cat <<'EOF'
  Existing stack status: docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
EOF
  fi
}

write_manifest() {
  mkdir -p "${WORK_ROOT}"
  cat > "${MANIFEST_PATH}" <<EOF
PROJECT_ROOT=.
WORK_ROOT=${WORK_ROOT}
UPSTREAM_DIR=${UPSTREAM_DIR}
RUNTIME_DIR=${RUNTIME_DIR}
DOCKER_DIR=${DOCKER_DIR}
LOG_DIR=${LOG_DIR}
ENV_OUTPUT_PATH=${ENV_OUTPUT_PATH}
FRONTEND_PID_PATH=${FRONTEND_PID_PATH}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
RAGFLOW_DEVICE=${RAGFLOW_DEVICE}
FRONTEND_ACTION=${FRONTEND_ACTION}
FRONTEND_HOST=${FRONTEND_HOST}
HOST_FRONTEND_PORT=${HOST_FRONTEND_PORT}
HOST_WEB_PORT=${HOST_WEB_PORT}
HOST_API_PORT=${HOST_API_PORT}
HOST_ADMIN_PORT=${HOST_ADMIN_PORT}
HOST_MCP_PORT=${HOST_MCP_PORT}
REUSED_EXISTING_STACK=${REUSED_EXISTING_STACK}
RAGFLOW_AUTO_USER_EMAIL=${RAGFLOW_AUTO_USER_EMAIL}
EOF
}

main() {
  install_basic_packages
  ensure_docker_running
  ensure_vm_max_map_count
  ensure_runtime_dirs
  choose_ports
  clone_or_update_ragflow
  prepare_runtime_files
  rewrite_runtime_image_refs
  if [[ "${REUSED_EXISTING_STACK}" != "1" ]]; then
    prepare_docker_env
    start_ragflow_stack
  fi
  wait_for_ragflow
  ensure_frontend_dependencies
  bootstrap_or_verify_user
  write_frontend_env
  start_or_build_frontend
  write_manifest
  print_summary
}

main "$@"
