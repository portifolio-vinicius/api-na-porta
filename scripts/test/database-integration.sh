#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
require python3
docker_ready
exec python3 backend/test/integration/databaseOperations.py
