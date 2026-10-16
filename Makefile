SHELL := /bin/bash
.DEFAULT_GOAL := help
TARGET ?= develop
export TARGET
.PHONY: pipelineCheck help check security integration routeReport docsCheck docsUpdate taskPlan ci preMerge validateFlow
pipelineCheck:
	@python3 scripts/ci/validate.py
help:
	@printf '%s\n' 'pipelineCheck check security integration routeReport docsCheck docsUpdate taskPlan ci preMerge validateFlow' 'TARGET=develop|master; METRICS_DIR=artifacts/performance/current'
check:
	@bash scripts/check.sh
security:
	@bash scripts/security/check.sh
integration:
	@bash scripts/test/backend-integration.sh
routeReport:
	@bash scripts/metrics/route-report.sh
docsCheck:
	@bash scripts/docs/check.sh
docsUpdate:
	@bash scripts/docs/update.sh
taskPlan:
	@bash scripts/tasks/plan.sh
ci:
	@bash scripts/ci/check.sh
preMerge:
	@bash scripts/git/pre-merge.sh
validateFlow:
	@bash scripts/git/validate-flow.sh
