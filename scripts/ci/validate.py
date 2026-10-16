#!/usr/bin/env python3
"""Exercise pipeline failure handling with disposable synthetic fixtures, never API metrics."""
import ast
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
count = 0


def verify(label, command, expected, cwd=ROOT, extra_env=None):
    global count
    env = dict(os.environ)
    if extra_env:
        env.update(extra_env)
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True)
    if (result.returncode == 0) != expected:
        print(result.stdout + result.stderr, file=sys.stderr)
        raise RuntimeError(label)
    count += 1
    print("OK: " + label)


for path in sorted((ROOT / "scripts").rglob("*.sh")):
    verify("sintaxe " + str(path.relative_to(ROOT)), ["bash", "-n", str(path)], True)
for path in sorted((ROOT / "scripts").rglob("*.py")):
    ast.parse(path.read_text(), filename=str(path))

jobs = ["backend-quality", "backend-security", "backend-integration", "backend-docs"]
good = {name: {"result": "success"} for name in jobs}
gate = [sys.executable, str(ROOT / "scripts/ci/merge-gate.py")]
verify("gate: todos aprovados", gate, True, extra_env={"NEEDS_JSON": json.dumps(good)})
for name in jobs:
    for status in ("failure", "cancelled", "skipped", "missing"):
        needs = copy.deepcopy(good)
        if status == "missing":
            del needs[name]
        else:
            needs[name]["result"] = status
        verify(f"gate bloqueia {name} {status}", gate, False, extra_env={"NEEDS_JSON": json.dumps(needs)})
verify("gate bloqueia JSON inválido", gate, False, extra_env={"NEEDS_JSON": "invalid"})

with tempfile.TemporaryDirectory(prefix="naporta-pipeline-validation-") as tmp:
    root = Path(tmp)
    shutil.copytree(ROOT / "scripts", root / "scripts")
    shutil.copytree(ROOT / "docs", root / "docs")
    shutil.copytree(ROOT / ".github", root / ".github")
    for name in ("README.md", "ag.md", "backend/ag.md", "database/ag.md"):
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    for args in (["init", "-q"], ["add", "README.md"], ["-c", "user.name=Pipeline fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "Synthetic fixture"]):
        subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)
    # Exercise real Git worktrees and a local bare remote; never change the user's branches.
    def fixture_git(*args):
        subprocess.run(["git", "-c", "user.name=Pipeline fixture", "-c", "user.email=fixture@example.invalid",
                        "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", *args],
                       cwd=root, check=True, capture_output=True)

    fixture_git("add", ".")
    fixture_git("commit", "-qm", "Worktree fixture")
    fixture_git("branch", "-M", "develop")
    fixture_git("branch", "master")
    with tempfile.TemporaryDirectory(prefix="naporta-git-flow-") as flow_tmp:
        remote = Path(flow_tmp) / "remote.git"
        worktree = Path(flow_tmp) / "feature"
        fixture_git("init", "--bare", "-q", str(remote))
        fixture_git("remote", "add", "origin", str(remote))
        fixture_git("push", "-q", "origin", "develop", "master")
        fixture_git("fetch", "-q", "origin")
        fixture_git("worktree", "add", "-q", "-b", "feature/124-filtros-pedidos", str(worktree), "origin/develop")
        flow = ["bash", "scripts/git/validate-flow.sh"]
        verify("worktree: feature limpa para develop", flow, True, cwd=worktree, extra_env={"TARGET": "develop"})
        original = (root / "README.md").read_text()
        with (worktree / "README.md").open("a") as file:
            file.write("\nAlteração isolada da fixture\n")
        assert (root / "README.md").read_text() == original
        count += 1
        print("OK: worktree preserva arquivos da base")
        verify("worktree: árvore suja bloqueada", flow, False, cwd=worktree, extra_env={"TARGET": "develop"})
        (worktree / "README.md").write_text(original)
        verify("worktree: destino inválido bloqueado", flow, False, cwd=worktree, extra_env={"TARGET": "production"})
        verify("worktree: feature para master bloqueada", flow, False, cwd=worktree, extra_env={"TARGET": "master"})
        verify("worktree: develop para develop bloqueada", flow, False, cwd=root, extra_env={"TARGET": "develop"})
        verify("worktree: develop para master válida", flow, True, cwd=root, extra_env={"TARGET": "master"})
        fixture_git("worktree", "remove", str(worktree))
        assert not worktree.exists() and (root / "README.md").read_text() == original
        count += 1
        print("OK: worktree removido preservando a base")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    directory = root / "metrics"
    directory.mkdir()
    manifest = dict(runId="synthetic-fixture", commit=commit, complete=True, profile="full", compression="off", runtime="synthetic", timestamp="2026-10-16T00:00:00Z")
    sys.path.insert(0, str(ROOT / "scripts/metrics"))
    from report import ROUTES
    samples = []
    for (method, route), status in ROUTES.items():
        samples.append(dict(runId="synthetic-fixture", method=method, route=route, scenario="synthetic-success", statusCode=status, expectedStatusCode=status,
                            serverDurationMs=1.0, clientDurationMs=2.0, requestBodyBytes=0, responseBodyBytes=0 if status == 204 else 10,
                            cacheOutcome="bypass", databaseRole="primary", outcome="completed", profile="full"))
    for status in (400, 401, 404, 409, 429, 500):
        row = dict(samples[0]); row.update(scenario="synthetic-error", statusCode=status, expectedStatusCode=status)
        samples.append(row)

    def report_case(label, current_manifest, current_samples, expected):
        (directory / "manifest.json").write_text(json.dumps(current_manifest))
        (directory / "samples.jsonl").write_text("\n".join(json.dumps(row) for row in current_samples) + "\n")
        verify(label, [sys.executable, "scripts/metrics/report.py"], expected, cwd=root, extra_env={"METRICS_DIR": str(directory)})

    report_case("relatório aceita amostras sintéticas válidas", manifest, samples, True)
    rendered = (directory / "routes.json").read_text()
    report_case("relatório é determinístico", manifest, samples, True)
    assert rendered == (directory / "routes.json").read_text()
    for label, change in (
        ("execução incompleta", {"complete": False}),
        ("commit diferente", {"commit": "0" * 40}),
        ("perfil incompleto", {"profile": "simple"}),
    ):
        report_case("relatório bloqueia " + label, dict(manifest, **change), samples, False)
    for label, field, value in (
        ("payload sensível", "payload", "synthetic-only"),
        ("latência negativa", "serverDurationMs", -1),
        ("NaN", "clientDurationMs", float("nan")),
        ("status divergente", "statusCode", 201),
        ("aborto", "outcome", "aborted"),
        ("bytes fracionários", "requestBodyBytes", 0.5),
    ):
        changed = copy.deepcopy(samples); changed[0][field] = value
        report_case("relatório bloqueia " + label, manifest, changed, False)
    changed = copy.deepcopy(samples)
    next(row for row in changed if row["statusCode"] == 204)["responseBodyBytes"] = 1
    report_case("relatório bloqueia corpo no 204", manifest, changed, False)
    report_case("relatório bloqueia rota ausente", manifest, samples[1:], False)
    report_case("relatório bloqueia erro obrigatório ausente", manifest, samples[:-1], False)
    report_case("relatório bloqueia ausência de amostras", manifest, [], False)
    verify("documentação válida", [sys.executable, "scripts/docs/check.py"], True, cwd=root)
    with (root / "README.md").open("a") as file:
        file.write("\n[Fixture quebrada](missing-synthetic-file.md)\n")
    verify("documentação bloqueia link quebrado", [sys.executable, "scripts/docs/check.py"], False, cwd=root)

print(f"Validação das esteiras: {count} verificações aprovadas. Fixtures sintéticas descartadas; nenhuma medição da API foi criada.")
