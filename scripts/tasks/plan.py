#!/usr/bin/env python3
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
target = os.environ.get("TARGET", "develop")
if target not in ("develop", "master"):
    sys.exit("ERRO: TARGET deve ser develop ou master")
try:
    base = subprocess.check_output(["git", "merge-base", "HEAD", "origin/" + target], cwd=root, stderr=subprocess.DEVNULL, text=True).strip()
    changes = subprocess.check_output(["git", "diff", "--name-status", "--no-renames", "-z", base, "HEAD"], cwd=root).decode().split("\0")
    changes = [dict(status=changes[i], path=changes[i+1]) for i in range(0, len(changes)-1, 2)]
    reason = "Análise conservadora: conjunto completo"
except subprocess.CalledProcessError:
    base, changes, reason = None, [], "Base indisponível: conjunto completo obrigatório"
plan = dict(target=target, base=base, changes=changes, profile="full", reason=reason,
            required=["check", "security", "integration", "routeReport", "docsCheck"])
directory = root / "artifacts"
directory.mkdir(exist_ok=True)
(directory / "task-plan.json").write_text(json.dumps(plan, indent=2) + "\n")
print(reason + "; artifacts/task-plan.json")
