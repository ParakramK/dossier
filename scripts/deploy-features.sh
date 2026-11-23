#!/bin/sh
# One command for a local deploy. Run it from anywhere:
#
#   /Users/parakram/dossier/dossier/scripts/deploy-features.sh
#
# It pushes the fork, builds the image locally (faster than waiting for
# Actions), backs up and migrates the live database, switches .env to the
# image and recreates the app container. The GHCR build still runs on push
# for other machines.
set -eu

REPO=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEPLOY=$(CDPATH= cd -- "$REPO/.." && pwd)
COMPOSE="$DEPLOY/compose.yml"
ENV_FILE="$DEPLOY/.env"
BRANCH=feature/extra-job-sources
IMAGE=parakramk/dossier:features

echo "1/5  Push $BRANCH to your fork"
cd "$REPO"
[ "$(git branch --show-current)" = "$BRANCH" ] || { echo "Switch to $BRANCH first." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit local changes before running this." >&2; exit 1; }
git push -u origin "$BRANCH"

echo "2/5  Build $IMAGE locally"
docker build -t "$IMAGE" "$REPO"

echo "3/5  Back up and migrate the live database"
printf 'Migrate the live database in %s? [y/N] ' "$DEPLOY"
read -r answer
case "$answer" in y|Y) ;; *) echo "Stopped before the database."; exit 1 ;; esac
COMPOSE_FILE="$COMPOSE" BACKUP_DIR="$DEPLOY/backups" "$REPO/scripts/migrate-existing-db.sh"

echo "4/5  Point .env at the image"
cp "$ENV_FILE" "$ENV_FILE.bak"
tmp=$(mktemp)
grep -v '^DOSSIER_IMAGE=' "$ENV_FILE" > "$tmp" || true
printf 'DOSSIER_IMAGE=%s\n' "$IMAGE" >> "$tmp"
mv "$tmp" "$ENV_FILE"

echo "5/5  Recreate the app container"
docker compose -f "$COMPOSE" up -d --force-recreate app
docker compose -f "$COMPOSE" ps app

echo "Deployed $IMAGE from $(git rev-parse --short HEAD)"
