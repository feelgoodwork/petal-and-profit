import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const sql = getDb();
    const numId = Number(id);

    const unitCost = Number(body.unit_cost);
    if (isNaN(unitCost) || unitCost < 0) {
      return Response.json({ error: 'Invalid cost' }, { status: 400 });
    }

    const source = body.source || 'manual';
    const notes = body.notes || (source === 'usda' ? 'USDA benchmark' : 'Manual entry');

    await sql`
      INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, notes, invoice_date)
      VALUES (${numId}, NULL, ${unitCost}, 'stem', ${notes}, ${new Date().toISOString().split('T')[0]})
    `;

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
