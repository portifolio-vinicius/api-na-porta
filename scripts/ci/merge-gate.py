#!/usr/bin/env python3
import json
import os
import sys
required = {"backend-quality", "backend-security", "backend-integration", "backend-docs"}
try:
    needs = json.loads(os.environ["NEEDS_JSON"])
    failed = [name for name in sorted(required) if needs.get(name, {}).get("result") != "success"]
except (KeyError, ValueError, TypeError, AttributeError):
    sys.exit("ERRO: resultados do gate ausentes ou inválidos")
if failed:
    sys.exit("ERRO: gate reprovado: " + ", ".join(failed))
print("Gate aprovado: todos os jobs obrigatórios concluíram com sucesso")
