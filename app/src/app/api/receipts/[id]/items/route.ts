import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const sql = getDb();
    const numId = Number(id);

    if (body.item_id) {
      const itemId = Number(body.item_id);
      if (body.description !== undefined) {
        await sql`UPDATE line_items SET description = ${body.description}, review_status = 'edited', reviewed_at = NOW() WHERE id = ${itemId} AND receipt_id = ${numId}`;
      }
      if (body.review_status !== undefined) {
        await sql`UPDATE line_items SET review_status = ${body.review_status}, reviewed_at = NOW() WHERE id = ${itemId} AND receipt_id = ${numId}`;
      }
      if (body.is_flower !== undefined) {
        await sql`UPDATE line_items SET is_flower = ${body.is_flower}, reviewed_at = NOW() WHERE id = ${itemId} AND receipt_id = ${numId}`;
      }
    }

    if (body.action === 'approve_all') {
      await sql`UPDATE line_items SET review_status = 'approved', reviewed_at = NOW() WHERE receipt_id = ${numId}`;
      await sql`UPDATE receipts SET extraction_status = 'reviewed' WHERE id = ${numId}`;
    }

    const items = await sql`SELECT * FROM line_items WHERE receipt_id = ${numId} ORDER BY line_number`;
    return Response.json(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
