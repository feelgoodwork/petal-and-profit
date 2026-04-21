import { neon, NeonQueryFunction } from '@neondatabase/serverless';

export type SQL = NeonQueryFunction<false, false>;

let _sql: SQL | null = null;

/**
 * Returns the control-plane DB client (for users, stores, sessions).
 *
 * Separate from the per-store DB so customer data stays in its own Neon
 * database. Reads CONTROL_DATABASE_URL at first call and caches.
 */
export function getControlDb(): SQL {
  if (_sql) return _sql;
  const url = process.env.CONTROL_DATABASE_URL;
  if (!url) {
    throw new Error(
      'CONTROL_DATABASE_URL is not set. Provision a Neon control DB and run scripts/init-control-db.js.',
    );
  }
  _sql = neon(url);
  return _sql;
}

export function isControlDbConfigured(): boolean {
  return !!process.env.CONTROL_DATABASE_URL;
}
