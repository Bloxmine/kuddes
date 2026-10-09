#!/usr/bin/env bash
# Backs up the database and the uploads to /var/backups/kuddes, and keeps
# 14 days. Runs every night from the kuddes-backup timer (see DEPLOY.md).
set -euo pipefail

APP=/opt/kuddes
DEST=/var/backups/kuddes
STAMP=$(date +%Y-%m-%d_%H%M)
KEEP_DAYS=14

mkdir -p "$DEST"
cd "$APP"

# Database: a compressed dump from the Postgres container
docker compose exec -T db pg_dump -U kuddes --no-owner --no-privileges kuddes | gzip -9 > "$DEST/db-$STAMP.sql.gz"

# Uploads (photos, videos, avatars...), without unfinished video uploads
tar --exclude='tmp-videos' -czf "$DEST/uploads-$STAMP.tar.gz" -C "$APP" uploads

# Only root can read backups
chmod 600 "$DEST"/*-"$STAMP".*

# Remove backups older than two weeks
find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete

echo "Backup klaar: $DEST/db-$STAMP.sql.gz en uploads-$STAMP.tar.gz"
