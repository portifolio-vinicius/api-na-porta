#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
require python3
python3 scripts/tasks/plan.py
