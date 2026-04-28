import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const ALLOWED_STATUSES = new Set(['new', 'reviewing', 'accepted', 'declined']);

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  return neon(url);
}

export async function GET() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS pilot_applications (
      id                 SERIAL PRIMARY KEY,
      shop_name          TEXT NOT NULL,
      city_state         TEXT NOT NULL,
      years_in_business  TEXT,
      shop_type          TEXT,
      annual_arrangements TEXT,
      vendor_count       TEXT,
      recipe_count       TEXT,
      invoice_storage    TEXT,
      biggest_unknown    TEXT,
      contact_name       TEXT NOT NULL,
      contact_role       TEXT,
      email              TEXT NOT NULL,
      phone              TEXT,
      heard_about        TEXT,
      status             TEXT NOT NULL DEFAULT 'new',
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const rows = await sql`SELECT * FROM pilot_applications ORDER BY created_at DESC`;
  return NextResponse.json({ applications: rows });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  const status = String(body.status || '').trim();

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const sql = getSql();
  await sql`UPDATE pilot_applications SET status = ${status} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
