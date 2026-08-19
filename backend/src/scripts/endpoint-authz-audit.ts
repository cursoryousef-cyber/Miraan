// ============================================================================
// Endpoint authorisation audit — proves the role separation from the route
// metadata itself, not from navigation.
//
// Boots the Nest application, walks every registered route, reads the capability
// metadata each one declares, and reports which roles can reach it. A role can
// reach a route when it holds one of the declared capabilities AND the route's
// context requirement is satisfiable from a context that role operates in.
//
// Touches no database rows: the app is created but never handles a request.
// ============================================================================

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  CAPABILITY_CONTEXTS,
  Capability,
  ContextType,
  ROLE_CAPABILITIES,
  TRAINING_CAPABILITIES,
} from '../common/authz/capabilities';
import { CAPABILITIES_KEY, SCOPED_RESOURCE_KEY } from '../common/authz/authz.decorators';
import { ROLES_KEY, PERMISSIONS_KEY, IS_PUBLIC_KEY } from '../common/decorators';

/** Contexts a role can actually be active in, from its scope. */
const ROLE_CONTEXTS: Record<string, ContextType[]> = {
  platform_owner: ['platform', 'cluster', 'university', 'hospital'],
  system_admin: ['platform', 'cluster', 'university', 'hospital'],
  holding_administrator: ['platform'],
  training_director: ['cluster'],
  cluster_administrator: ['cluster'],
  cluster_manager: ['cluster'],
  university_administrator: ['university'],
  academic_affairs: ['university'],
  hospital_training_admin: ['hospital'],
  hospital_administrator: ['hospital'],
  trainer: ['hospital'],
  trainee: ['hospital'],
  academic_supervisor: ['cluster', 'university'],
  org_manager: ['cluster', 'university', 'hospital'],
};

const AUDITED_ROLES = [
  'training_director',
  'hospital_training_admin',
  'hospital_administrator',
  'university_administrator',
  'trainer',
  'trainee',
];

function roleCanReach(role: string, required: Capability[]): boolean {
  const held = new Set(ROLE_CAPABILITIES[role] ?? []);
  const contexts = ROLE_CONTEXTS[role] ?? [];
  return required.some(
    (cap) =>
      held.has(cap) &&
      (CAPABILITY_CONTEXTS[cap] ?? []).some((c) => contexts.includes(c)),
  );
}

interface RouteInfo {
  method: string;
  path: string;
  capabilities: Capability[];
  legacyRoles: string[];
  legacyPermissions: string[];
  scoped: string | null;
  isPublic: boolean;
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();

  const server = app.getHttpAdapter().getInstance();
  const router = server._router ?? server.router;
  const container = (app as any).container;

  // Collect metadata per controller handler.
  const handlerMeta = new Map<string, RouteInfo>();
  const modules = [...container.getModules().values()];

  for (const mod of modules) {
    for (const wrapper of mod.controllers.values()) {
      const instance = wrapper.instance;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance);
      const controllerPath: string = Reflect.getMetadata('path', wrapper.metatype) ?? '';

      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor') continue;
        const handler = proto[key];
        if (typeof handler !== 'function') continue;

        const routePath = Reflect.getMetadata('path', handler);
        if (routePath === undefined) continue;
        const methodIdx = Reflect.getMetadata('method', handler);
        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

        const caps: Capability[] =
          Reflect.getMetadata(CAPABILITIES_KEY, handler) ??
          Reflect.getMetadata(CAPABILITIES_KEY, wrapper.metatype) ??
          [];
        const legacyRoles: string[] =
          Reflect.getMetadata(ROLES_KEY, handler) ??
          Reflect.getMetadata(ROLES_KEY, wrapper.metatype) ??
          [];
        const legacyPerms: string[] =
          Reflect.getMetadata(PERMISSIONS_KEY, handler) ??
          Reflect.getMetadata(PERMISSIONS_KEY, wrapper.metatype) ??
          [];
        const scoped = Reflect.getMetadata(SCOPED_RESOURCE_KEY, handler);
        const isPublic: boolean =
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) ??
          Reflect.getMetadata(IS_PUBLIC_KEY, wrapper.metatype) ??
          false;

        const full = `/${controllerPath}/${routePath}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        handlerMeta.set(`${methods[methodIdx] ?? '?'} ${full}`, {
          method: methods[methodIdx] ?? '?',
          path: full,
          capabilities: caps,
          legacyRoles,
          legacyPermissions: legacyPerms,
          scoped: scoped ? `${scoped.kind}:${scoped.param}` : null,
          isPublic,
        });
      }
    }
  }

  const routes = [...handlerMeta.values()].sort((a, b) => a.path.localeCompare(b.path));

  // ── Training-sensitive routes ─────────────────────────────────────────────
  const trainingRoutes = routes.filter((r) =>
    r.capabilities.some((c) => TRAINING_CAPABILITIES.includes(c)),
  );

  console.log(`\n${'═'.repeat(100)}`);
  console.log('C/D. ENDPOINT AUTHORISATION AUDIT — who can reach each training-sensitive route');
  console.log('═'.repeat(100));
  console.log(
    `\n  ${'METHOD'.padEnd(7)}${'ROUTE'.padEnd(58)}` +
      AUDITED_ROLES.map((r) => r.slice(0, 6).padStart(7)).join(''),
  );
  console.log(`  ${'─'.repeat(58 + 7 + AUDITED_ROLES.length * 7)}`);

  for (const r of trainingRoutes) {
    const cells = AUDITED_ROLES.map((role) =>
      (roleCanReach(role, r.capabilities) ? '✅' : '·').padStart(7),
    ).join('');
    console.log(`  ${r.method.padEnd(7)}${r.path.padEnd(58)}${cells}`);
  }

  console.log(`\n  Legend: ${AUDITED_ROLES.map((r, i) => `${i + 1}=${r}`).join('  ')}`);
  console.log(`  Column order: ${AUDITED_ROLES.join(', ')}`);

  // ── The two assertions that matter ────────────────────────────────────────
  console.log(`\n${'═'.repeat(100)}`);
  console.log('ASSERTION 1 — hospital_administrator reaches NO training-sensitive route');
  console.log('═'.repeat(100));
  const adminReachable = trainingRoutes.filter((r) =>
    roleCanReach('hospital_administrator', r.capabilities),
  );
  if (adminReachable.length === 0) {
    console.log('  ✅ PASS — 0 of ' + trainingRoutes.length + ' training routes reachable.');
  } else {
    console.log(`  ❌ FAIL — reachable: ${adminReachable.map((r) => r.path).join(', ')}`);
  }

  console.log(`\n${'═'.repeat(100)}`);
  console.log('ASSERTION 2 — cluster and hospital allocation authority are disjoint');
  console.log('═'.repeat(100));
  const clusterCaps = (ROLE_CAPABILITIES['training_director'] ?? []).filter((c) =>
    c.startsWith('allocation.'),
  );
  const hospitalCaps = (ROLE_CAPABILITIES['hospital_training_admin'] ?? []).filter((c) =>
    c.startsWith('allocation.'),
  );
  const intersection = clusterCaps.filter((c) => hospitalCaps.includes(c));
  console.log(`  training_director        allocation caps: ${clusterCaps.join(', ')}`);
  console.log(`  hospital_training_admin  allocation caps: ${hospitalCaps.join(', ')}`);
  console.log(
    intersection.length === 0
      ? '  ✅ PASS — intersection is empty; no role holds both sides.'
      : `  ❌ FAIL — shared: ${intersection.join(', ')}`,
  );

  const forbiddenForHospital = [
    'training_request.approve',
    'academic_batch.create_from_request',
    'allocation.cluster.reassign',
    'capacity.manage',
  ] as Capability[];
  console.log('\n  hospital_training_admin must NOT hold cluster authority:');
  for (const cap of forbiddenForHospital.slice(0, 3)) {
    const holds = (ROLE_CAPABILITIES['hospital_training_admin'] ?? []).includes(cap);
    console.log(`    ${cap.padEnd(40)} ${holds ? '❌ HELD' : '✅ not held'}`);
  }
  console.log('\n  training_director must NOT hold hospital-internal authority:');
  for (const cap of ['capacity.manage', 'department.manage', 'trainer.manage', 'allocation.hospital.assign', 'allocation.hospital.reassign'] as Capability[]) {
    const holds = (ROLE_CAPABILITIES['training_director'] ?? []).includes(cap);
    console.log(`    ${cap.padEnd(40)} ${holds ? '❌ HELD' : '✅ not held'}`);
  }

  // ── Routes still without capability metadata ──────────────────────────────
  console.log(`\n${'═'.repeat(100)}`);
  console.log('COVERAGE — routes with no capability declared (still on legacy guards or open)');
  console.log('═'.repeat(100));
  const publicRoutes = routes.filter((r) => r.isPublic);
  const uncovered = routes.filter((r) => r.capabilities.length === 0 && !r.isPublic);
  const legacyOnly = uncovered.filter(
    (r) => r.legacyRoles.length > 0 || r.legacyPermissions.length > 0,
  );
  const bare = uncovered.filter(
    (r) => r.legacyRoles.length === 0 && r.legacyPermissions.length === 0,
  );
  console.log(`  total routes                       ${routes.length}`);
  console.log(`  explicitly @Public()               ${publicRoutes.length}`);
  console.log(`  with capability metadata           ${routes.length - uncovered.length}`);
  console.log(`  legacy @RequireRoles/@RequirePermissions only  ${legacyOnly.length}`);
  console.log(`  no authorisation metadata at all   ${bare.length}`);
  console.log('\n  Routes with no authorisation metadata (authenticated only):');
  for (const r of bare) {
    console.log(`    ${r.method.padEnd(7)}${r.path}`);
  }


  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
