import { getDb } from '@/lib/db';

const SIX_MONTHS_DAYS = 183;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    // For SQL filtering, treat missing bounds as effectively unbounded.
    // Sales.order_date is stored as YYYY-MM-DD text so string comparisons work.
    const from = fromParam || '0001-01-01';
    const to = toParam || '9999-12-31';

    const rangeDays = (fromParam && toParam) ? daysBetween(fromParam, toParam) : null;
    const includeOrders = rangeDays != null && rangeDays <= SIX_MONTHS_DAYS;

    const sql = await getDb();

    // Top sellers (within range) with recipe match and profitability
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
      WHERE s.order_date >= ${from} AND s.order_date <= ${to}
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
      WHERE order_date >= ${from} AND order_date <= ${to}
    `;

    // Sales by occasion (within range)
    const byOccasion = await sql`
      SELECT occasion, COUNT(*) as count, SUM(amount) as revenue
      FROM sales
      WHERE occasion IS NOT NULL AND occasion != ''
        AND order_date >= ${from} AND order_date <= ${to}
      GROUP BY occasion ORDER BY COUNT(*) DESC
    `;

    // Monthly trend (within range)
    const monthly = await sql`
      SELECT
        SUBSTRING(order_date, 1, 7) as month,
        COUNT(*) as sales,
        SUM(amount) as revenue
      FROM sales
      WHERE order_date IS NOT NULL
        AND order_date >= ${from} AND order_date <= ${to}
      GROUP BY SUBSTRING(order_date, 1, 7)
      ORDER BY month
    `;

    // Per-order detail when range is within 6 months
    let orders: unknown[] | null = null;
    if (includeOrders) {
      orders = await sql`
        SELECT
          order_number,
          MIN(order_date) AS order_date,
          MAX(source) AS source,
          MAX(occasion) AS occasion,
          COUNT(*)::int AS line_count,
          SUM(amount) AS order_total,
          SUM(quantity) AS total_qty,
          (ARRAY_AGG(description ORDER BY id))[1] AS primary_description,
          BOOL_OR(recipe_id IS NOT NULL) AS has_recipe_match
        FROM sales
        WHERE order_date >= ${from} AND order_date <= ${to}
          AND order_number IS NOT NULL AND order_number != ''
        GROUP BY order_number
        ORDER BY MIN(order_date) DESC, order_number
        LIMIT 5000
      `;
    }

    return Response.json({
      top_sellers: topSellers,
      stats,
      by_occasion: byOccasion,
      monthly,
      orders,
      range: {
        from: fromParam,
        to: toParam,
        days: rangeDays,
        includes_orders: includeOrders,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

function daysBetween(fromYmd: string, toYmd: string): number | null {
  const f = Date.parse(fromYmd + 'T00:00:00Z');
  const t = Date.parse(toYmd + 'T00:00:00Z');
  if (isNaN(f) || isNaN(t)) return null;
  return Math.round((t - f) / (1000 * 60 * 60 * 24));
}
