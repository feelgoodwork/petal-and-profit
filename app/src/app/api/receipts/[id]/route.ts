import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sql = await getDb();
    const numId = Number(id);

    const [receipt] = await sql`
      SELECT r.*, v.name as vendor_name
      FROM receipts r
      JOIN vendors v ON r.vendor_id = v.id
      WHERE r.id = ${numId}
    `;

    if (!receipt) {
      return Response.json({ error: 'Receipt not found' }, { status: 404 });
    }

    const items = await sql`
      SELECT * FROM line_items WHERE receipt_id = ${numId} ORDER BY line_number
    `;

    return Response.json({ ...receipt, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
