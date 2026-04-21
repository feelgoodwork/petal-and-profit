import { NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/auth/require';
import { getDb } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface FindingRow {
  id: number;
  kind: string;
  subject_type: string | null;
  subject_id: number | null;
  details: Record<string, unknown>;
  status: string;
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const findingId = Number(id);
  if (!findingId) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const body = await request.json();
  const action = body.action as string;

  const sql = await getDb();
  const [finding] = (await sql`
    SELECT id, kind, subject_type, subject_id, details, status
    FROM data_quality_findings WHERE id = ${findingId}
  `) as unknown as FindingRow[];
  if (!finding) return NextResponse.json({ error: 'not found' }, { status: 404 });

  switch (action) {
    case 'dismiss': {
      await sql`
        UPDATE data_quality_findings
          SET status = 'dismissed', resolved_at = NOW(), resolved_by = ${auth.session.user_id}
          WHERE id = ${findingId}
      `;
      return NextResponse.json({ success: true });
    }

    case 'accept': {
      // Accept without auto-fix. Just marks the finding as acknowledged.
      await sql`
        UPDATE data_quality_findings
          SET status = 'accepted', resolved_at = NOW(), resolved_by = ${auth.session.user_id}
          WHERE id = ${findingId}
      `;
      return NextResponse.json({ success: true });
    }

    case 'apply_fix': {
      // Apply the standard per-kind fix and mark status='accepted'.
      const fixApplied = await applyFix(sql, finding);
      if (!fixApplied.ok) return NextResponse.json({ error: fixApplied.error }, { status: 400 });
      await sql`
        UPDATE data_quality_findings
          SET status = 'accepted', resolved_at = NOW(), resolved_by = ${auth.session.user_id}
          WHERE id = ${findingId}
      `;
      return NextResponse.json({ success: true, applied: fixApplied.action });
    }

    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }
}

type SqlClient = Awaited<ReturnType<typeof getDb>>;

async function applyFix(
  sql: SqlClient,
  finding: FindingRow,
): Promise<{ ok: true; action: string } | { ok: false; error: string }> {
  switch (finding.kind) {
    case 'price_outlier': {
      if (finding.subject_id == null) return { ok: false, error: 'no subject_id' };
      await sql`UPDATE ingredient_costs SET is_current = false WHERE id = ${finding.subject_id}`;
      return { ok: true, action: 'marked is_current=false' };
    }
    case 'not_a_flower': {
      if (finding.subject_id == null) return { ok: false, error: 'no subject_id' };
      await sql`UPDATE line_items SET is_flower = 0, review_status = 'reviewed' WHERE id = ${finding.subject_id}`;
      return { ok: true, action: 'flipped is_flower=0' };
    }
    case 'composite_description': {
      if (finding.subject_id == null) return { ok: false, error: 'no subject_id' };
      // Mark any cost records derived from this line as not-current
      await sql`
        UPDATE ingredient_costs SET is_current = false
        WHERE source_line_item_id = ${finding.subject_id}
      `;
      return { ok: true, action: 'demoted cost records from this composite line' };
    }
    case 'unused_catalog': {
      if (finding.subject_id == null) return { ok: false, error: 'no subject_id' };
      await sql`DELETE FROM flower_catalog WHERE id = ${finding.subject_id}`;
      return { ok: true, action: 'deleted catalog entry' };
    }
    case 'duplicate_catalog': {
      if (finding.subject_id == null) return { ok: false, error: 'no subject_id' };
      const keeperId = Number((finding.details as { keeper_id?: number }).keeper_id);
      if (!keeperId) return { ok: false, error: 'missing keeper_id in details' };
      await sql`UPDATE ingredient_costs SET flower_id = ${keeperId} WHERE flower_id = ${finding.subject_id}`;
      await sql`UPDATE recipe_ingredients SET flower_id = ${keeperId} WHERE flower_id = ${finding.subject_id}`;
      await sql`UPDATE flower_aliases SET flower_id = ${keeperId} WHERE flower_id = ${finding.subject_id}`;
      await sql`DELETE FROM flower_catalog WHERE id = ${finding.subject_id}`;
      return { ok: true, action: `consolidated onto id ${keeperId}, deleted duplicate` };
    }
    case 'recipe_cost_anomaly':
    case 'quantity_outlier':
      // These require human judgement — no auto-fix. Users should use
      // the accept action after manually addressing the underlying data.
      return { ok: false, error: 'no auto-fix for this kind; edit the underlying data then click Accept' };
    default:
      return { ok: false, error: `no auto-fix handler for kind "${finding.kind}"` };
  }
}
