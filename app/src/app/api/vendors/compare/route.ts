import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = getDb();

    // Get avg cost per stem by vendor and catalog type
    const comparison = await sql`
      SELECT
        fc.canonical_name as product_type,
        fc.category as flower_category,
        CASE WHEN fc.category = 'foliage' THEN 'bunch' ELSE 'stem' END as price_unit,
        v.name as vendor_name,
        COUNT(*) as price_points,
        AVG(ic.unit_cost) as avg_cost,
        MIN(ic.unit_cost) as min_cost,
        MAX(ic.unit_cost) as max_cost,
        MAX(ic.invoice_date) as latest_date
      FROM ingredient_costs ic
      JOIN flower_catalog fc ON ic.flower_id = fc.id
      LEFT JOIN vendors v ON ic.vendor_id = v.id
      WHERE ic.unit_cost > 0 AND ic.is_current = true
      GROUP BY fc.canonical_name, fc.category, v.name
      ORDER BY fc.canonical_name, AVG(ic.unit_cost)
    `;

    // Group by product type
    const byType: Record<string, {
      price_unit: string;
      vendors: Array<{ vendor: string; avg: number; min: number; max: number; count: number; latest: string | null }>;
    }> = {};

    for (const row of comparison) {
      const type = row.product_type as string;
      if (!byType[type]) byType[type] = { price_unit: row.price_unit as string, vendors: [] };
      byType[type].vendors.push({
        vendor: (row.vendor_name as string) || 'Unknown',
        avg: Number(row.avg_cost),
        min: Number(row.min_cost),
        max: Number(row.max_cost),
        count: Number(row.price_points),
        latest: row.latest_date as string | null,
      });
    }

    return Response.json(byType);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
