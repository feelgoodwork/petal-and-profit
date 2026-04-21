import { NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/auth/require';
import { getDb } from '@/lib/db';

interface FindingRow {
  id: number;
  kind: string;
  severity: string;
  subject_type: string | null;
  subject_id: number | null;
  summary: string;
  details: Record<string, unknown>;
  suggested_fix: string | null;
  rule_snippet: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export async function GET(request: Request) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'open';
  const kind = url.searchParams.get('kind');

  const sql = await getDb();
  let rows: FindingRow[];
  if (kind) {
    rows = (await sql`
      SELECT id, kind, severity, subject_type, subject_id, summary, details,
             suggested_fix, rule_snippet, status, created_at, resolved_at
      FROM data_quality_findings
      WHERE status = ${status} AND kind = ${kind}
      ORDER BY
        CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        created_at DESC
    `) as unknown as FindingRow[];
  } else {
    rows = (await sql`
      SELECT id, kind, severity, subject_type, subject_id, summary, details,
             suggested_fix, rule_snippet, status, created_at, resolved_at
      FROM data_quality_findings
      WHERE status = ${status}
      ORDER BY
        CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        created_at DESC
    `) as unknown as FindingRow[];
  }

  const countsRaw = (await sql`
    SELECT kind, status, COUNT(*)::int AS n
    FROM data_quality_findings
    GROUP BY kind, status
  `) as unknown as Array<{ kind: string; status: string; n: number }>;

  return NextResponse.json({ findings: rows, counts: countsRaw });
}
