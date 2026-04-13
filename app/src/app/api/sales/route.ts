import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = getDb();

    // Top sellers with recipe match and profitability
    const topSellers = await sql`
      SELECT
        s.description,
        s.recipe_id,
        r.name as recipe_name,
        COUNT(*) as times_sold,
        SUM(s.quantity) as total_qty,
        AVG(s.amount) as avg_sale_price,
        SUM(s.amount) as total_revenue,
        MIN(s.order_date) as first_sold,
        MAX(s.order_date) as last_sold,
        ps.total_flower_cost,
        ps.margin_pct
      FROM sales s
      LEFT JOIN recipes r ON s.recipe_id = r.id
      LEFT JOIN profitability_snapshots ps ON s.recipe_id = ps.recipe_id
      GROUP BY s.description, s.recipe_id, r.name, ps.total_flower_cost, ps.margin_pct
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `;

    // Summary stats
    const [stats] = await sql`
      SELECT
        COUNT(*) as total_sales,
        COUNT(DISTINCT order_number) as total_orders,
        SUM(amount) as total_revenue,
        MIN(order_date) as earliest_date,
        MAX(order_date) as latest_date,
        COUNT(DISTINCT recipe_id) as matched_recipes
      FROM sales
    `;

    // Sales by occasion
    const byOccasion = await sql`
      SELECT occasion, COUNT(*) as count, SUM(amount) as revenue
      FROM sales WHERE occasion IS NOT NULL AND occasion != ''
      GROUP BY occasion ORDER BY COUNT(*) DESC
    `;

    // Monthly trend
    const monthly = await sql`
      SELECT
        SUBSTRING(order_date, 1, 7) as month,
        COUNT(*) as sales,
        SUM(amount) as revenue
      FROM sales WHERE order_date IS NOT NULL
      GROUP BY SUBSTRING(order_date, 1, 7)
      ORDER BY month
    `;

    return Response.json({ top_sellers: topSellers, stats, by_occasion: byOccasion, monthly });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
