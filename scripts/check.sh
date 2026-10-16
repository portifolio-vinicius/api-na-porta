#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
backend
for task in lint typecheck build; do script_exists "$task"; done
npm --prefix backend ci --ignore-scripts
for task in lint typecheck build; do npm --prefix backend run "$task"; done
