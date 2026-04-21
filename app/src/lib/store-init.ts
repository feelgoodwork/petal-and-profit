import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const DEFAULT_VENDORS = [
  { name: 'Asiri Blooms', invoice_type: 'digital_clean', extraction_method: 'programmatic' },
  { name: 'Bill Doran', invoice_type: 'digital_clean', extraction_method: 'claude_vision' },
  { name: 'CPF (Cleveland Plant & Flower)', invoice_type: 'scanned_dot_matrix', extraction_method: 'claude_vision' },
  { name: 'Dreisbach', invoice_type: 'scanned_handwritten', extraction_method: 'claude_vision' },
  { name: "Sam's Club", invoice_type: 'web_screenshot', extraction_method: 'claude_vision' },
  { name: 'Unknown', invoice_type: 'unknown', extraction_method: 'claude_vision' },
];

/**
 * Runs the full per-store schema against the given Neon database URL and
 * seeds the default vendor list. Idempotent — safe to re-run against a DB
 * that's already been initialized.
 */
export async function initStoreDatabase(databaseUrl: string): Promise<{
  schema_applied: boolean;
  vendors_seeded: number;
}> {
  const schemaPath = path.join(process.cwd(), 'src', 'lib', 'store-schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  const sql = neon(databaseUrl);

  // Split on semicolons that terminate a statement. Naive but safe for our
  // schema (no string literals with embedded semicolons). For each resulting
  // chunk, strip leading/trailing pure-comment lines so a chunk like
  // `-- header comment\nCREATE TABLE foo (...)` still runs the CREATE.
  const statements = schemaSql
    .split(/;\s*(?:\r?\n|$)/)
    .map(chunk => chunk
      .split(/\r?\n/)
      .filter(line => !/^\s*--/.test(line))
      .join('\n')
      .trim()
    )
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    await sql.query(stmt);
  }

  // Seed default vendors
  let vendorsSeeded = 0;
  for (const v of DEFAULT_VENDORS) {
    const result = await sql`
      INSERT INTO vendors (name, invoice_type, extraction_method)
      VALUES (${v.name}, ${v.invoice_type}, ${v.extraction_method})
      ON CONFLICT (name) DO NOTHING
      RETURNING id
    ` as Array<{ id: number }>;
    vendorsSeeded += result.length;
  }

  return { schema_applied: true, vendors_seeded: vendorsSeeded };
}
