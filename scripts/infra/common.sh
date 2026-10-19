#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
STACK_NAME="${STACK_NAME:-naporta}"
export STACK_NAME
[[ "$STACK_NAME" =~ ^[a-z][a-z0-9-]{0,31}$ ]] || fail 'STACK_NAME inválido.'
swarm_manager() {
  docker_ready
  [[ "$(docker info --format '{{.Swarm.ControlAvailable}}')" == true ]] || fail 'Execute em um manager de um Swarm já inicializado.'
}
replicas() {
  API_REPLICAS="${API_REPLICAS:-2}"
  [[ "$API_REPLICAS" =~ ^[1-4]$ ]] || fail 'API_REPLICAS deve estar entre 1 e 4; rever orçamento de conexões para ampliar.'
  export API_REPLICAS
}
images() {
  for name in NGINX_IMAGE POSTGRES_IMAGE BACKEND_IMAGE; do
    value="${!name:-}"
    [[ "$value" =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]] || fail "$name deve identificar uma imagem imutável por digest."
  done
}
