import { getControlDb } from '@/lib/control-db';
import { randomBytes, createHash } from 'crypto';

export interface SessionRow {
  token: string;
  user_id: number;
  active_store_id: number | null;
  expires_at: string;
}

export interface SessionContext {
  user_id: number;
  email: string;
  is_superadmin: boolean;
  active_store_id: number | null;
  store_slug: string | null;
  store_name: string | null;
  database_url: string | null;
}

const DEFAULT_SESSION_DAYS = 14;

function newToken(): string {
  // 32 random bytes, hex-encoded = 64 chars. Stored raw so server-side lookup
  // is a simple primary-key hit.
  return randomBytes(32).toString('hex');
}

/**
 * Opaque hash for logging/debugging — never include the raw token in logs.
 */
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

export async function createSession(
  userId: number,
  activeStoreId: number | null,
  days = DEFAULT_SESSION_DAYS,
): Promise<string> {
  const sql = getControlDb();
  const token = newToken();
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO sessions (token, user_id, active_store_id, expires_at)
    VALUES (${token}, ${userId}, ${activeStoreId}, ${expires.toISOString()})
  `;
  return token;
}

/**
 * Resolve a session cookie to the full context (user + active store + URL).
 * Returns null if the session is missing, expired, or points at a
 * now-deleted/inactive store.
 */
export async function loadSession(token: string | undefined): Promise<SessionContext | null> {
  if (!token) return null;
  const sql = getControlDb();

  const rows = await sql`
    SELECT
      s.token, s.user_id, s.active_store_id, s.expires_at,
      u.email, u.is_superadmin,
      st.id AS store_id, st.slug AS store_slug, st.name AS store_name,
      st.database_url, st.is_active AS store_is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN stores st ON st.id = s.active_store_id
    WHERE s.token = ${token}
    LIMIT 1
  ` as Array<{
    token: string;
    user_id: number;
    active_store_id: number | null;
    expires_at: string;
    email: string;
    is_superadmin: boolean;
    store_id: number | null;
    store_slug: string | null;
    store_name: string | null;
    database_url: string | null;
    store_is_active: boolean | null;
  }>;

  if (rows.length === 0) return null;
  const r = rows[0];
  if (new Date(r.expires_at).getTime() < Date.now()) return null;

  // Refresh last_used_at in the background — don't block the caller.
  sql`UPDATE sessions SET last_used_at = NOW() WHERE token = ${token}`.catch(() => {});

  return {
    user_id: r.user_id,
    email: r.email,
    is_superadmin: r.is_superadmin,
    active_store_id: r.active_store_id,
    store_slug: r.store_slug,
    store_name: r.store_name,
    database_url: r.store_is_active ? r.database_url : null,
  };
}

export async function setActiveStore(token: string, storeId: number): Promise<void> {
  const sql = getControlDb();
  await sql`UPDATE sessions SET active_store_id = ${storeId} WHERE token = ${token}`;
}

export async function destroySession(token: string): Promise<void> {
  const sql = getControlDb();
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

export async function userStores(userId: number): Promise<Array<{ id: number; slug: string; name: string }>> {
  const sql = getControlDb();
  const rows = await sql`
    SELECT st.id, st.slug, st.name
    FROM user_stores us
    JOIN stores st ON st.id = us.store_id
    WHERE us.user_id = ${userId} AND st.is_active = true
    ORDER BY st.name
  ` as Array<{ id: number; slug: string; name: string }>;
  return rows;
}

export async function allStores(): Promise<Array<{ id: number; slug: string; name: string }>> {
  const sql = getControlDb();
  const rows = await sql`
    SELECT id, slug, name FROM stores WHERE is_active = true ORDER BY name
  ` as Array<{ id: number; slug: string; name: string }>;
  return rows;
}
