#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
swarm_manager
replicas
docker service scale "${STACK_NAME}_backend=${API_REPLICAS}"
