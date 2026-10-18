#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
if [[ "${1:-}" == --help ]]; then
  echo 'Uso: make apiVolume LOAD_ORDERS=100000 LOAD_STAGES=1,10,25,50,100 LOAD_SECONDS=15 LOAD_INSTANCES=2'
  echo 'Cria e remove seu próprio ambiente; não aceita URL de ambiente externo.'
  exit 0
fi
backend
docker_ready
require node
npm --prefix backend ci --ignore-scripts
npm --prefix backend run test:volume
