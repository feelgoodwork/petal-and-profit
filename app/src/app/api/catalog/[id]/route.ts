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
      WHERE ic.flower_id = ${numId} AND ic.is_current = true
      ORDER BY ic.parsed_date DESC NULLS LAST
    `;

    // Stem size breakdown (only for entries that have size data)
    const stemSizes = await sql`
      SELECT stem_size_cm, COUNT(*) as count, ROUND(AVG(unit_cost)::numeric, 2) as avg_cost
      FROM ingredient_costs
      WHERE flower_id = ${numId} AND stem_size_cm IS NOT NULL AND is_current = true
      GROUP BY stem_size_cm ORDER BY stem_size_cm
    `;

    const recipeUsage = await sql`
      SELECT ri.*, r.name as recipe_name, r.sell_price
      FROM recipe_ingredients ri
      JOIN recipes r ON ri.recipe_id = r.id
      WHERE ri.flower_id = ${numId}
      ORDER BY r.name
    `;

    // USDA benchmark — try exact canonical_name first, then base_type fallback
    const canonicalName = String(entry.canonical_name);
    const baseType = entry.base_type ? String(entry.base_type) : canonicalName;

    const usdaResults = await sql`
      SELECT * FROM usda_benchmarks
      WHERE catalog_type = ${canonicalName} OR catalog_type = ${baseType}
      ORDER BY report_date DESC LIMIT 5
    `;

    // FF benchmark — canonical_name first, then base_type fallback
    const ffResults = await sql`
      SELECT * FROM fiftyflowers_benchmarks
      WHERE (catalog_type = ${canonicalName} OR catalog_type = ${baseType})
        AND price_per_stem IS NOT NULL
      ORDER BY price_per_stem
    `;
    const ffPrices = ffResults.map(r => Number(r.price_per_stem));
    const ffBenchmark = ffPrices.length > 0 ? {
      avg_per_stem: ffPrices.reduce((a, b) => a + b, 0) / ffPrices.length,
      min_per_stem: Math.min(...ffPrices),
      max_per_stem: Math.max(...ffPrices),
      count: ffPrices.length,
      note: ffResults[0]?.catalog_type !== canonicalName ? `Showing ${baseType} retail data` : undefined,
    } : null;

    return Response.json({
      ...entry,
      aliases,
      line_items: lineItems,
      costs,
      stem_sizes: stemSizes,
      recipe_usage: recipeUsage,
      usda: usdaResults.length > 0 ? usdaResults[0] : null,
      ff_benchmark: ffBenchmark,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
