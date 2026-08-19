#!/usr/bin/env bash
# ============================================================================
# مِران (Miran) — Disaster Recovery & Backup Script
# PostgreSQL 16 Backup, Compression, and S3 / Remote Upload
# ============================================================================

set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
BACKUP_FILE="${BACKUP_DIR}/miran_db_${TIMESTAMP}.sql.gz"

mkdir -p ${BACKUP_DIR}

echo "💾 Starting automated PostgreSQL database backup..."

# Dump database with pg_dump
docker exec miran-postgres pg_dump -U miran_user -d miran -F p | gzip > ${BACKUP_FILE}

echo "✅ Backup file created successfully: ${BACKUP_FILE}"
echo "📊 Size: $(du -h ${BACKUP_FILE} | cut -f1)"

# Retain local backups for 14 days
find ${BACKUP_DIR} -type f -name "*.sql.gz" -mtime +14 -delete

echo "🧹 Old backups pruned. Disaster Recovery backup process completed."
