import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = await getDb();
    const receipts = await sql`
      SELECT r.*, v.name as vendor_name,
        (SELECT COUNT(*) FROM line_items WHERE receipt_id = r.id) as item_count
      FROM receipts r
      JOIN vendors v ON r.vendor_id = v.id
      ORDER BY r.created_at DESC
    `;
    return Response.json(receipts);
  } catch {
    return Response.json([], { status: 500 });
  }
}
