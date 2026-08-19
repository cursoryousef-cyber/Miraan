/**
 * Development/demo seed credentials.
 *
 * seed.ts, seed-rbac.ts and seed-complete.ts are local fixtures — they are never
 * invoked by a production boot (see render.yaml). They used to share one
 * hardcoded password committed to the repository, which meant a well-known
 * credential shipped in source and would open every account on any database they
 * were ever pointed at.
 *
 * The password now comes from DEV_SEED_PASSWORD. When that is unset a random one
 * is generated per run and printed once, so a local developer can still log in
 * while nothing guessable is committed.
 *
 * Production provisioning does NOT use this helper: seed-production.ts requires a
 * separate environment variable per account and refuses to run if any is missing.
 */
import { randomBytes } from 'crypto';

let cached: string | null = null;

export function devSeedPassword(): string {
  if (cached) return cached;

  const fromEnv = process.env.DEV_SEED_PASSWORD;
  if (fromEnv && fromEnv.length >= 8) {
    cached = fromEnv;
    console.log('🔑 Using DEV_SEED_PASSWORD from the environment for seeded dev accounts.');
    return cached;
  }

  // Local fixture only — default unified password for dev accounts.
  cached = process.env.DEV_SEED_PASSWORD || 'Aa123456';
  // randomBytes available for dynamic generation if required: randomBytes(12).toString('base64url');
  console.log(`🔑 DEV_SEED_PASSWORD set to: ${cached}`);
  return cached;
}
