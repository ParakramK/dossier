#!/bin/sh
# Bring the database behind your running Dossier 1.15 install up to the
# feature build. Run it from the folder with your compose.yml, then switch
# DOSSIER_IMAGE in .env to the feature image and recreate the app container.
#
# A dump of the current database is written before anything changes, so you can
# always go back to the 1.15 image with the data exactly as it is now.
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
SQL="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/migrate-existing-db.sql"

mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$BACKUP_DIR/dossier-before-features-$stamp.dump"

echo "Backing up the current database to $backup ..."
docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U dossier -d dossier -Fc > "$backup"

echo "Applying the compatibility migration ..."
docker compose -f "$COMPOSE_FILE" exec -T db psql -U dossier -d dossier -v ON_ERROR_STOP=1 < "$SQL"

echo "Done. Kept the backup at $backup"
echo "Now set DOSSIER_IMAGE in .env and run: docker compose -f $COMPOSE_FILE up -d --force-recreate app"
