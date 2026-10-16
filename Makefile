SHELL := /bin/bash
.DEFAULT_GOAL := help
TARGET ?= develop
export TARGET ENV DB_PORT PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE DB_CONTAINER DB_CONFIRM BACKUP_FILE MIGRATION MIGRATIONS_DIR
export API_REPLICAS STACK_NAME DB_CONTAINER DB_ACCESS_ACTION
.PHONY: infraValidate swarmDeploy scale dbAccess infraCheck
infraValidate:
	@bash scripts/infra/validate.sh
swarmDeploy:
	@bash scripts/infra/deploy.sh
scale:
	@bash scripts/infra/scale.sh
dbAccess:
	@bash scripts/db/access.sh
infraCheck:
	@python3 scripts/infra/check.py
.PHONY: pipelineCheck help check security integration routeReport docsCheck docsUpdate taskPlan ci preMerge validateFlow
pipelineCheck:
	@python3 scripts/ci/validate.py
help:
	@printf '%s\n' 'infraCheck infraValidate swarmDeploy scale dbAccess' 'API_REPLICAS=2; STACK_NAME=naporta; DB_ACCESS_ACTION=roles|grants; DB_CONTAINER=<container>'
	@printf '%s\n' 'dbUp dbDown migrate rollback backup restore seed dbStatus dbIntegration' 'pipelineCheck check security integration routeReport docsCheck docsUpdate taskPlan ci preMerge validateFlow' 'TARGET=develop|master; METRICS_DIR=artifacts/performance/current'
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

.PHONY: dbUp dbDown migrate rollback backup restore seed dbStatus dbIntegration
migrate:
	@bash scripts/db/migrate.sh
rollback:
	@bash scripts/db/rollback.sh
backup:
	@bash scripts/db/backup.sh
restore:
	@bash scripts/db/restore.sh
seed:
	@bash scripts/db/seed.sh
dbStatus:
	@bash scripts/db/status.sh
dbIntegration:
	@bash scripts/test/database-integration.sh
dbUp:
	@bash scripts/db/up.sh
dbDown:
	@bash scripts/db/down.sh
