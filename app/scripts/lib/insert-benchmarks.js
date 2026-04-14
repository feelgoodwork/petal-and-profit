/**
 * Shared insert logic for wholesale benchmark data.
 * Used by all vendor scraper scripts.
 *
 * Usage:
 *   const { insertBenchmarks } = require('./lib/insert-benchmarks');
 *   await insertBenchmarks(client, 'oberers', "Oberer's Flower Market", rows);
 */

const PP_MARKUP = 1.20; // 20% markup for Petal & Profit pricing

/**
 * @param {import('pg').Client} client
 * @param {string} vendorSlug
 * @param {string} vendorName
 * @param {Array<{
 *   productName: string,
 *   catalogType: string,
 *   baseType: string,
 *   category: string,
 *   priceLow: number,
 *   priceHigh: number | null,
 *   packageQty: number,
 *   unitType: 'stem' | 'bunch',
 *   sourceUrl: string
 * }>} rows
 */
async function insertBenchmarks(client, vendorSlug, vendorName, rows) {
  // Ensure table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS wholesale_benchmarks (
      id              SERIAL PRIMARY KEY,
      vendor_slug     TEXT NOT NULL,
      vendor_name     TEXT NOT NULL,
      product_name    TEXT NOT NULL,
      catalog_type    TEXT,
      base_type       TEXT,
      category        TEXT,
      package_price_low   REAL,
      package_price_high  REAL,
      package_qty     REAL,
      unit_type       TEXT NOT NULL DEFAULT 'stem',
      price_per_unit  REAL,
      pp_price        REAL,
      source_url      TEXT,
      scraped_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(vendor_slug, product_name)
    )
  `);

  // Clear existing rows for this vendor
  await client.query('DELETE FROM wholesale_benchmarks WHERE vendor_slug = $1', [vendorSlug]);

  let inserted = 0;
  for (const row of rows) {
    const low = row.priceLow;
    const high = row.priceHigh;
    let pricePerUnit;

    if (row.unitType === 'bunch') {
      // For bunch items, price_per_unit = midpoint of package price (already per bunch)
      pricePerUnit = high ? (low + high) / 2 : low;
    } else {
      // Per-stem: divide package price by qty
      const midPrice = high ? (low + high) / 2 : low;
      pricePerUnit = row.packageQty > 0 ? midPrice / row.packageQty : midPrice;
    }

    const ppPrice = +(pricePerUnit * PP_MARKUP).toFixed(4);
    pricePerUnit = +pricePerUnit.toFixed(4);

    await client.query(
      `INSERT INTO wholesale_benchmarks
        (vendor_slug, vendor_name, product_name, catalog_type, base_type, category,
         package_price_low, package_price_high, package_qty, unit_type,
         price_per_unit, pp_price, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (vendor_slug, product_name) DO UPDATE SET
         catalog_type = EXCLUDED.catalog_type,
         base_type = EXCLUDED.base_type,
         category = EXCLUDED.category,
         package_price_low = EXCLUDED.package_price_low,
         package_price_high = EXCLUDED.package_price_high,
         package_qty = EXCLUDED.package_qty,
         unit_type = EXCLUDED.unit_type,
         price_per_unit = EXCLUDED.price_per_unit,
         pp_price = EXCLUDED.pp_price,
         source_url = EXCLUDED.source_url,
         scraped_at = NOW()`,
      [vendorSlug, vendorName, row.productName, row.catalogType, row.baseType,
       row.category, low, high, row.packageQty, row.unitType,
       pricePerUnit, ppPrice, row.sourceUrl]
    );
    inserted++;
  }

  return { inserted, vendor: vendorSlug };
}

module.exports = { insertBenchmarks, PP_MARKUP };
