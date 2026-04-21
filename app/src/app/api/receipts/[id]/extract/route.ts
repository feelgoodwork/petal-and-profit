import { getDb } from '@/lib/db';
import { extractAsiri } from '@/lib/extractors/asiri';
import { extractWithVision } from '@/lib/extractors/claude-vision';
import type { NextRequest } from 'next/server';

export async function POST(
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

    let result;
    if (receipt.extraction_method === 'programmatic' && receipt.vendor_name === 'Asiri Blooms') {
      result = await extractAsiri(receipt.file_path);
    } else {
      result = await extractWithVision(receipt.file_path, receipt.vendor_name);
    }

    await sql`
      UPDATE receipts SET
        invoice_number = ${result.invoice_number}, invoice_date = ${result.invoice_date},
        subtotal = ${result.subtotal}, tax = ${result.tax}, total = ${result.total},
        extraction_status = 'extracted', raw_extraction = ${JSON.stringify(result)}
      WHERE id = ${numId}
    `;

    await sql`DELETE FROM line_items WHERE receipt_id = ${numId}`;

    for (const [idx, item] of result.line_items.entries()) {
      await sql`
        INSERT INTO line_items (receipt_id, line_number, item_code, description, unit_type, quantity, unit_price, line_total, discount_pct, is_flower, notes)
        VALUES (${numId}, ${idx + 1}, ${item.item_code || null}, ${item.description}, ${item.unit_type || null}, ${item.quantity}, ${item.unit_price}, ${item.line_total}, ${item.discount_pct || null}, ${item.is_flower ? 1 : 0}, ${item.notes || null})
      `;
    }

    return Response.json({
      success: true,
      method: receipt.extraction_method,
      invoice_number: result.invoice_number,
      line_items: result.line_items.length,
      total: result.total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
