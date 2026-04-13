import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sql = getDb();
    const numId = Number(id);

    const [entry] = await sql`SELECT * FROM flower_catalog WHERE id = ${numId}`;
    if (!entry) return Response.json({ error: 'Not found' }, { status: 404 });

    const aliases = await sql`
      SELECT fa.*, v.name as vendor_name
      FROM flower_aliases fa
      LEFT JOIN vendors v ON fa.vendor_id = v.id
      WHERE fa.flower_id = ${numId}
      ORDER BY v.name, fa.alias
    `;

    const lineItems = await sql`
      SELECT li.*, r.invoice_date, r.invoice_number, v.name as vendor_name
      FROM line_items li
      JOIN receipts r ON li.receipt_id = r.id
      JOIN vendors v ON r.vendor_id = v.id
      JOIN flower_aliases fa ON fa.alias = li.description AND fa.vendor_id = r.vendor_id
      WHERE fa.flower_id = ${numId}
      ORDER BY r.invoice_date DESC, li.description
    `;

    const costs = await sql`
      SELECT ic.*, v.name as vendor_name
      FROM ingredient_costs ic
      LEFT JOIN vendors v ON ic.vendor_id = v.id
      WHERE ic.flower_id = ${numId}
      ORDER BY ic.invoice_date DESC
    `;

    const recipeUsage = await sql`
      SELECT ri.*, r.name as recipe_name, r.sell_price
      FROM recipe_ingredients ri
      JOIN recipes r ON ri.recipe_id = r.id
      WHERE ri.flower_id = ${numId}
      ORDER BY r.name
    `;

    return Response.json({
      ...entry,
      aliases,
      line_items: lineItems,
      costs,
      recipe_usage: recipeUsage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
