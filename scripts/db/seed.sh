#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
require python3
exec python3 scripts/db/database.py seed
