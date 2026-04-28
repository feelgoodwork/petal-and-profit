import type { SQL } from '@/lib/db';

export const TRUTH_FLOWER_TYPES = ['stem', 'foliage', 'filler flower', 'filler'] as const;

export interface TruthIngredient {
  ingredient_name: string;
  line_item_type: string | null;
  quantity: number | null;
  line_item_no: number | null;
}

export interface OurIngredient {
  ingredient_name: string;
  quantity: number | null;
  is_foliage: number;
}

export interface IngredientMatch {
  truth: TruthIngredient | null;
  ours: OurIngredient | null;
  match: 'exact' | 'fuzzy' | 'truth_only' | 'ours_only';
  similarity?: number;
  qty_match: boolean;
}

export interface RecipeComparison {
  truth_name: string;
  our_name: string | null;
  our_id: number | null;
  name_match: 'exact' | 'fuzzy' | 'truth_only';
  name_similarity?: number;
  truth_ingredient_count: number;
  our_ingredient_count: number;
  exact_ingredient_matches: number;
  fuzzy_ingredient_matches: number;
  truth_only_ingredients: number;
  ours_only_ingredients: number;
  qty_mismatches: number;
  ingredients: IngredientMatch[];
}

export interface ComparisonReport {
  generated_at: string;
  truth_count: number;
  our_count: number;
  recipes: RecipeComparison[];
  ours_only_recipes: Array<{ id: number; name: string }>;
  summary: {
    arrangements_exact: number;
    arrangements_fuzzy: number;
    arrangements_truth_only: number;
    arrangements_ours_only: number;
    truth_ingredients_total: number;
    our_ingredients_total: number;
    ingredient_exact: number;
    ingredient_fuzzy: number;
    ingredient_truth_only: number;
    ingredient_ours_only: number;
    qty_mismatches: number;
  };
}

const RECIPE_NAME_THRESHOLD = 0.78;
const INGREDIENT_NAME_THRESHOLD = 0.7;

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(/[^a-z0-9]+/).filter(t => t.length > 0);
}

/**
 * Token-overlap similarity tuned for short phrases like recipe names and
 * ingredient lines. Combines:
 *   - Sørensen-Dice on character bigrams (handles typos / minor edits)
 *   - Token-overlap coefficient (handles word-order differences and superset
 *     names like "(babies breath) Richly Rosey" vs "Richly Rosey")
 * The blend is the max of the two, so either signal can carry the match.
 */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  // Character bigram dice
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };
  const ba = bigrams(na.replace(/\s+/g, ' '));
  const bb = bigrams(nb.replace(/\s+/g, ' '));
  let inter = 0;
  for (const [g, ca] of ba) {
    const cb = bb.get(g);
    if (cb) inter += Math.min(ca, cb);
  }
  const total = [...ba.values()].reduce((a, b) => a + b, 0) + [...bb.values()].reduce((a, b) => a + b, 0);
  const dice = total === 0 ? 0 : (2 * inter) / total;

  // Token overlap (over the smaller side)
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return dice;
  let tInter = 0;
  for (const t of ta) if (tb.has(t)) tInter++;
  const overlap = tInter / Math.min(ta.size, tb.size);

  return Math.max(dice, overlap);
}

interface TruthRow {
  id: number;
  name: string;
  ingredient_name: string;
  line_item_type: string | null;
  quantity: number | null;
  line_item_no: number | null;
}

interface OurRow {
  id: number;
  name: string;
  ingredient_name: string | null;
  quantity: number | null;
  is_foliage: number | null;
}

export async function buildComparison(sql: SQL): Promise<ComparisonReport> {
  const truthRowsRaw = (await sql`
    SELECT tr.id, tr.name, tri.ingredient_name, tri.line_item_type, tri.quantity, tri.line_item_no
    FROM truth_recipes tr
    LEFT JOIN truth_recipe_ingredients tri ON tri.truth_recipe_id = tr.id
    ORDER BY tr.name, tri.line_item_no
  `) as unknown as TruthRow[];

  const ourRowsRaw = (await sql`
    SELECT r.id, r.name, ri.ingredient_name, ri.quantity, ri.is_foliage
    FROM recipes r
    LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    ORDER BY r.name, ri.id
  `) as unknown as OurRow[];

  // Group truth rows by recipe id, filter ingredients to flower-like types
  const truthByName = new Map<string, { id: number; name: string; ingredients: TruthIngredient[] }>();
  for (const r of truthRowsRaw) {
    let entry = truthByName.get(r.name);
    if (!entry) {
      entry = { id: r.id, name: r.name, ingredients: [] };
      truthByName.set(r.name, entry);
    }
    if (r.ingredient_name && r.line_item_type && (TRUTH_FLOWER_TYPES as readonly string[]).includes(r.line_item_type.toLowerCase())) {
      entry.ingredients.push({
        ingredient_name: r.ingredient_name,
        line_item_type: r.line_item_type,
        quantity: r.quantity,
        line_item_no: r.line_item_no,
      });
    }
  }

  const ourByName = new Map<string, { id: number; name: string; ingredients: OurIngredient[] }>();
  for (const r of ourRowsRaw) {
    let entry = ourByName.get(r.name);
    if (!entry) {
      entry = { id: r.id, name: r.name, ingredients: [] };
      ourByName.set(r.name, entry);
    }
    if (r.ingredient_name) {
      entry.ingredients.push({
        ingredient_name: r.ingredient_name,
        quantity: r.quantity,
        is_foliage: r.is_foliage ?? 0,
      });
    }
  }

  // Recipe name matching: pass 1 exact (case-insensitive), pass 2 fuzzy
  type OurEntry = { id: number; name: string; ingredients: OurIngredient[] };
  const ourPool = new Map<string, OurEntry>(Array.from(ourByName.entries()).map(([k, v]) => [normalize(k), v]));
  const usedOur = new Set<number>();
  const recipes: RecipeComparison[] = [];

  for (const [truthName, truthEntry] of truthByName) {
    const norm = normalize(truthName);
    let our: OurEntry | undefined = ourPool.get(norm);
    let nameMatch: 'exact' | 'fuzzy' | 'truth_only' = 'truth_only';
    let nameSim: number | undefined;

    if (our && !usedOur.has(our.id)) {
      nameMatch = 'exact';
      usedOur.add(our.id);
    } else {
      our = undefined;
      let best: { entry: OurEntry; score: number } | null = null;
      for (const [, candidate] of ourByName) {
        if (usedOur.has(candidate.id)) continue;
        const score = similarity(truthName, candidate.name);
        if (score >= RECIPE_NAME_THRESHOLD && (!best || score > best.score)) {
          best = { entry: candidate, score };
        }
      }
      if (best) {
        our = best.entry;
        nameMatch = 'fuzzy';
        nameSim = best.score;
        usedOur.add(our.id);
      }
    }

    const ingredients = matchIngredients(truthEntry.ingredients, our?.ingredients ?? []);

    recipes.push({
      truth_name: truthName,
      our_name: our?.name ?? null,
      our_id: our?.id ?? null,
      name_match: nameMatch,
      name_similarity: nameSim,
      truth_ingredient_count: truthEntry.ingredients.length,
      our_ingredient_count: our?.ingredients.length ?? 0,
      exact_ingredient_matches: ingredients.filter(i => i.match === 'exact').length,
      fuzzy_ingredient_matches: ingredients.filter(i => i.match === 'fuzzy').length,
      truth_only_ingredients: ingredients.filter(i => i.match === 'truth_only').length,
      ours_only_ingredients: ingredients.filter(i => i.match === 'ours_only').length,
      qty_mismatches: ingredients.filter(i => (i.match === 'exact' || i.match === 'fuzzy') && !i.qty_match).length,
      ingredients,
    });
  }

  // Recipes only in our DB (not matched to any truth recipe)
  const oursOnly: Array<{ id: number; name: string }> = [];
  for (const [, our] of ourByName) {
    if (!usedOur.has(our.id)) oursOnly.push({ id: our.id, name: our.name });
  }

  const summary = {
    arrangements_exact: recipes.filter(r => r.name_match === 'exact').length,
    arrangements_fuzzy: recipes.filter(r => r.name_match === 'fuzzy').length,
    arrangements_truth_only: recipes.filter(r => r.name_match === 'truth_only').length,
    arrangements_ours_only: oursOnly.length,
    truth_ingredients_total: recipes.reduce((a, r) => a + r.truth_ingredient_count, 0),
    our_ingredients_total: recipes.reduce((a, r) => a + r.our_ingredient_count, 0),
    ingredient_exact: recipes.reduce((a, r) => a + r.exact_ingredient_matches, 0),
    ingredient_fuzzy: recipes.reduce((a, r) => a + r.fuzzy_ingredient_matches, 0),
    ingredient_truth_only: recipes.reduce((a, r) => a + r.truth_only_ingredients, 0),
    ingredient_ours_only: recipes.reduce((a, r) => a + r.ours_only_ingredients, 0),
    qty_mismatches: recipes.reduce((a, r) => a + r.qty_mismatches, 0),
  };

  return {
    generated_at: new Date().toISOString(),
    truth_count: truthByName.size,
    our_count: ourByName.size,
    recipes,
    ours_only_recipes: oursOnly,
    summary,
  };
}

function matchIngredients(truth: TruthIngredient[], ours: OurIngredient[]): IngredientMatch[] {
  const out: IngredientMatch[] = [];
  const usedOurs = new Set<number>();

  // Pass 1: exact normalized match
  for (const t of truth) {
    const tNorm = normalize(t.ingredient_name);
    let matchedIdx = -1;
    for (let i = 0; i < ours.length; i++) {
      if (usedOurs.has(i)) continue;
      if (normalize(ours[i].ingredient_name) === tNorm) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      const o = ours[matchedIdx];
      usedOurs.add(matchedIdx);
      out.push({
        truth: t,
        ours: o,
        match: 'exact',
        qty_match: qtyEqual(t.quantity, o.quantity),
      });
    } else {
      out.push({ truth: t, ours: null, match: 'truth_only', qty_match: false });
    }
  }

  // Pass 2: fuzzy match, replace truth_only entries that find a partner
  for (let oi = 0; oi < ours.length; oi++) {
    if (usedOurs.has(oi)) continue;
    let best: { idx: number; score: number } | null = null;
    for (let ri = 0; ri < out.length; ri++) {
      const r = out[ri];
      if (r.match !== 'truth_only' || !r.truth) continue;
      const score = similarity(r.truth.ingredient_name, ours[oi].ingredient_name);
      if (score >= INGREDIENT_NAME_THRESHOLD && (!best || score > best.score)) {
        best = { idx: ri, score };
      }
    }
    if (best) {
      const r = out[best.idx];
      const o = ours[oi];
      usedOurs.add(oi);
      out[best.idx] = {
        truth: r.truth,
        ours: o,
        match: 'fuzzy',
        similarity: best.score,
        qty_match: qtyEqual(r.truth!.quantity, o.quantity),
      };
    }
  }

  // Pass 3: any remaining ours rows are ours-only
  for (let oi = 0; oi < ours.length; oi++) {
    if (usedOurs.has(oi)) continue;
    out.push({ truth: null, ours: ours[oi], match: 'ours_only', qty_match: false });
  }

  return out;
}

function qtyEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.001;
}
