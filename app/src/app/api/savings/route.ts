import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

/**
 * GET /api/savings?start=2025-02-01&end=2025-03-31
 *
 * Compares actual invoice costs (from ingredient_costs) against
 * wholesale_benchmarks P&P pricing for the given date range.
 * Only returns flower types with >= 10% cost improvement.
 *
 * Handles messy date formats: MM/DD/YYYY, MM/DD/YY, and YYYY-MM-DD.
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') || '2025-02-01';
    const end = searchParams.get('end') || '2025-03-31';
    const minSavingsPct = Number(searchParams.get('min_pct') || '10');

    // Parse invoice_date (stored as TEXT in various formats) into a comparable date
    // using Postgres string functions. We normalize to YYYY-MM-DD for comparison.
    const actualCosts = await sql`
      WITH parsed_costs AS (
        SELECT ic.*,
          fc.canonical_name,
          fc.base_type,
          fc.category,
          CASE
            -- YYYY-MM-DD format (already good)
            WHEN ic.invoice_date ~ '^\d{4}-\d{2}-\d{2}' THEN ic.invoice_date::date
            -- MM/DD/YYYY format
            WHEN ic.invoice_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN TO_DATE(ic.invoice_date, 'MM/DD/YYYY')
            -- MM/DD/YY format
            WHEN ic.invoice_date ~ '^\d{1,2}/\d{1,2}/\d{2}$' THEN TO_DATE(ic.invoice_date, 'MM/DD/YY')
            ELSE NULL
          END as parsed_date
        FROM ingredient_costs ic
        JOIN flower_catalog fc ON ic.flower_id = fc.id
        WHERE ic.invoice_date IS NOT NULL
      )
      SELECT
        canonical_name,
        base_type,
        category,
        cost_per as unit_type,
        COUNT(*)::int as purchase_count,
        SUM(unit_cost)::numeric as total_cost,
        AVG(unit_cost)::numeric as avg_cost_per_unit,
        MIN(unit_cost)::numeric as min_cost,
        MAX(unit_cost)::numeric as max_cost
      FROM parsed_costs
      WHERE parsed_date >= ${start}::date
        AND parsed_date <= ${end}::date
      GROUP BY canonical_name, base_type, category, cost_per
      ORDER BY canonical_name
    `;

    // Get all wholesale benchmarks
    const benchmarks = await sql`
      SELECT catalog_type, base_type, unit_type,
        MIN(price_per_unit) as best_price,
        MIN(pp_price) as best_pp_price,
        vendor_slug, vendor_name
      FROM wholesale_benchmarks
      GROUP BY catalog_type, base_type, unit_type, vendor_slug, vendor_name
    `;

    // Build lookup maps
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

    // Compare and compute savings
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

    savings.sort((a, b) => b.total_savings - a.total_savings);

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
