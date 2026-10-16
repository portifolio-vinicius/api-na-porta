#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
require python3
python3 scripts/metrics/report.py
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then cat "$METRICS_DIR/routes.md" >> "$GITHUB_STEP_SUMMARY"; fi
