#!/bin/sh
# One command for the whole release. Run it from anywhere:
#
#   /Users/parakram/dossier/dossier/scripts/deploy-features.sh
#
# It pushes the fork, waits for GitHub Actions to build and push the image to
# GHCR, pulls it, backs up and migrates the live database, switches .env to the
# GHCR image and recreates the app container.
#
# Set GHCR_TOKEN (a PAT with read:packages) only if the GHCR package is private.
set -eu

REPO=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEPLOY=$(CDPATH= cd -- "$REPO/.." && pwd)
COMPOSE="$DEPLOY/compose.yml"
ENV_FILE="$DEPLOY/.env"
BRANCH=feature/extra-job-sources
IMAGE=ghcr.io/parakramk/dossier:features

echo "1/6  Push $BRANCH to your fork"
cd "$REPO"
[ "$(git branch --show-current)" = "$BRANCH" ] || { echo "Switch to $BRANCH first." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit local changes before running this." >&2; exit 1; }
git push -u origin "$BRANCH"

echo "2/6  Wait for the GitHub Actions build"
sha=$(git rev-parse HEAD)
run=""
i=0
while [ -z "$run" ] && [ "$i" -lt 12 ]; do
  run=$(gh run list --repo ParakramK/dossier --branch "$BRANCH" --limit 20 \
    --json databaseId,headSha --jq ".[] | select(.headSha == \"$sha\") | .databaseId" 2>/dev/null | head -1)
  [ -n "$run" ] || sleep 5
  i=$((i + 1))
done
[ -n "$run" ] || { echo "No Actions run appeared for this commit." >&2; exit 1; }
gh run watch "$run" --repo ParakramK/dossier --compact --exit-status

echo "3/6  Pull $IMAGE"
if [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-ParakramK}" --password-stdin
fi
docker pull "$IMAGE"

echo "4/6  Back up and migrate the live database"
printf 'Migrate the live database in %s? [y/N] ' "$DEPLOY"
read -r answer
case "$answer" in y|Y) ;; *) echo "Stopped before the database."; exit 1 ;; esac
COMPOSE_FILE="$COMPOSE" BACKUP_DIR="$DEPLOY/backups" "$REPO/scripts/migrate-existing-db.sh"

echo "5/6  Point .env at the GHCR image"
cp "$ENV_FILE" "$ENV_FILE.bak"
tmp=$(mktemp)
grep -v '^DOSSIER_IMAGE=' "$ENV_FILE" > "$tmp" || true
printf 'DOSSIER_IMAGE=%s\n' "$IMAGE" >> "$tmp"
mv "$tmp" "$ENV_FILE"

echo "6/6  Recreate the app container"
docker compose -f "$COMPOSE" up -d --force-recreate app
docker compose -f "$COMPOSE" ps app

echo "Deployed $IMAGE from $sha"
