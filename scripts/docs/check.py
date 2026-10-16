#!/usr/bin/env python3
"""Check repository Markdown links and the documented route inventory."""
from pathlib import Path
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
errors = []
files = [ROOT / name for name in ("README.md", "AGENTS.md", "backend/AGENTS.md", "database/AGENTS.md")] + sorted((ROOT / "docs").rglob("*.md"))
for path in files:
    text = re.sub(r"```.*?```", "", path.read_text(), flags=re.S)
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
        target = target.strip().strip("<>").split("#", 1)[0]
        if not target or re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", target):
            continue
        if not (path.parent / unquote(target)).exists():
            errors.append(f"{path.relative_to(ROOT)}: link local ausente: {target}")
contract = (ROOT / "docs/05-api.md").read_text()
inventory = (ROOT / "docs/performance/rotas.md").read_text()
expected = set(re.findall(r"^\| `(GET|POST|PATCH|DELETE) ([^`]+)`", contract, re.M))
actual = {(method, route.removeprefix("/api/v1")) for method, route in re.findall(r"^\| (GET|POST|PATCH|DELETE) \| `([^`]+)`", inventory, re.M)}
if not expected or expected != actual:
    errors.append("Inventário de rotas diverge do contrato HTTP")
for error in errors:
    print("ERRO: " + error, file=sys.stderr)
print(f"Documentação: {len(files)} arquivos; {len(errors)} erros")
sys.exit(bool(errors))
