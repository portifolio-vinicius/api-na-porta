#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
bash scripts/git/validate-flow.sh
make ci
