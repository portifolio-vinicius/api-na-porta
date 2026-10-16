#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
swarm_manager
require python3
CONFIG_VERSION=$(python3 -c 'from pathlib import Path; import hashlib; paths=[Path("infra/nginx/nginx.conf"),Path("infra/swarm/backend-entrypoint.sh"),*sorted(Path("database/security").glob("*"))]; print(hashlib.sha256(b"".join(p.read_bytes() for p in paths)).hexdigest()[:16])')
export CONFIG_VERSION
bash scripts/infra/validate.sh
for variable in TLS_CERT_SECRET TLS_KEY_SECRET DATABASE_URL_SECRET JWT_SECRET_NAME POSTGRES_PASSWORD_SECRET APP_PASSWORD_SECRET MIGRATOR_PASSWORD_SECRET READER_PASSWORD_SECRET; do
  docker secret inspect "${!variable}" >/dev/null
done
# Volume local: somente um nó deve receber este label para não criar outro banco vazio.
count=$(docker node ls --filter node.label=naporta.database=true -q | wc -l | tr -d ' ')
[[ "$count" == 1 ]] || fail 'Marque exatamente um nó com naporta.database=true.'
[[ -n "$(docker node ls --filter node.label=naporta.edge=true -q)" ]] || fail 'Marque ao menos um nó de borda com naporta.edge=true.'
docker stack deploy --resolve-image always -c infra/swarm/stack.yml "$STACK_NAME"
printf 'Stack enviada. Confira convergência: docker stack services %s; docker stack ps %s --no-trunc\n' "$STACK_NAME" "$STACK_NAME"
