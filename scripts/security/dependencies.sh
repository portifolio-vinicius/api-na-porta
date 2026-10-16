#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
backend
npm --prefix backend audit --include=dev --audit-level=high
