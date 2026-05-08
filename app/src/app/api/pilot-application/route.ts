import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const REQUIRED = ['shop_name', 'city_state', 'biggest_unknown', 'contact_name', 'email'] as const;

function clean(value: unknown, max = 2000): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanList(value: unknown, maxItems = 10): string | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .slice(0, maxItems)
    .map((v) => v.trim().slice(0, 200));
  return items.length ? items.join(', ') : null;
}

export async function POST(request: Request) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  for (const field of REQUIRED) {
    if (!clean(body[field])) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const email = clean(body.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const sql = neon(url);

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

  const row = {
    shop_name: clean(body.shop_name)!,
    city_state: clean(body.city_state)!,
    years_in_business: clean(body.years_in_business),
    shop_type: clean(body.shop_type),
    annual_arrangements: clean(body.annual_arrangements),
    vendor_count: clean(body.vendor_count),
    recipe_count: clean(body.recipe_count),
    invoice_storage: cleanList(body.invoice_storage),
    biggest_unknown: clean(body.biggest_unknown, 4000)!,
    contact_name: clean(body.contact_name)!,
    contact_role: clean(body.contact_role),
    email,
    phone: clean(body.phone, 50),
    heard_about: clean(body.heard_about, 500),
  };

  const result = await sql`
    INSERT INTO pilot_applications (
      shop_name, city_state, years_in_business, shop_type,
      annual_arrangements, vendor_count, recipe_count, invoice_storage,
      biggest_unknown, contact_name, contact_role, email, phone, heard_about
    ) VALUES (
      ${row.shop_name}, ${row.city_state}, ${row.years_in_business}, ${row.shop_type},
      ${row.annual_arrangements}, ${row.vendor_count}, ${row.recipe_count}, ${row.invoice_storage},
      ${row.biggest_unknown}, ${row.contact_name}, ${row.contact_role}, ${row.email}, ${row.phone}, ${row.heard_about}
    )
    RETURNING id
  `;

  const pilotApplicationId = result[0]?.id ?? null;

  const ghlUrl = process.env.GHL_WEBHOOK_URL;
  if (ghlUrl) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const ghlRes = await fetch(ghlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...row,
          pilot_application_id: pilotApplicationId,
          submitted_at: new Date().toISOString(),
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!ghlRes.ok) {
        const text = await ghlRes.text().catch(() => '');
        console.error(`GHL webhook ${ghlRes.status} for application ${pilotApplicationId}: ${text}`);
      }
    } catch (err) {
      console.error(`GHL webhook failed for application ${pilotApplicationId}:`, err);
    }
  }

  return NextResponse.json({ ok: true, id: pilotApplicationId });
}
