import { getDb } from '@/lib/db';
import { loadCurrentCosts, loadCatalogIndex, resolveFlowerCost, loadPpPrices, resolvePpPrice } from '@/lib/matching/cost-resolver';

/**
 * GET /api/savings
 *
 * Sales-driven savings analysis: looks at what arrangements Uptowne sold
 * in 2026, calculates the flower cost using historical avg costs,
 * then compares against P&P wholesale pricing.
 *
 * Shows per-arrangement breakdown: current cost vs P&P cost, and where
 * buying through P&P would improve profitability by 10%+ on flower cost.
 */
export async function GET() {
  try {
    const sql = await getDb();

    // 1. Get all 2026 sales matched to recipes, with times sold
    const salesByRecipe = await sql`
      SELECT recipe_id, COUNT(*)::int as times_sold, SUM(amount)::numeric as total_revenue
      FROM sales
      WHERE order_date LIKE '%2026%'
        AND recipe_id IS NOT NULL
      GROUP BY recipe_id
    `;

    if (salesByRecipe.length === 0) {
      return Response.json({ summary: null, items: [] });
    }

    // 2. Load tiered costs
    const allCosts = await loadCurrentCosts();
    const { byId: catalogById, byName: catalogByName } = await loadCatalogIndex();

    // 3. Load P&P benchmark prices with tiered fallback
    const { byType: ppByType, byBase: ppByBase } = await loadPpPrices();

    // 4. Load recipe names and sell prices
    const recipes = await sql`
      SELECT r.id, r.name, r.sell_price, rc.name as category_name
      FROM recipes r
      JOIN recipe_categories rc ON r.category_id = rc.id
    `;
    const recipeMap = new Map<number, { name: string; sellPrice: number; category: string }>();
    for (const r of recipes) {
      recipeMap.set(Number(r.id), {
        name: String(r.name),
        sellPrice: Number(r.sell_price),
        category: String(r.category_name),
      });
    }

    // 6. For each sold recipe, compute current cost vs P&P cost
    interface ArrangementSavings {
      recipe_id: number;
      recipe_name: string;
      category: string;
      sell_price: number;
      times_sold: number;
      total_revenue: number;
      current_flower_cost: number;
      pp_flower_cost: number;
      current_margin_pct: number;
      pp_margin_pct: number;
      savings_per_arrangement: number;
      total_savings: number;
      savings_pct: number;
      ingredients_costed: number;
      ingredients_total: number;
      pp_ingredients_costed: number;
    }

    const results: ArrangementSavings[] = [];

    // Batch-load all ingredients for sold recipes
    const recipeIds = salesByRecipe.map(s => Number(s.recipe_id));
    const allIngredients = await sql`
      SELECT recipe_id, flower_id, quantity, ingredient_name
      FROM recipe_ingredients
      WHERE recipe_id = ANY(${recipeIds})
    `;

    // Group ingredients by recipe
    const ingredientsByRecipe = new Map<number, Array<{ flowerId: number | null; qty: number; name: string }>>();
    for (const ing of allIngredients) {
      const rid = Number(ing.recipe_id);
      if (!ingredientsByRecipe.has(rid)) ingredientsByRecipe.set(rid, []);
      ingredientsByRecipe.get(rid)!.push({
        flowerId: ing.flower_id != null ? Number(ing.flower_id) : null,
        qty: Number(ing.quantity) || 1,
        name: String(ing.ingredient_name),
      });
    }

    for (const sale of salesByRecipe) {
      const recipeId = Number(sale.recipe_id);
      const timesSold = Number(sale.times_sold);
      const totalRevenue = Number(sale.total_revenue);
      const recipe = recipeMap.get(recipeId);
      if (!recipe) continue;

      const ingredients = ingredientsByRecipe.get(recipeId) || [];
      let currentCost = 0;
      let ppCost = 0;
      let ingredientsCosted = 0;
      let ppIngredientsCosted = 0;
      const ingredientsTotal = ingredients.length;

      for (const ing of ingredients) {
        if (!ing.flowerId) continue;

        const resolved = resolveFlowerCost(ing.flowerId, allCosts, catalogById, catalogByName);
        if (resolved) {
          currentCost += ing.qty * resolved.avg_cost;
          ingredientsCosted++;
        }

        const pp = resolvePpPrice(ing.flowerId, ppByType, ppByBase, catalogById);
        if (pp) {
          ppCost += ing.qty * pp.pp_price;
          ppIngredientsCosted++;
        }
      }

      // Only include if we have both costs to compare
      if (currentCost <= 0 || ppCost <= 0) continue;

      const savingsPerArr = currentCost - ppCost;
      const savingsPct = (savingsPerArr / currentCost) * 100;

      // Only show where P&P saves at least 10%
      if (savingsPct < 10) continue;

      const currentMarginPct = ((recipe.sellPrice - currentCost) / recipe.sellPrice) * 100;
      const ppMarginPct = ((recipe.sellPrice - ppCost) / recipe.sellPrice) * 100;

      results.push({
        recipe_id: recipeId,
        recipe_name: recipe.name,
        category: recipe.category,
        sell_price: recipe.sellPrice,
        times_sold: timesSold,
        total_revenue: +totalRevenue.toFixed(2),
        current_flower_cost: +currentCost.toFixed(2),
        pp_flower_cost: +ppCost.toFixed(2),
        current_margin_pct: +currentMarginPct.toFixed(1),
        pp_margin_pct: +ppMarginPct.toFixed(1),
        savings_per_arrangement: +savingsPerArr.toFixed(2),
        total_savings: +(savingsPerArr * timesSold).toFixed(2),
        savings_pct: +savingsPct.toFixed(1),
        ingredients_costed: ingredientsCosted,
        ingredients_total: ingredientsTotal,
        pp_ingredients_costed: ppIngredientsCosted,
      });
    }

    results.sort((a, b) => b.total_savings - a.total_savings);

    const totalCurrentCost = results.reduce((s, r) => s + r.current_flower_cost * r.times_sold, 0);
    const totalPpCost = results.reduce((s, r) => s + r.pp_flower_cost * r.times_sold, 0);
    const totalSavings = results.reduce((s, r) => s + r.total_savings, 0);
    const totalRevenue = results.reduce((s, r) => s + r.total_revenue, 0);

    return Response.json({
      summary: {
        arrangements_compared: results.length,
        total_times_sold: results.reduce((s, r) => s + r.times_sold, 0),
        total_revenue: +totalRevenue.toFixed(2),
        total_current_flower_cost: +totalCurrentCost.toFixed(2),
        total_pp_flower_cost: +totalPpCost.toFixed(2),
        total_savings: +totalSavings.toFixed(2),
        overall_savings_pct: totalCurrentCost > 0 ? +((totalSavings / totalCurrentCost) * 100).toFixed(1) : 0,
      },
      items: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
