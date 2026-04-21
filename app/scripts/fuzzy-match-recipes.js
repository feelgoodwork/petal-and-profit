/**
 * Phase 3: fuzzy-match remaining unmatched recipe_ingredients against the
 * flower catalog. Auto-accepts matches at or above the threshold; lower
 * confidence rows get match_status='fuzzy_suggested' for the phase 5
 * review page to pick up.
 *
 * Usage:
 *   node scripts/fuzzy-match-recipes.js            # dry-run (default)
 *   node scripts/fuzzy-match-recipes.js --apply    # commit changes
 *   node scripts/fuzzy-match-recipes.js --threshold 0.8 --apply
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js').default || require('fuse.js');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const APPLY = process.argv.includes('--apply');
const thresholdIdx = process.argv.indexOf('--threshold');
const AUTO_ACCEPT = thresholdIdx >= 0 ? parseFloat(process.argv[thresholdIdx + 1]) : 0.92;
const SUGGEST_MIN = 0.55; // anything below this is not even a suggestion

/**
 * Semantic guard: fuzzy edit-distance alone produces garbage like
 * "tips" → "tulips" or "millet" → "dusty miller". Require that the
 * candidate and the input share at least one meaningful word (≥4 chars).
 */
function shareMeaningfulWord(input, candidate) {
  const tokenize = (s) => s.toLowerCase().match(/[a-z]+/g) || [];
  const inputWords = new Set(tokenize(input).filter(w => w.length >= 4));
  const candWords = tokenize(candidate).filter(w => w.length >= 4);
  return candWords.some(w => inputWords.has(w));
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: catalog } = await client.query('SELECT id, canonical_name, base_type, category FROM flower_catalog');
  if (catalog.length === 0) {
    console.error('Catalog is empty. Run rebuild-catalog.js first.');
    await client.end();
    process.exit(1);
  }

  const fuse = new Fuse(catalog, {
    keys: ['canonical_name', 'base_type'],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 3,
  });

  const { rows: unmatched } = await client.query(`
    SELECT id, recipe_id, ingredient_name
    FROM recipe_ingredients
    WHERE flower_id IS NULL
      AND COALESCE(match_status, 'pending') NOT IN ('non_ingredient')
    ORDER BY recipe_id, id
  `);

  console.log(`Candidates: ${unmatched.length} unmatched recipe ingredients (auto-accept ≥${AUTO_ACCEPT}, suggest ≥${SUGGEST_MIN})`);

  let autoAccepted = 0;
  let suggested = 0;
  let rejected = 0;
  const accepts = [];
  const suggests = [];
  const rejects = [];

  for (const ing of unmatched) {
    const results = fuse.search(ing.ingredient_name);
    if (results.length === 0) {
      rejects.push({ ing, reason: 'no candidate' });
      rejected++;
      continue;
    }
    const top = results[0];
    const confidence = Math.max(0, 1 - (top.score ?? 1));

    const semanticOk = shareMeaningfulWord(ing.ingredient_name, top.item.canonical_name);
    // Single-word inputs can be orphan color/adjective stubs ("Blue", "Fern",
    // "grass") — even with a semantic match, auto-accepting them risks wrong
    // assignments. Send to review instead.
    const wordCount = (ing.ingredient_name.trim().match(/\S+/g) || []).length;
    const safeToAutoAccept = semanticOk && wordCount >= 2;

    if (confidence >= AUTO_ACCEPT && safeToAutoAccept) {
      accepts.push({ ing, flower_id: top.item.id, canonical: top.item.canonical_name, confidence });
      autoAccepted++;
    } else if (confidence >= SUGGEST_MIN && semanticOk) {
      suggests.push({ ing, flower_id: top.item.id, canonical: top.item.canonical_name, confidence });
      suggested++;
    } else {
      const why = !semanticOk ? `no shared word (${top.item.canonical_name}@${confidence.toFixed(2)})`
        : `best=${confidence.toFixed(2)} (${top.item.canonical_name})`;
      rejects.push({ ing, reason: why });
      rejected++;
    }
  }

  console.log(`\nAuto-accept (≥${AUTO_ACCEPT}): ${autoAccepted}`);
  console.log(`Suggest (${SUGGEST_MIN}–${AUTO_ACCEPT}):   ${suggested}`);
  console.log(`No match:                    ${rejected}`);

  console.log('\n--- Sample auto-accept ---');
  for (const a of accepts.slice(0, 15)) {
    console.log(`  ${a.confidence.toFixed(2)}  "${a.ing.ingredient_name}"  →  ${a.canonical}`);
  }
  console.log('\n--- Sample suggest ---');
  for (const s of suggests.slice(0, 15)) {
    console.log(`  ${s.confidence.toFixed(2)}  "${s.ing.ingredient_name}"  →  ${s.canonical}`);
  }
  console.log('\n--- Sample no-match ---');
  for (const r of rejects.slice(0, 10)) {
    console.log(`  "${r.ing.ingredient_name}"  (${r.reason})`);
  }

  if (!APPLY) {
    console.log('\nDry-run: no changes. Re-run with --apply.');
    await client.end();
    return;
  }

  console.log('\nApplying...');
  await client.query('BEGIN');
  try {
    for (const a of accepts) {
      await client.query(
        `UPDATE recipe_ingredients
           SET flower_id = $1, match_status = 'fuzzy_matched', match_confidence = $2
         WHERE id = $3`,
        [a.flower_id, a.confidence, a.ing.id]
      );
    }
    for (const s of suggests) {
      await client.query(
        `UPDATE recipe_ingredients
           SET flower_id = $1, match_status = 'fuzzy_suggested', match_confidence = $2
         WHERE id = $3`,
        [s.flower_id, s.confidence, s.ing.id]
      );
    }
    await client.query('COMMIT');
    console.log(`Committed ${autoAccepted} matches + ${suggested} suggestions.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rolled back:', e.message);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
