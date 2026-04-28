import { NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { buildComparison } from '@/lib/truth-comparison';

export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) return auth.response;

  const sql = await getDb();
  const report = await buildComparison(sql);
  return NextResponse.json(report);
}
