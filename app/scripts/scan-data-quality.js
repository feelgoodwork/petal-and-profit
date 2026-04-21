/**
 * Data quality scan. Deterministic passes only (no AI yet).
 *
 * Writes findings to the `data_quality_findings` table in the store DB.
 * Each (kind, subject_type, subject_id) triple is kept unique among 'open'
 * rows via a partial unique index, so re-running doesn't double-create
 * open findings — it just refreshes the details.
 *
 * Usage:
 *   node scripts/scan-data-quality.js            # run all passes
 *   node scripts/scan-data-quality.js --apply    # alias (for consistency)
 *   node scripts/scan-data-quality.js --pass=price_outlier
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const rulesPath = path.join(__dirname, '..', 'src', 'lib', 'data-quality-rules.json');
const RULES = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));

const onlyPassArg = process.argv.find(a => a.startsWith('--pass='));
const ONLY_PASS = onlyPassArg ? onlyPassArg.split('=')[1] : null;

function ceilingFor(baseType) {
  if (baseType && baseType in RULES.price_ceilings_per_stem) return RULES.price_ceilings_per_stem[baseType];
  return RULES.price_ceilings_per_stem._default ?? 15;
}

function ruleSnippetForTypo(from, to) {
  return JSON.stringify({
    typo_fixes: { [from.toLowerCase()]: { to, why: 'detected by data-quality scan' } },
  }, null, 2);
}

function ruleSnippetForNotFlower(pattern) {
  return JSON.stringify({
    not_a_flower_patterns: [{ pattern, why: 'detected by data-quality scan' }],
  }, null, 2);
}

async function upsertFinding(client, f) {
  // If an open finding for this (kind, subject_type, subject_id) already
  // exists, update it. Otherwise insert. subject_id may be null for bulk
  // kinds; in that case we always insert.
  if (f.subject_id != null) {
    const { rows } = await client.query(
      `SELECT id FROM data_quality_findings
         WHERE kind = $1 AND subject_type = $2 AND subject_id = $3 AND status = 'open'`,
      [f.kind, f.subject_type, f.subject_id]
    );
    if (rows.length > 0) {
      await client.query(
        `UPDATE data_quality_findings
           SET severity = $2, summary = $3, details = $4::jsonb, suggested_fix = $5, rule_snippet = $6
           WHERE id = $1`,
        [rows[0].id, f.severity, f.summary, JSON.stringify(f.details || {}), f.suggested_fix, f.rule_snippet]
      );
      return { updated: true };
    }
  }
  await client.query(
    `INSERT INTO data_quality_findings
       (kind, severity, subject_type, subject_id, summary, details, suggested_fix, rule_snippet)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [f.kind, f.severity, f.subject_type, f.subject_id, f.summary, JSON.stringify(f.details || {}), f.suggested_fix, f.rule_snippet]
  );
  return { inserted: true };
}

// ---- Passes ----

async function passPriceOutlier(client) {
  // Per-stem costs above the base_type ceiling (rules-driven).
  const { rows } = await client.query(`
    SELECT ic.id, ic.unit_cost, fc.canonical_name, fc.base_type, li.description, li.id AS line_item_id
    FROM ingredient_costs ic
    JOIN flower_catalog fc ON fc.id = ic.flower_id
    LEFT JOIN line_items li ON li.id = ic.source_line_item_id
    WHERE ic.cost_per = 'stem'
  `);

  let found = 0;
  for (const r of rows) {
    const cap = ceilingFor(r.base_type);
    if (Number(r.unit_cost) <= cap) continue;
    const severity = Number(r.unit_cost) > cap * 5 ? 'high' : 'medium';
    await upsertFinding(client, {
      kind: 'price_outlier',
      severity,
      subject_type: 'ingredient_costs',
      subject_id: r.id,
      summary: `$${Number(r.unit_cost).toFixed(2)}/stem on ${r.canonical_name} (cap for ${r.base_type || 'default'} is $${cap})`,
      details: {
        unit_cost: Number(r.unit_cost),
        canonical_name: r.canonical_name,
        base_type: r.base_type,
        ceiling: cap,
        source_description: r.description,
        source_line_item_id: r.line_item_id,
      },
      suggested_fix: 'Likely bunch price parsed as per-stem, or misclassification. Mark is_current=false or re-point to correct catalog entry.',
    });
    found++;
  }
  return { pass: 'price_outlier', found };
}

async function passDuplicateCatalog(client) {
  // Find catalog entries whose lowercased canonical_name is a duplicate of
  // another entry (case variants), or whose canonical_name is contained in
  // another entry without being a meaningful suffix.
  const { rows: catalog } = await client.query(
    'SELECT id, canonical_name, base_type, category FROM flower_catalog ORDER BY canonical_name'
  );

  const byLower = new Map();
  for (const c of catalog) {
    const k = c.canonical_name.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, []);
    byLower.get(k).push(c);
  }

  let found = 0;
  for (const [key, entries] of byLower) {
    if (entries.length < 2) continue;
    const keep = entries[0];
    for (const dup of entries.slice(1)) {
      await upsertFinding(client, {
        kind: 'duplicate_catalog',
        severity: 'medium',
        subject_type: 'flower_catalog',
        subject_id: dup.id,
        summary: `"${dup.canonical_name}" duplicates "${keep.canonical_name}" (same name, case variant)`,
        details: {
          duplicate_id: dup.id,
          canonical_duplicate: dup.canonical_name,
          canonical_keeper: keep.canonical_name,
          keeper_id: keep.id,
          key,
        },
        suggested_fix: `Consolidate costs/aliases onto id ${keep.id}, delete id ${dup.id}.`,
      });
      found++;
    }
  }
  return { pass: 'duplicate_catalog', found };
}

async function passUnusedCatalog(client) {
  // Catalog entries with zero costs AND zero recipe ingredient references.
  const { rows } = await client.query(`
    SELECT fc.id, fc.canonical_name, fc.category, fc.base_type
    FROM flower_catalog fc
    WHERE NOT EXISTS (SELECT 1 FROM ingredient_costs ic WHERE ic.flower_id = fc.id)
      AND NOT EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.flower_id = fc.id)
      AND NOT EXISTS (SELECT 1 FROM flower_aliases fa WHERE fa.flower_id = fc.id)
  `);
  let found = 0;
  for (const r of rows) {
    await upsertFinding(client, {
      kind: 'unused_catalog',
      severity: 'low',
      subject_type: 'flower_catalog',
      subject_id: r.id,
      summary: `"${r.canonical_name}" has no costs, no recipes, no aliases`,
      details: { canonical_name: r.canonical_name, base_type: r.base_type, category: r.category },
      suggested_fix: 'Likely a classifier artifact. Safe to delete.',
    });
    found++;
  }
  return { pass: 'unused_catalog', found };
}

async function passQuantityOutlier(client) {
  // Recipe ingredient rows with qty > 100 (typo/parse) or 0 < qty < 0.25.
  const { rows } = await client.query(`
    SELECT ri.id, ri.recipe_id, ri.ingredient_name, ri.quantity, r.name AS recipe_name
    FROM recipe_ingredients ri
    JOIN recipes r ON r.id = ri.recipe_id
    WHERE (ri.quantity > 100 OR (ri.quantity > 0 AND ri.quantity < 0.25))
  `);
  let found = 0;
  for (const r of rows) {
    const severity = Number(r.quantity) > 200 ? 'high' : 'medium';
    await upsertFinding(client, {
      kind: 'quantity_outlier',
      severity,
      subject_type: 'recipe_ingredients',
      subject_id: r.id,
      summary: `Recipe "${r.recipe_name}" has ${r.quantity} × ${r.ingredient_name}`,
      details: { recipe_id: r.recipe_id, recipe_name: r.recipe_name, ingredient_name: r.ingredient_name, quantity: Number(r.quantity) },
      suggested_fix: 'Likely a parse error (extra digit, fraction misread). Open the recipe and verify against the source PDF.',
    });
    found++;
  }
  return { pass: 'quantity_outlier', found };
}

async function passRecipeCostAnomaly(client) {
  // Recipes where the computed margin is extreme: <-50% or >95% with at
  // least one ingredient matched. Those are nearly always data errors
  // rather than true loss leaders / freebies.
  const { rows } = await client.query(`
    SELECT ps.id AS snap_id, ps.recipe_id, ps.sell_price, ps.total_cost, ps.margin_pct,
           ps.missing_ingredients, r.name,
           (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS total_ing,
           (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id AND ri.flower_id IS NOT NULL) AS matched_ing
    FROM profitability_snapshots ps
    JOIN recipes r ON r.id = ps.recipe_id
    WHERE (ps.margin_pct < -50 OR ps.margin_pct > 95)
      AND ps.total_cost IS NOT NULL
  `);
  let found = 0;
  for (const r of rows) {
    const anomalyKind = Number(r.margin_pct) < -50 ? 'negative' : 'too-good';
    const severity = Number(r.margin_pct) < -100 || Number(r.margin_pct) > 98 ? 'high' : 'medium';
    await upsertFinding(client, {
      kind: 'recipe_cost_anomaly',
      severity,
      subject_type: 'recipes',
      subject_id: r.recipe_id,
      summary: `"${r.name}": margin ${Number(r.margin_pct).toFixed(1)}% (${anomalyKind}), cost $${Number(r.total_cost).toFixed(2)} vs sell $${Number(r.sell_price).toFixed(2)}`,
      details: {
        recipe_name: r.name,
        margin_pct: Number(r.margin_pct),
        total_cost: Number(r.total_cost),
        sell_price: Number(r.sell_price),
        missing_ingredients: Number(r.missing_ingredients),
        total_ingredients: Number(r.total_ing),
        matched_ingredients: Number(r.matched_ing),
      },
      suggested_fix: anomalyKind === 'negative'
        ? 'Check cost sources — an outlier cost record is probably dragging total_cost up. Re-price the noisy ingredient or cap it.'
        : 'Likely missing ingredient costs (tiered fallback found none). Add cost data for the unpriced ingredients.',
    });
    found++;
  }
  return { pass: 'recipe_cost_anomaly', found };
}

async function passCompositeDescription(client) {
  const patterns = RULES.composite_ingredient_patterns.map(p => ({ re: new RegExp(p.pattern, 'i'), why: p.why }));
  const { rows } = await client.query(`
    SELECT li.id, li.description, r.vendor_id, v.name AS vendor_name
    FROM line_items li
    JOIN receipts r ON r.id = li.receipt_id
    LEFT JOIN vendors v ON v.id = r.vendor_id
    WHERE li.is_flower = 1
  `);
  let found = 0;
  for (const r of rows) {
    for (const p of patterns) {
      if (!p.re.test(r.description)) continue;
      await upsertFinding(client, {
        kind: 'composite_description',
        severity: 'medium',
        subject_type: 'line_items',
        subject_id: r.id,
        summary: `Composite vendor line: "${String(r.description).slice(0, 70)}"`,
        details: {
          description: r.description,
          vendor_name: r.vendor_name,
          matched_pattern: p.re.source,
          why: p.why,
        },
        suggested_fix: 'This line mixes multiple products. Cost data tied to it is unreliable — mark is_current=false, or split into distinct line items manually.',
      });
      found++;
      break; // one finding per line
    }
  }
  return { pass: 'composite_description', found };
}

async function passNotAFlower(client) {
  const patterns = RULES.not_a_flower_patterns.map(p => ({ re: new RegExp(p.pattern, 'i'), why: p.why, raw: p.pattern }));
  const { rows } = await client.query(`
    SELECT li.id, li.description
    FROM line_items li
    WHERE li.is_flower = 1
  `);
  let found = 0;
  for (const r of rows) {
    for (const p of patterns) {
      if (!p.re.test(r.description)) continue;
      await upsertFinding(client, {
        kind: 'not_a_flower',
        severity: 'low',
        subject_type: 'line_items',
        subject_id: r.id,
        summary: `Not-a-flower pattern matched: "${String(r.description).slice(0, 70)}"`,
        details: { description: r.description, matched_pattern: p.raw, why: p.why },
        suggested_fix: 'Flip is_flower=0 to exclude from cost calculations.',
        rule_snippet: ruleSnippetForNotFlower(p.raw),
      });
      found++;
      break;
    }
  }
  return { pass: 'not_a_flower', found };
}

const PASSES = {
  price_outlier: passPriceOutlier,
  duplicate_catalog: passDuplicateCatalog,
  unused_catalog: passUnusedCatalog,
  quantity_outlier: passQuantityOutlier,
  recipe_cost_anomaly: passRecipeCostAnomaly,
  composite_description: passCompositeDescription,
  not_a_flower: passNotAFlower,
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const toRun = ONLY_PASS ? [ONLY_PASS] : Object.keys(PASSES);
    console.log(`Running passes: ${toRun.join(', ')}\n`);
    for (const name of toRun) {
      if (!PASSES[name]) { console.error(`Unknown pass: ${name}`); continue; }
      const res = await PASSES[name](client);
      console.log(`  ${res.pass.padEnd(24)} ${res.found} finding(s)`);
    }
    const { rows: [summary] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
        COUNT(*) FILTER (WHERE status = 'dismissed')::int AS dismissed
      FROM data_quality_findings
    `);
    console.log(`\nFindings: ${summary.open} open · ${summary.accepted} accepted · ${summary.dismissed} dismissed`);
    console.log('Review at /admin/data-quality');
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
