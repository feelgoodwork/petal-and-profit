import { getDb } from '@/lib/db';
import { fetchUSDAReport } from '@/lib/usda';

export async function POST() {
  try {
    const sql = getDb();

    const { report_date, prices } = await fetchUSDAReport();

    // Check if we already have this report date
    const [existing] = await sql`SELECT COUNT(*) as count FROM usda_benchmarks WHERE report_date = ${report_date}`;
    if (Number(existing.count) > 0) {
      return Response.json({
        success: true,
        message: `Report for ${report_date} already synced`,
        report_date,
        prices: 0,
        skipped: true,
      });
    }

    // Insert all prices
    let inserted = 0;
    for (const p of prices) {
      await sql`
        INSERT INTO usda_benchmarks (report_date, commodity, catalog_type, unit_of_sale, origin, variety, grade, low_price, high_price, mostly_price, market_condition)
        VALUES (${report_date}, ${p.commodity}, ${p.catalog_type}, ${p.unit_of_sale}, ${p.origin}, ${p.variety}, ${p.grade}, ${p.low_price}, ${p.high_price}, ${p.mostly_price}, ${p.market_condition})
      `;
      inserted++;
    }

    return Response.json({
      success: true,
      report_date,
      prices: inserted,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
