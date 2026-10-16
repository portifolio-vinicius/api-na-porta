#!/usr/bin/env python3
"""Validate integration measurements, then aggregate without making HTTP requests."""
import json
import math
import os
from pathlib import Path
import re
import statistics
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
ROUTES = {
    ("POST", "/api/v1/auth/login"): 200,
    ("GET", "/api/v1/health/ready"): 200,
    ("POST", "/api/v1/orders"): 201,
    ("GET", "/api/v1/orders"): 200,
    ("GET", "/api/v1/orders/:id"): 200,
    ("PATCH", "/api/v1/orders/:id"): 200,
    ("DELETE", "/api/v1/orders/:id"): 204,
}
FIELDS = {"runId", "method", "route", "scenario", "statusCode", "expectedStatusCode",
          "serverDurationMs", "clientDurationMs", "requestBodyBytes", "responseBodyBytes",
          "cacheOutcome", "databaseRole", "outcome", "profile"}

def number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0

def percentile(values, p):
    return sorted(values)[math.ceil(p * len(values)) - 1]

def aggregate(values):
    return dict(count=len(values), min=min(values), mean=statistics.mean(values),
                p50=percentile(values, .5), p95=percentile(values, .95),
                p99=percentile(values, .99), max=max(values))

def generate(directory):
    for name in ("manifest.json", "samples.jsonl"):
        if not (directory / name).is_file():
            raise ValueError("Artefato obrigatório ausente: " + name)
    manifest = json.loads((directory / "manifest.json").read_text())
    if set(manifest) != {"runId", "commit", "complete", "profile", "compression", "runtime", "timestamp"}:
        raise ValueError("Manifesto: campos obrigatórios ausentes ou desconhecidos")
    if manifest["complete"] is not True or manifest["compression"] != "off" or manifest["profile"] != "full":
        raise ValueError("Execução incompleta ou perfil/compressão incompatível")
    for key in ("runId", "runtime", "timestamp"):
        if not isinstance(manifest[key], str) or not manifest[key].strip():
            raise ValueError("Metadado obrigatório inválido")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, stderr=subprocess.DEVNULL, text=True).strip()
    if manifest["commit"] != commit:
        raise ValueError("Artefato não pertence ao commit candidato")
    samples = [json.loads(line) for line in (directory / "samples.jsonl").read_text().splitlines() if line.strip()]
    if not samples:
        raise ValueError("Nenhuma amostra de integração")
    groups = {}
    observed = set()
    errors = set()
    for row in samples:
        if set(row) != FIELDS:
            raise ValueError("Amostra com campos ausentes/desconhecidos; payloads não são permitidos")
        route = (row["method"], row["route"])
        if route not in ROUTES or row["runId"] != manifest["runId"] or row["profile"] != manifest["profile"]:
            raise ValueError("Rota, execução ou perfil inválido")
        if not isinstance(row["scenario"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", row["scenario"]):
            raise ValueError("Cenário deve ser um identificador técnico")
        status = row["statusCode"]
        if type(status) is not int or not 100 <= status <= 599 or status != row["expectedStatusCode"] or row["outcome"] != "completed":
            raise ValueError("Requisição incompleta ou status diferente do esperado")
        if row["cacheOutcome"] not in ("hit", "miss", "bypass") or row["databaseRole"] not in ("primary", "replica"):
            raise ValueError("Dimensão cache/banco inválida")
        for field in ("serverDurationMs", "clientDurationMs", "requestBodyBytes", "responseBodyBytes"):
            if not number(row[field]) or (field.endswith("Bytes") and type(row[field]) is not int):
                raise ValueError("Métrica numérica inválida")
        if status == 204 and row["responseBodyBytes"] != 0:
            raise ValueError("Resposta 204 deve ter zero bytes de corpo")
        if status == ROUTES[route]:
            observed.add(route)
        if status >= 400:
            errors.add(status)
        key = (*route, row["scenario"], status, row["cacheOutcome"], row["databaseRole"], row["profile"])
        groups.setdefault(key, []).append(row)
    if observed != set(ROUTES):
        raise ValueError("Cobertura incompleta de rotas com sucesso")
    if not {400, 401, 404, 409, 429, 500}.issubset(errors):
        raise ValueError("Cobertura incompleta dos cenários HTTP de erro")
    result = []
    for key, rows in sorted(groups.items()):
        entry = dict(zip(("method", "route", "scenario", "statusCode", "cacheOutcome", "databaseRole", "profile"), key))
        entry["requestCount"] = len(rows)
        entry["lowSampleCount"] = len(rows) < 100
        for field in ("serverDurationMs", "clientDurationMs"):
            entry[field] = aggregate([r[field] for r in rows])
        for field in ("requestBodyBytes", "responseBodyBytes"):
            values = [r[field] for r in rows]
            entry[field] = dict(total=sum(values), mean=statistics.mean(values), max=max(values))
        entry["totalBodyBytes"] = sum(r["requestBodyBytes"] + r["responseBodyBytes"] for r in rows)
        result.append(entry)
    return {"valid": True, "manifest": manifest, "groups": result}

def main():
    directory = Path(os.environ.get("METRICS_DIR", "artifacts/performance/current"))
    try:
        report = generate(directory)
    except (ValueError, OSError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        # Do not print source lines or payloads from invalid artifacts.
        message = str(error) if type(error) is ValueError else type(error).__name__
        print("ERRO: relatório inválido: " + message, file=sys.stderr)
        if directory.is_dir() and "--validate-only" not in sys.argv:
            (directory / "routes.json").write_text(json.dumps({"valid": False, "reason": message}) + "\n")
            (directory / "routes.md").write_text("# Diagnóstico incompleto\n\nRelatório reprovado; consulte a validação da integração.\n")
        return 1
    if "--validate-only" in sys.argv:
        print("Métricas válidas")
        return 0
    (directory / "routes.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    lines = ["# Métricas da integração", "", "Bytes de corpo; compressão desligada. Percentis com menos de 100 amostras são apenas descritivos.", "", "| Método | Rota | Cenário | HTTP | Cache | Banco | N | Servidor p50/p95/p99 ms | Cliente p50/p95/p99 ms | Bytes enviados/recebidos |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for group in report["groups"]:
        server, client = (" / ".join(f"{group[field][p]:.3f}" for p in ("p50", "p95", "p99")) for field in ("serverDurationMs", "clientDurationMs"))
        lines.append(f"| {group['method']} | {group['route']} | {group['scenario']} | {group['statusCode']} | {group['cacheOutcome']} | {group['databaseRole']} | {group['requestCount']} | {server} | {client} | {group['requestBodyBytes']['total']} / {group['responseBodyBytes']['total']} |")
    (directory / "routes.md").write_text("\n".join(lines) + "\n")
    print(f"Relatório válido: {directory / 'routes.md'}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
