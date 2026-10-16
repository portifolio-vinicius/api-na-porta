#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
docker_ready
require python3
mkdir -p artifacts/security
docker run --rm -v "$ROOT:/repo:ro" -v "$ROOT/artifacts/security:/reports" aquasec/trivy:0.76.0@sha256:2416d1f74045b57274df1a340eee6b510cacd73c66a6ccb8da092b117eb7d222 config --format json --output /reports/infra-config.json --exit-code 1 --severity HIGH,CRITICAL /repo/infra
python3 -c 'import json; r=json.load(open("artifacts/security/infra-config.json")); assert any(x.get("Type")=="dockerfile" for x in r.get("Results",[])), "Nenhum Dockerfile de infraestrutura analisado"'
[[ -f backend/Dockerfile ]] || fail 'backend/Dockerfile ausente.'
docker run --rm -v "$ROOT:/repo:ro" aquasec/trivy:0.76.0@sha256:2416d1f74045b57274df1a340eee6b510cacd73c66a6ccb8da092b117eb7d222 config --exit-code 1 --severity HIGH,CRITICAL /repo/backend
# Unique temporary image; cleanup only the image created by this execution.
image="naporta-security:$(date +%s)-$$"
trap 'docker image rm "$image" >/dev/null 2>&1 || true' EXIT
docker build -t "$image" -f backend/Dockerfile .
tmp_scan="$(mktemp -d)"
trap 'docker image rm "$image" >/dev/null 2>&1 || true; rmdir "$tmp_scan" 2>/dev/null || true' EXIT
docker save "$image" -o "$tmp_scan/image.tar"
# No Docker socket exposed to the scanner.
set +e
docker run --rm -v "$tmp_scan:/scan:ro" aquasec/trivy:0.76.0@sha256:2416d1f74045b57274df1a340eee6b510cacd73c66a6ccb8da092b117eb7d222 image --input /scan/image.tar --scanners vuln --exit-code 1 --severity HIGH,CRITICAL
result=$?
set -e
rm -f "$tmp_scan/image.tar"
exit "$result"
