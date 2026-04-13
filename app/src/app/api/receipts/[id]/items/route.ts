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

    // Update individual line item
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
      if (body.unit_price !== undefined) {
        const unitPrice = Number(body.unit_price);
        await sql`UPDATE line_items SET unit_price = ${unitPrice}, reviewed_at = NOW() WHERE id = ${itemId} AND receipt_id = ${numId}`;
        // Recalculate cost_per_stem based on price_basis
        const [item] = await sql`SELECT price_basis, stems_per_unit FROM line_items WHERE id = ${itemId}`;
        if (item) {
          const cps = item.price_basis === 'per_bunch' && item.stems_per_unit
            ? unitPrice / Number(item.stems_per_unit)
            : unitPrice;
          await sql`UPDATE line_items SET cost_per_stem = ${cps} WHERE id = ${itemId}`;
        }
      }
      if (body.quantity !== undefined) {
        await sql`UPDATE line_items SET quantity = ${Number(body.quantity)}, reviewed_at = NOW() WHERE id = ${itemId} AND receipt_id = ${numId}`;
      }
      if (body.price_basis !== undefined) {
        await sql`UPDATE line_items SET price_basis = ${body.price_basis}, reviewed_at = NOW() WHERE id = ${itemId} AND receipt_id = ${numId}`;
        // Recalculate cost_per_stem
        const [item] = await sql`SELECT unit_price, stems_per_unit FROM line_items WHERE id = ${itemId}`;
        if (item && item.unit_price != null) {
          const cps = body.price_basis === 'per_bunch' && item.stems_per_unit
            ? Number(item.unit_price) / Number(item.stems_per_unit)
            : Number(item.unit_price);
          await sql`UPDATE line_items SET cost_per_stem = ${cps} WHERE id = ${itemId}`;
        }
      }
      if (body.stems_per_unit !== undefined) {
        const spu = Number(body.stems_per_unit);
        await sql`UPDATE line_items SET stems_per_unit = ${spu}, reviewed_at = NOW() WHERE id = ${itemId} AND receipt_id = ${numId}`;
        // Recalculate cost_per_stem
        const [item] = await sql`SELECT unit_price, price_basis FROM line_items WHERE id = ${itemId}`;
        if (item && item.unit_price != null && item.price_basis === 'per_bunch' && spu > 0) {
          await sql`UPDATE line_items SET cost_per_stem = ${Number(item.unit_price) / spu} WHERE id = ${itemId}`;
        }
      }
      // Map to catalog entry
      if (body.flower_id !== undefined) {
        const flowerId = body.flower_id ? Number(body.flower_id) : null;
        // Get vendor_id for alias
        const [receipt] = await sql`SELECT vendor_id FROM receipts WHERE id = ${numId}`;
        const [item] = await sql`SELECT description, cost_per_stem, unit_price FROM line_items WHERE id = ${itemId}`;

        if (flowerId && receipt && item) {
          // Create alias
          await sql`INSERT INTO flower_aliases (flower_id, alias, vendor_id, confidence) VALUES (${flowerId}, ${item.description}, ${receipt.vendor_id}, 1.0) ON CONFLICT (alias, vendor_id) DO UPDATE SET flower_id = ${flowerId}, confidence = 1.0`;
          // Record cost
          const costValue = item.cost_per_stem ?? item.unit_price;
          if (costValue != null && Number(costValue) > 0) {
            const [r] = await sql`SELECT invoice_date FROM receipts WHERE id = ${numId}`;
            await sql`INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date) VALUES (${flowerId}, ${receipt.vendor_id}, ${costValue}, 'stem', ${itemId}, ${r?.invoice_date})`;
          }
        }
      }
    }

    // Batch approve all items
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
