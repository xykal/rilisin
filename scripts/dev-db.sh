#!/usr/bin/env bash
# Menyalakan PostgreSQL lokal untuk development (sandbox / laptop Debian-Ubuntu).
# Aman dijalankan berulang kali (idempotent).
set -euo pipefail

DB_NAME="${DB_NAME:-rilisin}"
DB_USER="${DB_USER:-rilisin}"
DB_PASS="${DB_PASS:-rilisin}"

if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "» PostgreSQL belum terpasang, menginstal..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
fi

PG_VERSION="$(ls /usr/lib/postgresql | sort -n | tail -1)"
if ! sudo pg_lsclusters | grep -q "online"; then
  echo "» Menyalakan PostgreSQL ${PG_VERSION}..."
  sudo pg_ctlcluster "${PG_VERSION}" main start
fi

sudo -u postgres psql -qtAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -qc "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}' CREATEDB"
sudo -u postgres psql -qtAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -qc "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"

echo "✓ PostgreSQL siap: postgres://${DB_USER}:***@localhost:5432/${DB_NAME}"
