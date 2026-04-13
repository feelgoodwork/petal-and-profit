import { neon, NeonQueryFunction } from '@neondatabase/serverless';

export type SQL = NeonQueryFunction<false, false>;

let _sql: SQL | null = null;

export function getDb(): SQL {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    _sql = neon(url);
  }
  return _sql;
}

export async function runMigrations(): Promise<void> {
  const sql = getDb();
  // Tables are created by the migration script. Just verify connection.
  await sql`SELECT 1`;
}

export async function seedVendors(): Promise<void> {
  const sql = getDb();

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
