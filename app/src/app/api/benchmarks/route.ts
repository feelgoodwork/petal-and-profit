import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = await getDb();

    const rows = await sql`
      SELECT wb.*,
        ROUND(price_per_unit::numeric, 4) as price_per_unit,
        ROUND(pp_price::numeric, 4) as pp_price
      FROM wholesale_benchmarks wb
      ORDER BY vendor_slug, category, product_name
    `;

    // Group by catalog_type for easy lookup
    const byType: Record<string, {
      base_type: string | null;
      category: string | null;
      vendors: Array<{
        vendor_slug: string;
        vendor_name: string;
        product_name: string;
        price_per_unit: number;
        pp_price: number;
        unit_type: string;
        package_price_low: number | null;
        package_price_high: number | null;
        package_qty: number | null;
      }>;
    }> = {};

    for (const row of rows) {
      const key = String(row.catalog_type || row.product_name);
      if (!byType[key]) {
        byType[key] = {
          base_type: row.base_type ? String(row.base_type) : null,
          category: row.category ? String(row.category) : null,
          vendors: [],
        };
      }
      byType[key].vendors.push({
        vendor_slug: String(row.vendor_slug),
        vendor_name: String(row.vendor_name),
        product_name: String(row.product_name),
        price_per_unit: Number(row.price_per_unit),
        pp_price: Number(row.pp_price),
        unit_type: String(row.unit_type),
        package_price_low: row.package_price_low != null ? Number(row.package_price_low) : null,
        package_price_high: row.package_price_high != null ? Number(row.package_price_high) : null,
        package_qty: row.package_qty != null ? Number(row.package_qty) : null,
      });
    }

    return Response.json(byType);
  } catch {
    return Response.json({}, { status: 500 });
  }
}
