import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const sql = await getDb();
    const productType = request.nextUrl.searchParams.get('type');

    if (productType) {
      // Get latest benchmark for a specific product type
      const prices = await sql`
        SELECT * FROM usda_benchmarks
        WHERE catalog_type = ${productType}
        ORDER BY report_date DESC
        LIMIT 20
      `;

      if (prices.length === 0) {
        return Response.json({ not_found: true });
      }

      // Aggregate the latest report's prices
      const latestDate = prices[0].report_date;
      const latest = prices.filter(p => p.report_date === latestDate);

      const stemPrices = latest.filter(p => (p.unit_of_sale as string).includes('per stem'));
      const perStem = stemPrices.length > 0
        ? stemPrices.reduce((s: number, m) => s + Number(m.mostly_price), 0) / stemPrices.length
        : null;

      return Response.json({
        low: Math.min(...latest.map(p => Number(p.low_price))),
        high: Math.max(...latest.map(p => Number(p.high_price))),
        mostly: latest.reduce((s: number, p) => s + Number(p.mostly_price), 0) / latest.length,
        per_stem: perStem,
        report_date: latestDate,
        commodity: latest[0].commodity,
        fetched_at: latest[0].fetched_at,
        price_count: latest.length,
        // Include historical for trends
        history: prices.map(p => ({
          report_date: p.report_date,
          mostly_price: p.mostly_price,
          low_price: p.low_price,
          high_price: p.high_price,
          origin: p.origin,
          unit_of_sale: p.unit_of_sale,
        })),
      });
    }

    // No type specified -- return summary of all synced data
    const summary = await sql`
      SELECT
        catalog_type,
        MAX(report_date) as latest_date,
        COUNT(*) as price_points,
        AVG(mostly_price) as avg_mostly
      FROM usda_benchmarks
      WHERE catalog_type IS NOT NULL
      GROUP BY catalog_type
      ORDER BY catalog_type
    `;

    const [syncInfo] = await sql`
      SELECT MAX(report_date) as latest_report, MAX(fetched_at) as last_sync, COUNT(DISTINCT report_date) as report_count
      FROM usda_benchmarks
    `;

    return Response.json({
      latest_report: syncInfo?.latest_report,
      last_sync: syncInfo?.last_sync,
      report_count: syncInfo?.report_count,
      commodities: summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
