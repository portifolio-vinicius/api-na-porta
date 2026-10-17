#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
docker_ready
[[ -d backend/src ]] || fail 'Código backend/src ausente para SAST.'
require python3
python3 -c 'from pathlib import Path; import sys; sys.exit(not any(p.suffix in (".ts", ".js") for p in Path("backend/src").rglob("*")))' || fail 'Nenhum arquivo TypeScript/JavaScript encontrado para SAST.'
docker run --rm -e SEMGREP_SEND_METRICS=off -v "$ROOT/backend/src:/src/backend/src:ro" -v "$ROOT/config:/src/config:ro" --workdir /src semgrep/semgrep:1.181.0@sha256:81474464c1f07483ba0682a44787fd93c91397419762a04abe2bafaae396304b semgrep scan --config config/semgrep.yml --error --strict --metrics off --exclude '**/generated/**' backend/src
