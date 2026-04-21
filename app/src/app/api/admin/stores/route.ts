import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireSuperadmin } from '@/lib/auth/require';
import { getControlDb } from '@/lib/control-db';
import { setActiveStore } from '@/lib/auth/sessions';
import { initStoreDatabase } from '@/lib/store-init';

const COOKIE_NAME = 'pp_auth';
const SLUG_REGEX = /^[a-z][a-z0-9-]{1,40}$/;

export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) return auth.response;

  const sql = getControlDb();
  const rows = await sql`
    SELECT id, slug, name, notes, is_active, created_at,
      (SELECT COUNT(*)::int FROM user_stores WHERE store_id = s.id) AS member_count
    FROM stores s
    ORDER BY created_at DESC
  `;
  return NextResponse.json({ stores: rows });
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const name = String(body.name || '').trim();
  const slug = String(body.slug || '').trim().toLowerCase();
  const databaseUrl = String(body.database_url || '').trim();
  const notes = body.notes ? String(body.notes).trim() : null;
  const autoSwitch = body.auto_switch !== false;

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase alphanumeric + hyphens, 2-40 chars, starting with a letter' },
      { status: 400 },
    );
  }
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    return NextResponse.json({ error: 'database_url must be a postgres connection string' }, { status: 400 });
  }

  const sql = getControlDb();

  // Guard against slug collision
  const existing = await sql`SELECT id FROM stores WHERE slug = ${slug}` as Array<{ id: number }>;
  if (existing.length > 0) {
    return NextResponse.json({ error: `slug "${slug}" is already taken` }, { status: 409 });
  }

  // Actually run the schema against the new Neon DB before we register it —
  // if the URL is bad or the DB is unreachable, fail fast.
  let initResult;
  try {
    initResult = await initStoreDatabase(databaseUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: `Schema init failed: ${msg}` }, { status: 500 });
  }

  const [store] = await sql`
    INSERT INTO stores (slug, name, database_url, notes)
    VALUES (${slug}, ${name}, ${databaseUrl}, ${notes})
    RETURNING id, slug, name, is_active, created_at
  ` as Array<{ id: number; slug: string; name: string; is_active: boolean; created_at: string }>;

  // Grant the creator owner access on the new store (superadmin already sees
  // everything, but having a membership row keeps the switcher tidy).
  await sql`
    INSERT INTO user_stores (user_id, store_id, role)
    VALUES (${auth.session.user_id}, ${store.id}, 'owner')
    ON CONFLICT DO NOTHING
  `;

  // Auto-switch the session to the new store so the creator can immediately
  // upload data via /receipts, /recipes, etc.
  if (autoSwitch) {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (token) await setActiveStore(token, store.id);
  }

  return NextResponse.json({
    store,
    init: initResult,
    switched_to: autoSwitch,
  });
}
