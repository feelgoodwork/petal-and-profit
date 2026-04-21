/**
 * Reclassify existing cost records with updated classifier rules and apply
 * the per-stem sanity ceiling. Specifically:
 *
 * 1. Find every ingredient_costs row whose source_line_item_id points at a
 *    description that classifies DIFFERENTLY now than it did at import time.
 *    If the new canonical points at a different catalog entry, re-point
 *    the cost row and the matching alias.
 *
 * 2. Flag any per-stem cost > SANITY_MAX_PER_STEM so it stops polluting the
 *    current-cost averages. (Row is kept — just marked is_current=false.)
 *
 * Usage:
 *   node scripts/cleanse-costs.js           # dry-run
 *   node scripts/cleanse-costs.js --apply   # commit changes
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { classifyProductType, isSupply, SANITY_MAX_PER_STEM } =
  require('../src/lib/matching/classifier-data.js');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const APPLY = process.argv.includes('--apply');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // --- 1. Reclassify cost rows whose source line item now classifies
    //        to a different canonical name ---
    const { rows: costs } = await client.query(`
      SELECT
        ic.id AS cost_id,
        ic.flower_id AS current_flower_id,
        ic.unit_cost, ic.vendor_id,
        fc.canonical_name AS current_canonical,
        li.description
      FROM ingredient_costs ic
      JOIN flower_catalog fc ON fc.id = ic.flower_id
      LEFT JOIN line_items li ON li.id = ic.source_line_item_id
      WHERE li.description IS NOT NULL
    `);

    const { rows: catalogRows } = await client.query(
      'SELECT id, canonical_name FROM flower_catalog'
    );
    const idByName = new Map(catalogRows.map(r => [r.canonical_name, r.id]));

    const reclassifications = [];
    for (const r of costs) {
      if (isSupply(r.description)) {
        reclassifications.push({
          cost_id: r.cost_id,
          kind: 'demote_supply',
          from: r.current_canonical,
          description: r.description,
        });
        continue;
      }
      const cl = classifyProductType(r.description);
      if (!cl) continue;
      if (cl.canonicalName === r.current_canonical) continue;
      const newId = idByName.get(cl.canonicalName);
      if (!newId) continue;
      reclassifications.push({
        cost_id: r.cost_id,
        kind: 'repoint',
        from: r.current_canonical,
        to: cl.canonicalName,
        new_flower_id: newId,
        description: r.description,
        unit_cost: r.unit_cost,
        vendor_id: r.vendor_id,
      });
    }

    // --- 2. Sanity ceiling: per-stem costs above the cap ---
    const { rows: overCap } = await client.query(
      `SELECT ic.id, ic.unit_cost, fc.canonical_name, li.description
         FROM ingredient_costs ic
         JOIN flower_catalog fc ON fc.id = ic.flower_id
         LEFT JOIN line_items li ON li.id = ic.source_line_item_id
         WHERE ic.cost_per = 'stem' AND ic.unit_cost > $1
         ORDER BY ic.unit_cost DESC`,
      [SANITY_MAX_PER_STEM]
    );

    // --- Report ---
    const repoints = reclassifications.filter(r => r.kind === 'repoint');
    const supplies = reclassifications.filter(r => r.kind === 'demote_supply');

    console.log(`Sanity ceiling: $${SANITY_MAX_PER_STEM}/stem`);
    console.log(`\nReclassification candidates: ${reclassifications.length}`);
    console.log(`  Re-point to correct catalog:  ${repoints.length}`);
    console.log(`  Demote (now classified as supply): ${supplies.length}`);
    console.log(`Over-cap per-stem records:  ${overCap.length}`);

    if (repoints.length) {
      console.log('\nRe-points (sample of 20):');
      for (const r of repoints.slice(0, 20)) {
        console.log(`  [$${Number(r.unit_cost).toFixed(2)}] "${(r.description||'').slice(0,50)}"  ${r.from}  →  ${r.to}`);
      }
    }
    if (supplies.length) {
      console.log('\nDemoted supplies (sample of 10):');
      for (const r of supplies.slice(0, 10)) {
        console.log(`  [${r.from}] "${(r.description||'').slice(0,60)}"`);
      }
    }
    if (overCap.length) {
      console.log('\nOver-cap (sample of 15):');
      for (const r of overCap.slice(0, 15)) {
        console.log(`  $${Number(r.unit_cost).toFixed(2).padStart(8)}  ${String(r.canonical_name).padEnd(20)}  ${(r.description||'').slice(0,60)}`);
      }
    }

    if (!APPLY) {
      console.log('\nDry-run. Re-run with --apply.');
      return;
    }

    await client.query('BEGIN');
    try {
      // Re-point cost + alias to correct flower
      for (const r of repoints) {
        await client.query(
          'UPDATE ingredient_costs SET flower_id = $1 WHERE id = $2',
          [r.new_flower_id, r.cost_id]
        );
        await client.query(
          `UPDATE flower_aliases SET flower_id = $1
             WHERE alias = $2 AND (vendor_id = $3 OR (vendor_id IS NULL AND $3 IS NULL))`,
          [r.new_flower_id, r.description, r.vendor_id]
        );
      }
      // Demote cost rows that are now flagged as supplies (mark not-current
      // rather than delete, so we can audit).
      for (const r of supplies) {
        await client.query(
          'UPDATE ingredient_costs SET is_current = false WHERE id = $1',
          [r.cost_id]
        );
      }
      // Apply sanity ceiling — over-cap rows are forced not-current.
      await client.query(
        "UPDATE ingredient_costs SET is_current = false WHERE cost_per = 'stem' AND unit_cost > $1",
        [SANITY_MAX_PER_STEM]
      );
      await client.query('COMMIT');
      console.log(`\nApplied: ${repoints.length} repoints, ${supplies.length} supply demotions, ${overCap.length} over-cap demotions.`);
      console.log('Run rebuild-profitability.js to recompute margins with the cleaned cost pool.');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Rolled back:', e.message);
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
