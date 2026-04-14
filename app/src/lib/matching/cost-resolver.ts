/**
 * Tiered cost resolution for flower ingredients.
 *
 * Lookup order:
 *   1. Exact match   — "hot pink gerberas" has its own cost data
 *   2. Color family   — "pink gerberas" (hot pink → pink)
 *   3. Base type      — "standard gerberas" (any gerbera)
 *   4. No data        — null
 *
 * Uses only is_current = true cost records.
 */

import { getDb } from '@/lib/db';

// Color family mapping: modifier → base color
const COLOR_FAMILY: Record<string, string> = {
  'hot pink': 'pink',
  'light pink': 'pink',
  'pale pink': 'pink',
  'dusty pink': 'pink',
  'antique pink': 'pink',
  'deep purple': 'purple',
  'dark orange': 'orange',
  'antique green': 'green',
  'pale green': 'green',
  'golden yellow': 'yellow',
  'deep coral': 'coral',
  'pale peach': 'peach',
};

export type CostTier = 'exact' | 'color_family' | 'base_type';

export interface ResolvedCost {
  avg_cost: number;
  min_cost: number;
  max_cost: number;
  latest_cost: number;
  latest_cost_date: string | null;
  cost_count: number;
  match_tier: CostTier;
  source_name: string;
  source_flower_id: number;
}

/**
 * Build a color-family variant name.
 * "hot pink gerberas" → try "pink gerberas"
 * "dusty pink roses" → try "pink roses"
 */
function getColorFamilyName(canonicalName: string): string | null {
  for (const [modifier, base] of Object.entries(COLOR_FAMILY)) {
    if (canonicalName.startsWith(modifier + ' ')) {
      return base + canonicalName.substring(modifier.length);
    }
  }
  return null;
}

/**
 * Load all current cost data into memory, grouped by flower_id.
 * Returns a map of flower_id → aggregated cost stats.
 */
export async function loadCurrentCosts(): Promise<Map<number, {
  avg_cost: number;
  min_cost: number;
  max_cost: number;
  latest_cost: number;
  latest_cost_date: string | null;
  cost_count: number;
}>> {
  const sql = getDb();

  const rows = await sql`
    SELECT
      flower_id,
      AVG(unit_cost)::numeric as avg_cost,
      MIN(unit_cost)::numeric as min_cost,
      MAX(unit_cost)::numeric as max_cost,
      COUNT(*)::int as cost_count
    FROM ingredient_costs
    WHERE is_current = true
    GROUP BY flower_id
  `;

  // Get latest cost per flower (by parsed_date)
  const latestRows = await sql`
    SELECT DISTINCT ON (flower_id)
      flower_id, unit_cost as latest_cost, invoice_date as latest_cost_date
    FROM ingredient_costs
    WHERE is_current = true
    ORDER BY flower_id, parsed_date DESC NULLS LAST, id DESC
  `;

  const latestMap = new Map<number, { latest_cost: number; latest_cost_date: string | null }>();
  for (const r of latestRows) {
    latestMap.set(Number(r.flower_id), {
      latest_cost: Number(r.latest_cost),
      latest_cost_date: r.latest_cost_date ? String(r.latest_cost_date) : null,
    });
  }

  const result = new Map<number, {
    avg_cost: number;
    min_cost: number;
    max_cost: number;
    latest_cost: number;
    latest_cost_date: string | null;
    cost_count: number;
  }>();

  for (const row of rows) {
    const fid = Number(row.flower_id);
    const latest = latestMap.get(fid);
    result.set(fid, {
      avg_cost: Number(row.avg_cost),
      min_cost: Number(row.min_cost),
      max_cost: Number(row.max_cost),
      latest_cost: latest?.latest_cost ?? Number(row.avg_cost),
      latest_cost_date: latest?.latest_cost_date ?? null,
      cost_count: Number(row.cost_count),
    });
  }

  return result;
}

/**
 * Load flower catalog into memory for fallback lookups.
 */
export async function loadCatalogIndex(): Promise<{
  byId: Map<number, { canonical_name: string; base_type: string | null }>;
  byName: Map<string, number>;
}> {
  const sql = getDb();
  const catalog = await sql`SELECT id, canonical_name, base_type FROM flower_catalog`;

  const byId = new Map<number, { canonical_name: string; base_type: string | null }>();
  const byName = new Map<string, number>();

  for (const c of catalog) {
    const id = Number(c.id);
    const name = String(c.canonical_name);
    byId.set(id, {
      canonical_name: name,
      base_type: c.base_type ? String(c.base_type) : null,
    });
    byName.set(name, id);
  }

  return { byId, byName };
}

/**
 * Resolve cost for a single flower_id using tiered fallback.
 */
export function resolveFlowerCost(
  flowerId: number,
  costs: Map<number, {
    avg_cost: number; min_cost: number; max_cost: number;
    latest_cost: number; latest_cost_date: string | null; cost_count: number;
  }>,
  catalogById: Map<number, { canonical_name: string; base_type: string | null }>,
  catalogByName: Map<string, number>,
): ResolvedCost | null {
  const entry = catalogById.get(flowerId);
  if (!entry) return null;

  // Tier 1: Exact match
  const exactCost = costs.get(flowerId);
  if (exactCost && exactCost.cost_count > 0) {
    return {
      ...exactCost,
      match_tier: 'exact',
      source_name: entry.canonical_name,
      source_flower_id: flowerId,
    };
  }

  // Tier 2: Color family fallback
  const familyName = getColorFamilyName(entry.canonical_name);
  if (familyName) {
    const familyId = catalogByName.get(familyName);
    if (familyId) {
      const familyCost = costs.get(familyId);
      if (familyCost && familyCost.cost_count > 0) {
        return {
          ...familyCost,
          match_tier: 'color_family',
          source_name: familyName,
          source_flower_id: familyId,
        };
      }
    }
  }

  // Tier 3: Base type fallback
  if (entry.base_type && entry.base_type !== entry.canonical_name) {
    const baseId = catalogByName.get(entry.base_type);
    if (baseId) {
      const baseCost = costs.get(baseId);
      if (baseCost && baseCost.cost_count > 0) {
        return {
          ...baseCost,
          match_tier: 'base_type',
          source_name: entry.base_type,
          source_flower_id: baseId,
        };
      }
    }
  }

  return null;
}
