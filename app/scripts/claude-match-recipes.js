/**
 * Phase 4: Claude-assisted classification of remaining unmatched recipe
 * ingredients. Includes the recipe name and sibling ingredients in the
 * prompt so Claude can disambiguate short/ambiguous names with context.
 *
 * Auto-accepts results at or above 0.80 confidence as 'claude_matched'.
 * Lower-confidence results are stored as 'claude_suggested' for the
 * phase 5 review page.
 *
 * Usage:
 *   node scripts/claude-match-recipes.js              # dry-run (default)
 *   node scripts/claude-match-recipes.js --apply      # commit
 *   node scripts/claude-match-recipes.js --threshold 0.9 --apply
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const APPLY = process.argv.includes('--apply');
const thresholdIdx = process.argv.indexOf('--threshold');
const AUTO_ACCEPT = thresholdIdx >= 0 ? parseFloat(process.argv[thresholdIdx + 1]) : 0.8;
const BATCH_SIZE = 20;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: catalog } = await client.query(
    'SELECT canonical_name, base_type, category FROM flower_catalog ORDER BY canonical_name'
  );
  const catalogNames = new Set(catalog.map(c => c.canonical_name));
  const catalogList = catalog.map(c => c.canonical_name).join(', ');

  // Pull unmatched rows (include 'fuzzy_suggested' so Claude can confirm/override)
  const { rows: targets } = await client.query(`
    SELECT ri.id, ri.recipe_id, ri.ingredient_name, ri.match_status,
           r.name AS recipe_name,
           (SELECT STRING_AGG(DISTINCT ri2.ingredient_name, ' | ')
              FROM recipe_ingredients ri2
              WHERE ri2.recipe_id = ri.recipe_id
                AND ri2.id <> ri.id
                AND ri2.flower_id IS NOT NULL) AS siblings
    FROM recipe_ingredients ri
    JOIN recipes r ON r.id = ri.recipe_id
    WHERE ri.flower_id IS NULL
      AND COALESCE(ri.match_status, 'pending') IN ('pending', 'fuzzy_suggested')
    ORDER BY ri.recipe_id, ri.id
  `);

  // Also include fuzzy_suggested (even though they have a flower_id) for re-confirmation
  const { rows: fuzzySuggested } = await client.query(`
    SELECT ri.id, ri.recipe_id, ri.ingredient_name, ri.match_status,
           r.name AS recipe_name,
           (SELECT STRING_AGG(DISTINCT ri2.ingredient_name, ' | ')
              FROM recipe_ingredients ri2
              WHERE ri2.recipe_id = ri.recipe_id
                AND ri2.id <> ri.id
                AND ri2.match_status NOT IN ('fuzzy_suggested', 'claude_suggested', 'pending')) AS siblings
    FROM recipe_ingredients ri
    JOIN recipes r ON r.id = ri.recipe_id
    WHERE ri.match_status = 'fuzzy_suggested'
    ORDER BY ri.recipe_id, ri.id
  `);

  // Merge uniq by id
  const byId = new Map();
  for (const t of targets) byId.set(t.id, t);
  for (const t of fuzzySuggested) byId.set(t.id, t);
  const allTargets = Array.from(byId.values());

  console.log(`Candidates: ${allTargets.length} rows to classify via Claude (auto-accept ≥${AUTO_ACCEPT})`);
  console.log(`Batch size: ${BATCH_SIZE}, catalog size: ${catalog.length}\n`);

  if (allTargets.length === 0) {
    await client.end();
    return;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const accepts = [];
  const suggests = [];
  const rejects = [];

  for (let i = 0; i < allTargets.length; i += BATCH_SIZE) {
    const batch = allTargets.slice(i, i + BATCH_SIZE);
    const items = batch.map((t, idx) => {
      const sib = (t.siblings || '').split(' | ').filter(Boolean).slice(0, 8).join(', ');
      return `${idx + 1}. name="${t.ingredient_name}" | recipe="${t.recipe_name}" | siblings: ${sib || '(none)'}`;
    }).join('\n');

    const prompt = `You are a wholesale florist expert matching recipe ingredient names to a canonical flower catalog.

The catalog contains these exact canonical names:
${catalogList}

For each ingredient below, choose the single best-matching catalog entry. Use the recipe name and sibling ingredients as context to disambiguate short or truncated names. Return the EXACT canonical name from the list, or null if nothing fits. Also return true/false whether this is a real flower/foliage ingredient (false = supply, container, note, truncated garbage).

Return ONLY a JSON array. Each element:
{"index": N, "canonical_name": "..." or null, "is_ingredient": true/false, "confidence": 0.0-1.0, "reasoning": "brief"}

Items:
${items}`;

    let parsed;
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });
      let text = response.content[0].text.trim();
      text = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
      parsed = JSON.parse(text);
    } catch (e) {
      console.error(`Batch starting at ${i} failed:`, e.message);
      for (const t of batch) rejects.push({ ing: t, reason: 'batch error' });
      continue;
    }

    for (const r of parsed) {
      const t = batch[r.index - 1];
      if (!t) continue;

      if (!r.is_ingredient) {
        // Only downgrade to 'non_ingredient' when Claude is actually confident
        // the row is a supply (not just when it couldn't find a catalog match).
        // A real flower without a catalog entry should stay 'pending' for
        // manual review, not get buried as a supply.
        const reasoning = String(r.reasoning || '').toLowerCase();
        const looksLikeSupply = /supply|container|note|garbage|truncat|ribbon|foam|candle|card|tape|ornament|decorat/.test(reasoning);
        const highConfSupply = Number(r.confidence ?? 0) >= 0.8 && looksLikeSupply;
        rejects.push({
          ing: t,
          reason: `flagged non-ingredient: ${r.reasoning || 'no reason'}`,
          markAs: highConfSupply ? 'non_ingredient' : null,
        });
        continue;
      }
      if (!r.canonical_name || !catalogNames.has(r.canonical_name)) {
        rejects.push({ ing: t, reason: `no catalog match (suggested: ${r.canonical_name ?? 'null'})` });
        continue;
      }

      const confidence = Number(r.confidence ?? 0);
      if (confidence >= AUTO_ACCEPT) {
        accepts.push({ ing: t, canonical: r.canonical_name, confidence, reasoning: r.reasoning });
      } else if (confidence >= 0.5) {
        suggests.push({ ing: t, canonical: r.canonical_name, confidence, reasoning: r.reasoning });
      } else {
        rejects.push({ ing: t, reason: `low confidence ${confidence.toFixed(2)} → ${r.canonical_name}` });
      }
    }

    process.stdout.write(`  processed ${Math.min(i + BATCH_SIZE, allTargets.length)}/${allTargets.length}\r`);
  }
  console.log('\n');

  console.log(`Auto-accept ≥${AUTO_ACCEPT}: ${accepts.length}`);
  console.log(`Suggest 0.5–${AUTO_ACCEPT}:    ${suggests.length}`);
  console.log(`Reject / non-ingredient: ${rejects.length}\n`);

  console.log('--- Sample auto-accept ---');
  for (const a of accepts.slice(0, 15)) {
    console.log(`  ${a.confidence.toFixed(2)}  "${a.ing.ingredient_name}"  →  ${a.canonical}`);
    if (a.reasoning) console.log(`         ${a.reasoning}`);
  }
  console.log('\n--- Sample suggest ---');
  for (const s of suggests.slice(0, 10)) {
    console.log(`  ${s.confidence.toFixed(2)}  "${s.ing.ingredient_name}"  →  ${s.canonical}`);
  }
  console.log('\n--- Sample reject ---');
  for (const r of rejects.slice(0, 10)) {
    console.log(`  "${r.ing.ingredient_name}"  (${r.reason})`);
  }

  if (!APPLY) {
    console.log('\nDry-run: no changes. Re-run with --apply.');
    await client.end();
    return;
  }

  console.log('\nApplying...');

  // Build a lookup of catalog name → id
  const { rows: catalogRows } = await client.query('SELECT id, canonical_name FROM flower_catalog');
  const catalogIdByName = new Map(catalogRows.map(c => [c.canonical_name, c.id]));

  await client.query('BEGIN');
  try {
    for (const a of accepts) {
      const flowerId = catalogIdByName.get(a.canonical);
      if (!flowerId) continue;
      await client.query(
        `UPDATE recipe_ingredients
           SET flower_id = $1, match_status = 'claude_matched', match_confidence = $2
         WHERE id = $3`,
        [flowerId, a.confidence, a.ing.id]
      );
    }
    for (const s of suggests) {
      const flowerId = catalogIdByName.get(s.canonical);
      if (!flowerId) continue;
      await client.query(
        `UPDATE recipe_ingredients
           SET flower_id = $1, match_status = 'claude_suggested', match_confidence = $2
         WHERE id = $3`,
        [flowerId, s.confidence, s.ing.id]
      );
    }
    // Mark confirmed non-ingredients
    for (const r of rejects) {
      if (r.markAs === 'non_ingredient') {
        await client.query(
          `UPDATE recipe_ingredients SET match_status = 'non_ingredient' WHERE id = $1`,
          [r.ing.id]
        );
      }
    }
    await client.query('COMMIT');
    console.log(`Committed ${accepts.length} matches + ${suggests.length} suggestions.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rolled back:', e.message);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
