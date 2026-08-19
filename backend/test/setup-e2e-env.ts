/**
 * Points the e2e suite at the local test database before Nest boots.
 *
 * Loaded via jest `setupFiles` so it runs before any module reads
 * process.env — a .env loaded by ConfigModule would otherwise win and the suite
 * would run against whatever DATABASE_URL the developer last used, which for this
 * project is a managed production database.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });

const url = process.env.DATABASE_URL ?? '';
if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
  throw new Error(
    `e2e suite refuses to run: DATABASE_URL is not local. Check backend/.env.test`,
  );
}
