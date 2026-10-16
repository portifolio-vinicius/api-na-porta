#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
require docker
replicas
images
[[ "${DB_SUBNET:-10.42.0.0/24}" == 10.42.0.0/24 ]] || fail 'Atualize pg_hba.conf e a validação antes de alterar DB_SUBNET.'
docker stack config -c infra/swarm/stack.yml >/dev/null
printf 'Manifesto Swarm válido; não comprova prontidão da aplicação.\n'
