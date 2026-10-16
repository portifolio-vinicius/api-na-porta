#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  printf 'Uso: bash %s\nConfiguração: TARGET=develop|master; METRICS_DIR=artifacts/performance/current\nBanco: ENV=local|test|demo; PGHOST, PGPORT, PGUSER, PGDATABASE e autenticação privados.\nConsulte docs/13-esteiras-executaveis.md e docs/15-postgresql-operacoes.md para pré-requisitos.\n' "$0"
  exit 0
fi
fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Pré-requisito ausente: $1"; }
backend() {
  require node; require npm
  [[ -f backend/package.json && -f backend/package-lock.json ]] || fail 'Backend ausente: necessários backend/package.json e package-lock.json.'
}
script_exists() {
  node -e 'const p=require("./backend/package.json"); const s=p.scripts?.[process.argv[1]]; if(typeof s!=="string" || !s.trim()) process.exit(1)' "$1" || fail "Script obrigatório ausente: backend npm run $1"
}
docker_ready() { require docker; docker info >/dev/null 2>&1 || fail 'Docker indisponível: inicie o serviço Docker.'; }
METRICS_DIR="${METRICS_DIR:-artifacts/performance/current}"
export METRICS_DIR
