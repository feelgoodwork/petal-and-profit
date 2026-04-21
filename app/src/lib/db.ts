import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { cookies } from 'next/headers';
import { loadSession } from '@/lib/auth/sessions';
import { isControlDbConfigured } from '@/lib/control-db';

export type SQL = NeonQueryFunction<false, false>;

// Cache one Neon client per database URL so we don't re-create on every
// request. The @neondatabase/serverless client is cheap but not free.
const _clients = new Map<string, SQL>();

function clientFor(url: string): SQL {
  let client = _clients.get(url);
  if (!client) {
    client = neon(url);
    _clients.set(url, client);
  }
  return client;
}

const AUTH_COOKIE = 'pp_auth';

/**
 * Resolve the per-request store database client.
 *
 * Resolution order:
 *   1. If CONTROL_DATABASE_URL is set AND the request has a valid session
 *      cookie pointing at an active store → use that store's database_url.
 *   2. Otherwise → fall back to DATABASE_URL env var (legacy / single-tenant
 *      mode). This keeps the app working until the control DB is provisioned
 *      and users are seeded.
 *
 * Throws only if neither path produces a URL.
 */
export async function getDb(): Promise<SQL> {
  if (isControlDbConfigured()) {
    try {
      const store = await cookies();
      const token = store.get(AUTH_COOKIE)?.value;
      if (token) {
        const session = await loadSession(token);
        if (session?.database_url) return clientFor(session.database_url);
      }
    } catch {
      // cookies() throws outside a request scope (e.g. during local scripts).
      // Fall through to env var.
    }
  }

  const envUrl = process.env.DATABASE_URL;
  if (!envUrl) {
    throw new Error('No database URL available: no session store, and DATABASE_URL is not set.');
  }
  return clientFor(envUrl);
}

/**
 * Direct access to a DB by URL. Use inside scripts or background jobs that
 * don't run in a Next.js request scope.
 */
export function getDbByUrl(url: string): SQL {
  return clientFor(url);
}

export async function runMigrations(): Promise<void> {
  const sql = await getDb();
  await sql`SELECT 1`;
}

export async function seedVendors(): Promise<void> {
  const sql = await getDb();

  const vendors = [
    { name: 'Asiri Blooms', invoice_type: 'digital_clean', extraction_method: 'programmatic' },
    { name: 'Bill Doran', invoice_type: 'digital_clean', extraction_method: 'claude_vision' },
    { name: 'CPF (Cleveland Plant & Flower)', invoice_type: 'scanned_dot_matrix', extraction_method: 'claude_vision' },
    { name: 'Dreisbach', invoice_type: 'scanned_handwritten', extraction_method: 'claude_vision' },
    { name: "Sam's Club", invoice_type: 'web_screenshot', extraction_method: 'claude_vision' },
    { name: 'Budzi', invoice_type: 'unknown', extraction_method: 'claude_vision' },
    { name: 'Claprood', invoice_type: 'unknown', extraction_method: 'claude_vision' },
    { name: 'Virgin Direct', invoice_type: 'unknown', extraction_method: 'claude_vision' },
    { name: 'Xerox Scan (Unknown Vendor)', invoice_type: 'scanned_mixed', extraction_method: 'claude_vision' },
    { name: 'Unknown', invoice_type: 'unknown', extraction_method: 'claude_vision' },
  ];

  for (const v of vendors) {
    await sql`INSERT INTO vendors (name, invoice_type, extraction_method) VALUES (${v.name}, ${v.invoice_type}, ${v.extraction_method}) ON CONFLICT (name) DO NOTHING`;
  }
}
