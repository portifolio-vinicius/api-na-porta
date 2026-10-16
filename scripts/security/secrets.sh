#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
docker_ready
scanner=(docker run --rm -v "$ROOT:/repo:ro" zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f)
"${scanner[@]}" dir /repo --redact --no-banner
# Full fetched history includes PR commits; an unborn repository has no history to scan.
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  "${scanner[@]}" git /repo --redact --no-banner
fi
