import { getDb } from '@/lib/db';
import { scrapeAllPricing, fetchCollectionPricing } from '@/lib/fiftyflowers';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const collection = request.nextUrl.searchParams.get('collection');
    const catalogType = request.nextUrl.searchParams.get('type');

    // Look up stored data by catalog type
    if (catalogType) {
      const sql = await getDb();
      const products = await sql`
        SELECT * FROM fiftyflowers_benchmarks
        WHERE catalog_type = ${catalogType}
        ORDER BY price_per_stem
      `;

      if (products.length === 0) {
        return Response.json({ not_found: true });
      }

      const withPrice = products.filter(p => p.price_per_stem != null);
      const prices = withPrice.map(p => Number(p.price_per_stem));

      return Response.json({
        avg_per_stem: prices.reduce((a, b) => a + b, 0) / prices.length,
        min_per_stem: Math.min(...prices),
        max_per_stem: Math.max(...prices),
        count: prices.length,
        products: withPrice.slice(0, 10),
      });
    }

    if (collection && collection !== 'none') {
      const products = await fetchCollectionPricing(collection);
      return Response.json({ collection, products, count: products.length });
    }

    // Return stored benchmark data
    const sql = await getDb();
    const benchmarks = await sql`
      SELECT * FROM fiftyflowers_benchmarks
      ORDER BY catalog_type, title
    `;

    return Response.json(benchmarks);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const sql = await getDb();

    // Create table if needed
    await sql`CREATE TABLE IF NOT EXISTS fiftyflowers_benchmarks (
      id SERIAL PRIMARY KEY,
      fetched_at TIMESTAMPTZ DEFAULT NOW(),
      handle TEXT NOT NULL,
      title TEXT NOT NULL,
      product_type TEXT,
      catalog_type TEXT,
      price_per_stem REAL,
      bunch_price REAL,
      stems_per_bunch INTEGER,
      colors TEXT,
      seasons TEXT,
      UNIQUE(handle)
    )`;

    const { products, by_type } = await scrapeAllPricing();

    // Clear and re-insert
    await sql`DELETE FROM fiftyflowers_benchmarks`;

    let inserted = 0;
    for (const p of products) {
      await sql`
        INSERT INTO fiftyflowers_benchmarks (handle, title, product_type, catalog_type, price_per_stem, bunch_price, stems_per_bunch, colors, seasons)
        VALUES (${p.handle}, ${p.title}, ${p.product_type}, ${p.catalog_type}, ${p.price_per_stem}, ${p.bunch_price}, ${p.stems_per_bunch}, ${p.colors.join(', ')}, ${p.seasons.join(', ')})
        ON CONFLICT (handle) DO UPDATE SET
          price_per_stem = EXCLUDED.price_per_stem,
          bunch_price = EXCLUDED.bunch_price,
          fetched_at = NOW()
      `;
      inserted++;
    }

    return Response.json({
      success: true,
      total_products: inserted,
      by_type,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
