#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
require python3
docker_ready
exec python3 scripts/db/environment.py down
