// ============================================================================
// Production discrepancy report — READ ONLY.
//
// Diagnoses what a later migration would have to address, and writes nothing.
// Every query below is a SELECT; there is no update, delete or upsert anywhere in
// this file, and the client is opened without any write path being exercised.
//
// Run:  npx ts-node -O '{"module":"commonjs","moduleResolution":"node"}' \
//         src/scripts/production-discrepancy-report.ts
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { ROLE_CAPABILITIES, TRAINING_CAPABILITIES } from '../common/authz/capabilities';

const prisma = new PrismaClient();

/** Whether the Phase 2 additive migration has been applied to this database. */
async function hasPhase2Columns(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM information_schema.columns
     WHERE table_name = 'training_request_trainees' AND column_name = 'academic_intake_id'`,
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

function heading(title: string) {
  console.log(`\n${'═'.repeat(78)}\n${title}\n${'═'.repeat(78)}`);
}

async function main() {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true, code: true, nameAr: true, parentId: true, capacity: true, deletedAt: true,
      organizationType: { select: { code: true } },
    },
  });
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const name = (id?: string | null) => (id ? (byId.get(id)?.code ?? id) : '—');

  // ── 1. Capacity ────────────────────────────────────────────────────────────
  heading('1. CAPACITY — organizations.capacity vs SUM(active departments.capacity)');
  const hospitals = orgs.filter((o) => o.organizationType?.code === 'hospital' && !o.deletedAt);
  let capacityBlocking = 0;

  for (const h of hospitals) {
    const depts = await prisma.department.findMany({
      where: { organizationId: h.id, isActive: true, deletedAt: null },
      select: { capacity: true },
    });
    const sum = depts.reduce((t, d) => t + d.capacity, 0);
    const delta = sum - h.capacity;
    const flag = depts.length === 0 ? '  ⛔ NO DEPARTMENTS — computed capacity becomes 0' : '';
    if (depts.length === 0 && h.capacity > 0) capacityBlocking++;
    console.log(
      `  ${h.code.padEnd(20)} column=${String(h.capacity).padStart(4)}  ` +
        `depts=${String(depts.length).padStart(3)}  sum=${String(sum).padStart(4)}  ` +
        `delta=${delta > 0 ? '+' : ''}${delta}${flag}`,
    );
  }
  console.log(
    `\n  → ${capacityBlocking} hospital(s) declare capacity on the organisation row but have no\n` +
      '    departments. Under the new source of truth their capacity reads 0 and allocation\n' +
      '    to them is refused until their training administration enters departments.\n' +
      '    This is an operational data-entry task, not a migration; no rows are changed here.',
  );

  // ── 2. Duplicate organisations ─────────────────────────────────────────────
  heading('2. DUPLICATE ORGANISATIONS — candidates for a reviewed merge');
  const byType = new Map<string, typeof orgs>();
  for (const o of orgs) {
    const t = o.organizationType?.code ?? 'unknown';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(o);
  }
  for (const [type, list] of byType) {
    if (type !== 'cluster' && type !== 'university') continue;
    console.log(`\n  ${type}:`);
    for (const o of list) {
      const children = orgs.filter((c) => c.parentId === o.id).length;
      const [reqAsTarget, reqAsSource, userRoles] = await Promise.all([
        prisma.trainingRequest.count({ where: { targetOrgId: o.id } }),
        prisma.trainingRequest.count({ where: { sourceOrgId: o.id } }),
        prisma.userRole.count({ where: { organizationId: o.id } }),
      ]);
      console.log(
        `    ${o.code.padEnd(20)} parent=${name(o.parentId).padEnd(16)} children=${children}  ` +
          `requests(in/out)=${reqAsTarget}/${reqAsSource}  userRoles=${userRoles}`,
      );
    }
  }
  const orphanHospitals = hospitals.filter((h) => !h.parentId);
  if (orphanHospitals.length > 0) {
    console.log(
      `\n  ⛔ ${orphanHospitals.length} hospital(s) with no parent cluster: ` +
        orphanHospitals.map((h) => h.code).join(', '),
    );
    console.log('     Allocation refuses hospitals outside the requesting cluster, so these');
    console.log('     cannot receive trainees until they are attached to a cluster.');
  }

  // ── 3. Training request direction ──────────────────────────────────────────
  heading('3. TRAINING REQUESTS — direction validity (university → cluster)');
  const requests = await prisma.trainingRequest.findMany({
    select: {
      id: true, requestNumber: true, status: true, sourceOrgId: true, targetOrgId: true,
      studentCount: true, academicIntakeId: true,
      _count: { select: { trainees: true } },
    },
  });
  for (const r of requests) {
    const src = byId.get(r.sourceOrgId)?.organizationType?.code;
    const tgt = byId.get(r.targetOrgId)?.organizationType?.code;
    const valid = (src === 'university' || src === 'college') && tgt === 'cluster';
    console.log(
      `  ${r.requestNumber.padEnd(16)} ${r.status.padEnd(18)} ` +
        `${name(r.sourceOrgId)}(${src}) → ${name(r.targetOrgId)}(${tgt})  ` +
        `students=${r.studentCount} traineeRows=${r._count.trainees}  ` +
        `${valid ? '✅' : '⛔ INVALID DIRECTION — creation of such a request is now refused'}`,
    );
  }

  // ── 4. Batch provenance ────────────────────────────────────────────────────
  // The Phase 2 columns may not exist yet on the target database — that is the
  // expected state for production until the migration is approved. Report what is
  // there rather than failing.
  heading('4. ACADEMIC BATCHES — provenance');
  const migrated = await hasPhase2Columns();
  if (!migrated) {
    console.log('  ⓘ Phase 2 columns are not present on this database.');
    console.log('    academic_intakes.training_request_id / approved_by / university_org_id');
    console.log('    training_request_trainees.academic_intake_id');
    console.log('    trainee_allocations (table)');
    console.log('    → The migration has not been applied here. Reporting pre-migration state.');
    const legacy = await prisma.$queryRawUnsafe<Array<{ code: string; organization_id: string }>>(
      'SELECT code, organization_id FROM academic_intakes',
    );
    if (legacy.length === 0) console.log('  (no batches)');
    for (const i of legacy) {
      console.log(
        `  ${i.code.padEnd(24)} org=${name(i.organization_id).padEnd(18)} ` +
          'sourceRequest=⛔ column does not exist yet',
      );
    }
  } else {
    const intakes = await prisma.academicIntake.findMany({
      select: {
        id: true, code: true, organizationId: true, trainingRequestId: true,
        approvedById: true, _count: { select: { traineeProfiles: true, traineeRows: true } },
      },
    });
    if (intakes.length === 0) console.log('  (none)');
    for (const i of intakes) {
      console.log(
        `  ${i.code.padEnd(24)} org=${name(i.organizationId).padEnd(18)} ` +
          `sourceRequest=${i.trainingRequestId ?? '⛔ NONE'}  approvedBy=${i.approvedById ?? '—'}  ` +
          `profiles=${i._count.traineeProfiles} rows=${i._count.traineeRows}`,
      );
    }
  }

  // ── 5. Trainees without provenance ─────────────────────────────────────────
  heading('5. TRAINEES — provenance chain');
  const [profileTotal, profilesNoIntake, rowTotal] = await Promise.all([
    prisma.traineeProfile.count(),
    prisma.traineeProfile.count({ where: { academicIntakeId: null } }),
    prisma.trainingRequestTrainee.count(),
  ]);
  const rowsNoIntake = migrated
    ? await prisma.trainingRequestTrainee.count({ where: { academicIntakeId: null } })
    : rowTotal;
  console.log(`  trainee_profiles:          ${profileTotal} (no batch: ${profilesNoIntake})`);
  console.log(
    `  training_request_trainees: ${rowTotal} (no batch: ${rowsNoIntake}` +
      `${migrated ? '' : ' — column absent, all rows unlinked by definition'})`,
  );
  console.log(
    '\n  → Profiles with no batch have no request behind them: nothing in the data says which\n' +
      '    university requested them or who approved it. New trainees always carry the chain;\n' +
      '    backfilling the existing ones needs a business decision about which request they\n' +
      '    belong to, and cannot be inferred safely.',
  );

  // ── 6. Dangling notifications ──────────────────────────────────────────────
  heading('6. NOTIFICATIONS — references to records that no longer exist');
  const notifications = await prisma.notification.findMany({
    where: { referenceId: { not: null } },
    select: {
      id: true, type: true, referenceType: true, referenceId: true,
      organizationId: true, isRead: true, user: { select: { email: true } },
    },
  });
  const dangling: typeof notifications = [];
  for (const n of notifications) {
    if (!n.referenceId) continue;
    let exists = true;
    if (n.referenceType === 'TrainingRequest') {
      exists = !!(await prisma.trainingRequest.findUnique({
        where: { id: n.referenceId }, select: { id: true },
      }));
    } else if (n.referenceType === 'TrainingRequestTrainee') {
      exists = !!(await prisma.trainingRequestTrainee.findUnique({
        where: { id: n.referenceId }, select: { id: true },
      }));
    }
    if (!exists) dangling.push(n);
  }
  console.log(`  total with a reference: ${notifications.length}`);
  console.log(`  dangling:               ${dangling.length}`);
  for (const d of dangling) {
    console.log(
      `    ${d.type.padEnd(34)} org=${name(d.organizationId).padEnd(18)} ` +
        `to=${d.user.email.padEnd(30)} read=${d.isRead} ref=${d.referenceId}`,
    );
  }
  console.log(
    '\n  → These are now hidden from both the feed and the unread count at read time, so the\n' +
      '    bell can no longer contradict the requests list. The rows themselves are untouched;\n' +
      '    deleting them is a separate, reviewed migration.',
  );

  // ── 7. Roleless memberships (the privilege leak) ────────────────────────────
  heading('7. ROLELESS MEMBERSHIPS — accounts that could enter a context with no role');
  const roleless = await prisma.organizationAssignment.findMany({
    where: { roleId: null, isActive: true },
    select: {
      id: true, organizationId: true, userAccountId: true,
      userAccount: { select: { email: true } },
    },
  });
  const affected: string[] = [];
  for (const a of roleless) {
    const alsoHasUserRole = await prisma.userRole.count({
      where: { userAccountId: a.userAccountId, organizationId: a.organizationId },
    });
    const stillReachable = alsoHasUserRole > 0;
    if (!stillReachable) affected.push(`${a.userAccount.email} @ ${name(a.organizationId)}`);
  }
  console.log(`  roleless active assignments: ${roleless.length}`);
  console.log(`  contexts now closed:         ${affected.length}`);
  for (const a of affected) console.log(`    ${a}`);
  console.log(
    '\n  → Intended. Each of these was a context the account could switch into and receive a\n' +
      '    session with no roles and no capabilities. No user loses a context in which they\n' +
      '    actually hold a role.',
  );

  // ── 8. Role impact of the capability model ─────────────────────────────────
  heading('8. ROLE IMPACT — who loses or gains training authority');
  const roles = await prisma.role.findMany({
    include: {
      userRoles: { include: { userAccount: { select: { email: true } } } },
      rolePermissions: { include: { permission: { select: { code: true } } } },
    },
  });
  for (const role of roles) {
    const caps = ROLE_CAPABILITIES[role.code] ?? [];
    const trainingCaps = caps.filter((c) => TRAINING_CAPABILITIES.includes(c));
    if (role.userRoles.length === 0 && trainingCaps.length === 0) continue;
    console.log(
      `\n  ${role.code} (${role.nameAr})  users=${role.userRoles.length}  ` +
        `legacyPerms=${role.rolePermissions.length}  trainingCaps=${trainingCaps.length}`,
    );
    if (trainingCaps.length > 0) console.log(`    training: ${trainingCaps.join(', ')}`);
    if (role.userRoles.length > 0) {
      console.log(
        `    holders: ${role.userRoles.map((u) => `${u.userAccount.email}@${name(u.organizationId)}`).join(', ')}`,
      );
    }
  }

  heading('SUMMARY — nothing above was modified. This report is read-only.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
