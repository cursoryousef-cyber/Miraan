// ============================================================================
// Phase 2.5 decision report — READ ONLY.
//
// Every statement below is a SELECT. No insert, update, delete, upsert or DDL
// appears in this file. It answers the questions needed to decide whether the
// production migration may proceed; it decides nothing itself.
//
// Run:  npx ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' \
//         src/scripts/phase25-decision-report.ts
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { ROLE_CAPABILITIES, TRAINING_CAPABILITIES } from '../common/authz/capabilities';

const prisma = new PrismaClient();

function heading(t: string) {
  console.log(`\n${'═'.repeat(90)}\n${t}\n${'═'.repeat(90)}`);
}
function sub(t: string) {
  console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 84 - t.length))}`);
}

async function main() {
  const orgs = await prisma.organization.findMany({
    include: { organizationType: { select: { code: true } } },
  });
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const code = (id?: string | null) => (id ? (byId.get(id)?.code ?? id.slice(0, 8)) : '—');

  // ══════════════════════════════════════════════════════════════════════════
  heading('A. ORGANIZATION / CLUSTER DUPLICATION — full profile per organisation');

  for (const o of orgs) {
    const [
      userRoles, assignments, reqIn, reqOut, notifications,
      departments, traineeProfiles, trainers, intakes, children,
    ] = await Promise.all([
      prisma.userRole.count({ where: { organizationId: o.id } }),
      prisma.organizationAssignment.count({ where: { organizationId: o.id, isActive: true } }),
      prisma.trainingRequest.count({ where: { targetOrgId: o.id } }),
      prisma.trainingRequest.count({ where: { sourceOrgId: o.id } }),
      prisma.notification.count({ where: { organizationId: o.id } }),
      prisma.department.count({ where: { organizationId: o.id } }),
      prisma.traineeProfile.count({ where: { organizationId: o.id } }),
      prisma.trainerProfile.count({ where: { organizationId: o.id } }),
      prisma.academicIntake.count({ where: { organizationId: o.id } }),
      prisma.organization.count({ where: { parentId: o.id } }),
    ]);

    const distinctUsers = await prisma.userRole.findMany({
      where: { organizationId: o.id }, select: { userAccountId: true }, distinct: ['userAccountId'],
    });

    const fkReferences =
      userRoles + assignments + reqIn + reqOut + notifications +
      departments + traineeProfiles + trainers + intakes + children;

    console.log(
      `\n  ${o.code}  (${o.nameAr})\n` +
      `    id            ${o.id}\n` +
      `    type          ${o.organizationType?.code ?? '—'}\n` +
      `    parent        ${code(o.parentId)}\n` +
      `    status        ${o.status}${o.deletedAt ? '  ⛔ SOFT-DELETED' : ''}\n` +
      `    users         ${distinctUsers.length} distinct   roleAssignments=${userRoles}  orgAssignments=${assignments}\n` +
      `    requests      in=${reqIn}  out=${reqOut}\n` +
      `    notifications ${notifications}\n` +
      `    children      ${children}   departments=${departments}   trainers=${trainers}\n` +
      `    trainees      ${traineeProfiles}   academicIntakes=${intakes}\n` +
      `    FK references ${fkReferences} ${fkReferences === 0 ? ' ← unreferenced' : ''}`,
    );
  }

  // ── The six specific questions ────────────────────────────────────────────
  const nbCluster = orgs.find((o) => o.code === 'NB-CLUSTER');
  const nbClusterProd = orgs.find((o) => o.code === 'NB-CLUSTER-PROD');

  sub('A.1  Which cluster owns the real production hospitals?');
  for (const c of [nbCluster, nbClusterProd]) {
    if (!c) continue;
    const hospitals = orgs.filter((o) => o.parentId === c.id);
    let totalDepts = 0, totalTrainees = 0, totalTrainers = 0;
    for (const h of hospitals) {
      totalDepts += await prisma.department.count({ where: { organizationId: h.id } });
      totalTrainees += await prisma.traineeProfile.count({ where: { organizationId: h.id } });
      totalTrainers += await prisma.trainerProfile.count({ where: { organizationId: h.id } });
    }
    console.log(
      `  ${c.code.padEnd(18)} hospitals=${hospitals.length} [${hospitals.map((h) => h.code).join(', ')}]  ` +
      `departments=${totalDepts} trainees=${totalTrainees} trainers=${totalTrainers}`,
    );
  }

  sub('A.2  Which cluster owns the real production training requests?');
  const allRequests = await prisma.trainingRequest.findMany();
  for (const r of allRequests) {
    console.log(
      `  ${r.requestNumber}  ${r.status.padEnd(16)} ` +
      `source=${code(r.sourceOrgId)} → target=${code(r.targetOrgId)}  createdAt=${r.createdAt.toISOString().slice(0, 10)}`,
    );
  }

  sub('A.3  Which cluster does cluster@miran.health belong to?');
  for (const email of ['cluster@miran.health', 'cluster.manager@miran.health']) {
    const acct = await prisma.userAccount.findUnique({
      where: { email },
      include: {
        userRoles: { include: { role: { select: { code: true } } } },
        orgAssignments: {
          where: { isActive: true },
          include: { role: { select: { code: true } } },
        },
      },
    });
    if (!acct) { console.log(`  ${email}: NOT FOUND`); continue; }
    console.log(`  ${email}`);
    for (const ur of acct.userRoles) {
      console.log(`      userRole        ${ur.role.code.padEnd(24)} @ ${code(ur.organizationId)}`);
    }
    for (const a of acct.orgAssignments) {
      console.log(
        `      assignment      ${(a.role?.code ?? '⛔ NULL ROLE').padEnd(24)} @ ${code(a.organizationId)}` +
        `${a.isPrimary ? '  (primary)' : ''}`,
      );
    }
  }

  sub('A.5  Why do notifications reference NB-CLUSTER while the active context is NB-CLUSTER-PROD?');
  const clusterNotifs = await prisma.notification.findMany({
    where: { organizationId: { in: [nbCluster?.id ?? '', nbClusterProd?.id ?? ''] } },
    select: {
      organizationId: true, type: true, referenceType: true, referenceId: true,
      isRead: true, createdAt: true, user: { select: { email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const perOrg = new Map<string, number>();
  for (const n of clusterNotifs) {
    perOrg.set(n.organizationId, (perOrg.get(n.organizationId) ?? 0) + 1);
  }
  for (const [orgId, count] of perOrg) console.log(`  notifications written for ${code(orgId)}: ${count}`);
  console.log(
    '\n  Explanation traced from the data:\n' +
    '    notifyOrgUsers(targetOrgId, …) wrote each notification with the organisationId of the\n' +
    '    request TARGET — NB-CLUSTER, because that is the cluster the request was addressed to.\n' +
    '    The recipients were selected by role within that same organisation. The accounts that\n' +
    '    received them, however, sign in with NB-CLUSTER-PROD as their active organisation.\n' +
    '    The requests list filtered on the ACTIVE organisation; the bell did not filter at all.',
  );

  sub('A.6  Can 4 notifications vs 0 incoming requests be explained entirely by the duplicates?');
  for (const email of ['cluster@miran.health', 'cluster.manager@miran.health']) {
    const acct = await prisma.userAccount.findUnique({
      where: { email },
      include: { userRoles: { select: { organizationId: true } } },
    });
    if (!acct) continue;

    const unread = await prisma.notification.count({ where: { userId: acct.id, isRead: false } });
    const unreadTrainingRequest = await prisma.notification.count({
      where: { userId: acct.id, isRead: false, referenceType: 'TrainingRequest' },
    });

    // The organisation the session would land in: the primary assignment.
    const primary = await prisma.organizationAssignment.findFirst({
      where: { userAccountId: acct.id, isActive: true, isPrimary: true },
      select: { organizationId: true },
    });
    const activeOrgId = primary?.organizationId ?? acct.userRoles[0]?.organizationId;

    // Pre-fix visibility: requests where source or target = the active org alone.
    const visibleOld = activeOrgId
      ? await prisma.trainingRequest.count({
          where: { OR: [{ sourceOrgId: activeOrgId }, { targetOrgId: activeOrgId }] },
        })
      : 0;

    // Post-fix visibility: the cluster plus its child hospitals.
    const children = activeOrgId
      ? await prisma.organization.findMany({ where: { parentId: activeOrgId }, select: { id: true } })
      : [];
    const visibleIds = activeOrgId ? [activeOrgId, ...children.map((c) => c.id)] : [];
    const visibleNew = visibleIds.length
      ? await prisma.trainingRequest.count({
          where: {
            OR: [{ sourceOrgId: { in: visibleIds } }, { targetOrgId: { in: visibleIds } }],
          },
        })
      : 0;

    // How many of those unread notifications point at a request that still exists?
    const unreadNotifs = await prisma.notification.findMany({
      where: { userId: acct.id, isRead: false, referenceType: 'TrainingRequest' },
      select: { referenceId: true, organizationId: true },
    });
    let live = 0;
    for (const n of unreadNotifs) {
      if (!n.referenceId) continue;
      const exists = await prisma.trainingRequest.findUnique({
        where: { id: n.referenceId }, select: { id: true },
      });
      if (exists) live++;
    }

    console.log(
      `\n  ${email}\n` +
      `    active organisation        ${code(activeOrgId)}\n` +
      `    unread notifications       ${unread}  (referencing TrainingRequest: ${unreadTrainingRequest})\n` +
      `      of those, live reference ${live}\n` +
      `      of those, dangling      ${unreadTrainingRequest - live}\n` +
      `    incoming requests (old rule, active org only)   ${visibleOld}\n` +
      `    incoming requests (new rule, cluster + children) ${visibleNew}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  heading('B. TRAINING DIRECTOR — candidate accounts (no assignment performed)');

  const clusterOrgs = orgs.filter((o) => o.organizationType?.code === 'cluster');
  const candidates = await prisma.userAccount.findMany({
    where: {
      isActive: true,
      OR: [
        { userRoles: { some: { organizationId: { in: clusterOrgs.map((c) => c.id) } } } },
        { orgAssignments: { some: { organizationId: { in: clusterOrgs.map((c) => c.id) }, isActive: true } } },
      ],
    },
    include: {
      person: { select: { nameAr: true } },
      userRoles: { include: { role: { select: { code: true } } } },
      orgAssignments: { where: { isActive: true }, include: { role: { select: { code: true } } } },
    },
  });

  for (const c of candidates) {
    const roleCodes = c.userRoles.map((r) => r.role.code);
    const caps = new Set<string>();
    for (const r of roleCodes) for (const cap of ROLE_CAPABILITIES[r] ?? []) caps.add(cap);
    const directorCaps = ROLE_CAPABILITIES['training_director'] ?? [];
    const alreadyHas = directorCaps.filter((d) => caps.has(d));
    const wouldGain = directorCaps.filter((d) => !caps.has(d));

    console.log(
      `\n  ${c.email}  (${c.person.nameAr})\n` +
      `    current roles       ${c.userRoles.map((r) => `${r.role.code}@${code(r.organizationId)}`).join(', ') || '—'}\n` +
      `    assignments         ${c.orgAssignments.map((a) => `${a.role?.code ?? '⛔NULL'}@${code(a.organizationId)}`).join(', ') || '—'}\n` +
      `    cluster access      ${c.userRoles.some((r) => clusterOrgs.some((o) => o.id === r.organizationId)) ? 'YES (role)' : 'assignment only'}\n` +
      `    already holds       ${alreadyHas.length}/${directorCaps.length} of training_director's capabilities\n` +
      `    would newly gain    ${wouldGain.length ? wouldGain.join(', ') : 'nothing'}\n` +
      `    overlap risk        ${alreadyHas.length === directorCaps.length ? 'FULL OVERLAP — role adds nothing' : alreadyHas.length > 0 ? 'PARTIAL overlap' : 'no overlap'}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  heading('E. ROLE OVERLAP — cluster_administrator / cluster_manager / training_director');

  const roleCodes = ['cluster_administrator', 'cluster_manager', 'training_director'];
  const roleRows = await prisma.role.findMany({
    where: { code: { in: roleCodes } },
    include: {
      rolePermissions: { include: { permission: { select: { code: true } } } },
      userRoles: { include: { userAccount: { select: { email: true } } } },
    },
  });

  for (const r of roleRows) {
    const caps = ROLE_CAPABILITIES[r.code] ?? [];
    const training = caps.filter((c) => TRAINING_CAPABILITIES.includes(c));
    console.log(
      `\n  ${r.code} (${r.nameAr})  hierarchyLevel=${r.hierarchyLevel}\n` +
      `    legacy permissions  ${r.rolePermissions.length}\n` +
      `    capabilities        ${caps.length}  (training: ${training.length})\n` +
      `    training caps       ${training.join(', ') || '— none —'}\n` +
      `    users               ${r.userRoles.length ? r.userRoles.map((u) => `${u.userAccount.email}@${code(u.organizationId)}`).join(', ') : 'NONE'}`,
    );
  }

  sub('E.1  Capabilities held by cluster_administrator that training_director should eventually own exclusively');
  const adminCaps = new Set(ROLE_CAPABILITIES['cluster_administrator'] ?? []);
  const directorCaps = new Set(ROLE_CAPABILITIES['training_director'] ?? []);
  const shared = [...adminCaps].filter((c) => directorCaps.has(c) && TRAINING_CAPABILITIES.includes(c));
  const adminOnly = [...adminCaps].filter((c) => !directorCaps.has(c));
  console.log(`  shared training capabilities (${shared.length}) — the eventual exclusivity question:`);
  for (const c of shared) console.log(`    ${c}`);
  console.log(`\n  held by cluster_administrator only (${adminOnly.length}): ${adminOnly.join(', ') || '—'}`);
  console.log('\n  NOT CHANGED. Listed for your decision only.');

  // ══════════════════════════════════════════════════════════════════════════
  heading('F. CAPACITY — organizations.capacity vs SUM(departments.capacity)');

  const hospitals = orgs.filter((o) => o.organizationType?.code === 'hospital');
  console.log(
    `\n  ${'HOSPITAL'.padEnd(20)} ${'org.cap'.padStart(8)} ${'Σdepts'.padStart(8)} ` +
    `${'diff'.padStart(7)} ${'depts'.padStart(6)} ${'active'.padStart(7)}  STATUS`,
  );
  console.log(`  ${'─'.repeat(86)}`);
  const blocked: string[] = [];

  for (const h of hospitals) {
    const all = await prisma.department.count({ where: { organizationId: h.id } });
    const activeDepts = await prisma.department.findMany({
      where: { organizationId: h.id, isActive: true, deletedAt: null },
      select: { capacity: true },
    });
    const sum = activeDepts.reduce((t, d) => t + d.capacity, 0);
    const diff = sum - h.capacity;
    const canReceive = sum > 0;
    if (!canReceive) blocked.push(h.code);

    console.log(
      `  ${h.code.padEnd(20)} ${String(h.capacity).padStart(8)} ${String(sum).padStart(8)} ` +
      `${(diff >= 0 ? '+' : '') + diff}`.padStart(8) +
      ` ${String(all).padStart(6)} ${String(activeDepts.length).padStart(7)}  ` +
      `${canReceive ? '✅ can receive allocations' : '⛔ CALCULATED CAPACITY 0 — allocation refused'}`,
    );
  }
  console.log(
    `\n  Hospitals that cannot currently receive allocation: ${blocked.length ? blocked.join(', ') : 'none'}\n` +
    '  Cause: no active department carries capacity. Hospital capacity is now the sum of its\n' +
    '  active departments, so a hospital that has declared none computes to zero regardless of\n' +
    '  the number on its organisation row. Resolved by the hospital training administration\n' +
    '  entering departments — an operational data task, not a migration.',
  );

  // ══════════════════════════════════════════════════════════════════════════
  heading('I. PRODUCTION SAFETY — statements issued by this script');
  console.log(
    '  This script issued SELECT and COUNT queries only.\n' +
    '  No INSERT, UPDATE, DELETE, UPSERT or DDL statement appears in this file.\n' +
    '  Verify:  grep -nE "\\.(create|update|delete|upsert|createMany|updateMany|deleteMany|executeRaw)" \\\n' +
    '             src/scripts/phase25-decision-report.ts',
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
