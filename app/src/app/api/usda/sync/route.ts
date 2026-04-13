import { getDb } from '@/lib/db';
import { fetchUSDAReport } from '@/lib/usda';

const REPORTS = [
  { url: 'https://www.ams.usda.gov/mnreports/bh_fv201.txt', name: 'Boston Terminal' },
  { url: 'https://www.ams.usda.gov/mnreports/mh_fv221.txt', name: 'Miami Shipping' },
];

export async function POST() {
  try {
    const sql = getDb();
    const results = [];

    for (const report of REPORTS) {
      try {
        const { report_date, prices } = await fetchUSDAReport(report.url);

        const [existing] = await sql`SELECT COUNT(*) as count FROM usda_benchmarks WHERE report_date = ${report_date}`;
        if (Number(existing.count) > 0) {
          results.push({ report: report.name, report_date, prices: 0, skipped: true });
          continue;
        }

        let inserted = 0;
        for (const p of prices) {
          await sql`
            INSERT INTO usda_benchmarks (report_date, commodity, catalog_type, unit_of_sale, origin, variety, grade, low_price, high_price, mostly_price, market_condition)
            VALUES (${report_date}, ${p.commodity}, ${p.catalog_type}, ${p.unit_of_sale}, ${p.origin}, ${p.variety}, ${p.grade}, ${p.low_price}, ${p.high_price}, ${p.mostly_price}, ${p.market_condition})
          `;
          inserted++;
        }

        results.push({ report: report.name, report_date, prices: inserted });
      } catch (e) {
        results.push({ report: report.name, error: (e as Error).message });
      }
    }

    return Response.json({ success: true, results, fetched_at: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
