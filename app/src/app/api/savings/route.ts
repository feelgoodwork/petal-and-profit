import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

/**
 * GET /api/savings?start=2026-02-01&end=2026-03-31
 *
 * Compares actual invoice costs (from ingredient_costs) against
 * wholesale_benchmarks P&P pricing for the given date range.
 * Only returns flower types with >= 10% cost improvement.
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') || '2026-02-01';
    const end = searchParams.get('end') || '2026-03-31';
    const minSavingsPct = Number(searchParams.get('min_pct') || '10');

    // 1. Get actual costs per flower type in the date range
    //    Join through flower_catalog to get base_type for fallback matching
    const actualCosts = await sql`
      SELECT
        fc.canonical_name,
        fc.base_type,
        fc.category,
        ic.cost_per as unit_type,
        COUNT(*)::int as purchase_count,
        SUM(ic.unit_cost)::numeric as total_cost,
        AVG(ic.unit_cost)::numeric as avg_cost_per_unit,
        MIN(ic.unit_cost)::numeric as min_cost,
        MAX(ic.unit_cost)::numeric as max_cost,
        SUM(CASE WHEN ic.cost_per = 'stem' THEN 1 ELSE 0 END)::int as stem_count,
        SUM(CASE WHEN ic.cost_per = 'bunch' THEN 1 ELSE 0 END)::int as bunch_count
      FROM ingredient_costs ic
      JOIN flower_catalog fc ON ic.flower_id = fc.id
      WHERE ic.invoice_date >= ${start}
        AND ic.invoice_date <= ${end}
      GROUP BY fc.canonical_name, fc.base_type, fc.category, ic.cost_per
      ORDER BY fc.canonical_name
    `;

    // 2. Get all wholesale benchmarks (keyed by catalog_type and base_type)
    const benchmarks = await sql`
      SELECT catalog_type, base_type, unit_type,
        MIN(price_per_unit) as best_price,
        MIN(pp_price) as best_pp_price,
        vendor_slug, vendor_name
      FROM wholesale_benchmarks
      GROUP BY catalog_type, base_type, unit_type, vendor_slug, vendor_name
    `;

    // Build lookup: catalog_type → best price, and base_type → best price (fallback)
    const benchByType = new Map<string, { price: number; ppPrice: number; vendor: string; unitType: string }>();
    const benchByBase = new Map<string, { price: number; ppPrice: number; vendor: string; unitType: string }>();

    for (const b of benchmarks) {
      const entry = {
        price: Number(b.best_price),
        ppPrice: Number(b.best_pp_price),
        vendor: String(b.vendor_name),
        unitType: String(b.unit_type),
      };
      if (b.catalog_type) {
        const key = String(b.catalog_type);
        if (!benchByType.has(key) || entry.ppPrice < benchByType.get(key)!.ppPrice) {
          benchByType.set(key, entry);
        }
      }
      if (b.base_type) {
        const key = String(b.base_type);
        if (!benchByBase.has(key) || entry.ppPrice < benchByBase.get(key)!.ppPrice) {
          benchByBase.set(key, entry);
        }
      }
    }

    // 3. Compare and compute savings
    interface SavingsRow {
      flower_type: string;
      base_type: string | null;
      category: string;
      unit_type: string;
      purchase_count: number;
      avg_actual_cost: number;
      total_actual_cost: number;
      pp_price_per_unit: number;
      total_pp_cost: number;
      savings_per_unit: number;
      total_savings: number;
      savings_pct: number;
      benchmark_vendor: string;
      match_type: string;
    }

    const savings: SavingsRow[] = [];

    for (const row of actualCosts) {
      const canonicalName = String(row.canonical_name);
      const baseType = row.base_type ? String(row.base_type) : null;
      const avgCost = Number(row.avg_cost_per_unit);
      const totalCost = Number(row.total_cost);
      const count = Number(row.purchase_count);

      // Find best benchmark: exact catalog_type first, then base_type fallback
      let bench = benchByType.get(canonicalName);
      let matchType = 'exact';
      if (!bench && baseType) {
        bench = benchByBase.get(baseType);
        matchType = 'base_type';
      }

      if (!bench) continue;

      const ppPricePerUnit = bench.ppPrice;
      const totalPpCost = ppPricePerUnit * count;
      const savingsPerUnit = avgCost - ppPricePerUnit;
      const totalSavings = totalCost - totalPpCost;
      const savingsPct = avgCost > 0 ? (savingsPerUnit / avgCost) * 100 : 0;

      // Only include if savings >= threshold (positive = you save money)
      if (savingsPct >= minSavingsPct) {
        savings.push({
          flower_type: canonicalName,
          base_type: baseType,
          category: String(row.category || 'flower'),
          unit_type: String(row.unit_type || 'stem'),
          purchase_count: count,
          avg_actual_cost: +avgCost.toFixed(4),
          total_actual_cost: +totalCost.toFixed(2),
          pp_price_per_unit: +ppPricePerUnit.toFixed(4),
          total_pp_cost: +totalPpCost.toFixed(2),
          savings_per_unit: +savingsPerUnit.toFixed(4),
          total_savings: +totalSavings.toFixed(2),
          savings_pct: +savingsPct.toFixed(1),
          benchmark_vendor: bench.vendor,
          match_type: matchType,
        });
      }
    }

    // Sort by total savings descending
    savings.sort((a, b) => b.total_savings - a.total_savings);

    // Summary stats
    const totalActual = savings.reduce((s, r) => s + r.total_actual_cost, 0);
    const totalPp = savings.reduce((s, r) => s + r.total_pp_cost, 0);
    const totalSaved = savings.reduce((s, r) => s + r.total_savings, 0);

    return Response.json({
      date_range: { start, end },
      min_savings_pct: minSavingsPct,
      summary: {
        flower_types_compared: savings.length,
        total_actual_cost: +totalActual.toFixed(2),
        total_pp_cost: +totalPp.toFixed(2),
        total_savings: +totalSaved.toFixed(2),
        overall_savings_pct: totalActual > 0 ? +((totalSaved / totalActual) * 100).toFixed(1) : 0,
      },
      items: savings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
