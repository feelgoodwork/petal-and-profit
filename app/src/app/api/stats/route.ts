import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = getDb();

    const [vendors] = await sql`SELECT COUNT(*) as count FROM vendors`;
    const [receipts] = await sql`SELECT COUNT(*) as count FROM receipts`;
    const [receiptsExtracted] = await sql`SELECT COUNT(*) as count FROM receipts WHERE extraction_status IN ('extracted', 'reviewed', 'approved')`;
    const [receiptsReviewed] = await sql`SELECT COUNT(*) as count FROM receipts WHERE extraction_status IN ('reviewed', 'approved')`;
    const [lineItems] = await sql`SELECT COUNT(*) as count FROM line_items`;
    const [recipes] = await sql`SELECT COUNT(*) as count FROM recipes`;
    const [recipesCosted] = await sql`SELECT COUNT(*) as count FROM profitability_snapshots WHERE missing_ingredients = 0`;
    const [catalogEntries] = await sql`SELECT COUNT(*) as count FROM flower_catalog`;

    return Response.json({
      vendors: vendors.count,
      receipts: receipts.count,
      receipts_extracted: receiptsExtracted.count,
      receipts_reviewed: receiptsReviewed.count,
      line_items: lineItems.count,
      recipes: recipes.count,
      recipes_costed: recipesCosted.count,
      catalog_entries: catalogEntries.count,
    });
  } catch {
    return Response.json({
      vendors: 0, receipts: 0, receipts_extracted: 0, receipts_reviewed: 0,
      line_items: 0, recipes: 0, recipes_costed: 0, catalog_entries: 0,
    });
  }
}
