#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"
exec ./scripts/uninstall_full_ragflow_stack.sh "$@"
