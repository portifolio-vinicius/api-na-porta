#!/bin/sh
set -eu
umask 077
DATABASE_URL=$(cat /run/secrets/database_url)
JWT_SECRET=$(cat /run/secrets/jwt_secret)
test -n "$DATABASE_URL" && test -n "$JWT_SECRET"
export DATABASE_URL JWT_SECRET
# Contrato Prisma com pool por URL; não aceitar credencial administrativa.
node -e '
const u = new URL(process.env.DATABASE_URL);
if (!["postgresql:", "postgres:"].includes(u.protocol) || u.username !== "naporta_app" || u.hostname !== "db" || u.pathname !== "/naporta" || u.searchParams.get("schema") !== "public") process.exit(1);
if (Buffer.byteLength(process.env.JWT_SECRET) < 32) process.exit(1);
'
mkdir -p "$CACHE_DIRECTORY"
exec "$@"
