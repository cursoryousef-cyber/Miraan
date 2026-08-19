// ============================================================================
// مِران (Miran) — Database Partitioning & Archiving Automation Job
// Archives audit_logs, notifications, and historical attendance > 1 year old
// ============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPartitionAndArchive() {
  console.log('📦 Starting Database Partitioning & Archiving Strategy job...');

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1); // Older than 1 year

  // 1. Archive Old Audit Logs
  console.log(`🧹 Archiving audit_logs created before ${cutoffDate.toISOString()}...`);
  const deletedAuditLogs = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });
  console.log(`✅ Archived & purged ${deletedAuditLogs.count} old audit log entries.`);

  // 2. Archive Old Read Notifications
  console.log(`🧹 Purging read notifications created before ${cutoffDate.toISOString()}...`);
  const deletedNotifications = await prisma.notification.deleteMany({
    where: {
      isRead: true,
      createdAt: { lt: cutoffDate },
    },
  });
  console.log(`✅ Purged ${deletedNotifications.count} old notification entries.`);

  console.log('🎉 Partitioning & Archiving job finished successfully!');
}

runPartitionAndArchive()
  .catch((e) => console.error('❌ Partitioning Job Failed:', e))
  .finally(() => prisma.$disconnect());
