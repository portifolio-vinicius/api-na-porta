#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
# Calculated execution data belongs in artifacts; manual contracts stay manual.
bash scripts/metrics/route-report.sh
bash scripts/docs/check.sh
