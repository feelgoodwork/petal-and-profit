/**
 * Phase 2 surgical cleanup: merge orphan recipe_ingredient rows that are
 * PDF-parser artifacts (single adjectives, unclosed quotes, trailing nouns)
 * with their adjacent sibling rows in the same recipe.
 *
 * Strategy:
 *   1. Pull all unmatched rows whose name looks like an orphan fragment.
 *   2. For each orphan, find prev / next sibling rows in the same recipe
 *      (ordered by id, which mirrors insertion order since the parser writes
 *      rows in reading order).
 *   3. Try merging orphan + next → does the combined name classify?
 *      If so, update the next row's name and delete the orphan.
 *   4. If not, try prev + orphan → same.
 *   5. Otherwise, if the orphan is a redundant noun (leaf/leaves/grass) and
 *      the prev row is a valid foliage/flower, just delete the orphan.
 *   6. Remaining orphans get a dry-run report for manual review.
 *
 * Usage:
 *   node scripts/merge-orphan-fragments.js          # dry-run (default)
 *   node scripts/merge-orphan-fragments.js --apply  # commit changes
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { classifyProductType, isSupply } = require('../src/lib/matching/classifier-data.js');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const APPLY = process.argv.includes('--apply');

const ADJECTIVE_ORPHANS = new Set([
  'variegated', 'seeded', 'dusty', 'hot', 'light', 'pale', 'dark',
  'antique', 'deep', 'mini', 'standard', 'small', 'large', 'medium',
  'lime', 'golden',
]);

const REDUNDANT_NOUN_ORPHANS = new Set([
  'leaf', 'leaves', 'grass', 'greens', 'foliage',
]);

function hasUnclosedQuote(text) {
  const count = (text.match(/['"‘’“”]/g) || []).length;
  return count % 2 === 1;
}

function isOrphanCandidate(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/);

  if (words.length === 1 && ADJECTIVE_ORPHANS.has(lower)) return true;
  if (words.length === 1 && REDUNDANT_NOUN_ORPHANS.has(lower)) return true;
  if (hasUnclosedQuote(trimmed)) return true;
  return false;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: orphans } = await client.query(`
    SELECT id, recipe_id, ingredient_name, quantity, is_foliage
    FROM recipe_ingredients
    WHERE flower_id IS NULL
      AND COALESCE(match_status, 'pending') <> 'non_ingredient'
    ORDER BY recipe_id, id
  `);

  const orphanRows = orphans.filter(r => isOrphanCandidate(r.ingredient_name));
  console.log(`Found ${orphanRows.length} orphan candidates (dry-run=${!APPLY})`);

  // Preload recipe siblings per recipe_id we'll touch
  const recipeIds = Array.from(new Set(orphanRows.map(r => r.recipe_id)));
  const siblingMap = new Map();
  for (const rid of recipeIds) {
    const { rows: sibs } = await client.query(
      'SELECT id, ingredient_name FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY id',
      [rid]
    );
    siblingMap.set(rid, sibs);
  }

  let mergedIntoNext = 0;
  let mergedIntoPrev = 0;
  let deletedRedundant = 0;
  let leftForReview = 0;
  const actions = [];

  for (const o of orphanRows) {
    const sibs = siblingMap.get(o.recipe_id);
    const idx = sibs.findIndex(s => s.id === o.id);
    if (idx < 0) continue;
    const prev = idx > 0 ? sibs[idx - 1] : null;
    const next = idx < sibs.length - 1 ? sibs[idx + 1] : null;

    const isRedundantNoun = REDUNDANT_NOUN_ORPHANS.has(o.ingredient_name.trim().toLowerCase());

    // For adjectives and unclosed-quote orphans, PREFER merging with next.
    // For redundant nouns (leaf/leaves), PREFER merging with prev (and only
    // do so if prev doesn't already classify cleanly on its own).

    const orphanHasUnclosedQuote = hasUnclosedQuote(o.ingredient_name);

    // For unclosed-quote orphans (variety names split across lines), the
    // sibling that completes the quote should ALSO have an unclosed quote.
    // If it doesn't, the rows are unrelated ingredients and merging would
    // concatenate garbage (e.g. "echeveria succulents ('Black" + unrelated
    // row would produce an invalid compound).
    const quoteSiblingOk = (sib) =>
      !orphanHasUnclosedQuote || (sib && hasUnclosedQuote(sib.ingredient_name));

    if (!isRedundantNoun && next && quoteSiblingOk(next)) {
      const merged = `${o.ingredient_name} ${next.ingredient_name}`.trim();
      if (!isSupply(merged) && classifyProductType(merged)) {
        actions.push({ kind: 'merge_into_next', orphan: o, survivor: next, mergedName: merged });
        mergedIntoNext++;
        continue;
      }
    }

    if (prev && quoteSiblingOk(prev)) {
      const merged = `${prev.ingredient_name} ${o.ingredient_name}`.trim();
      const prevAlreadyValid = classifyProductType(prev.ingredient_name) != null;
      const mergedValid = !isSupply(merged) && classifyProductType(merged) != null;

      if (isRedundantNoun && prevAlreadyValid) {
        // Dropping a pure suffix that adds no semantic info.
        actions.push({ kind: 'delete_redundant', orphan: o, survivor: prev, mergedName: prev.ingredient_name });
        deletedRedundant++;
        continue;
      }
      if (mergedValid) {
        actions.push({ kind: 'merge_into_prev', orphan: o, survivor: prev, mergedName: merged });
        mergedIntoPrev++;
        continue;
      }
    }

    leftForReview++;
    actions.push({ kind: 'skip', orphan: o });
  }

  // Print plan
  console.log(`\nPlanned actions:`);
  console.log(`  Merge orphan into NEXT sibling: ${mergedIntoNext}`);
  console.log(`  Merge orphan into PREV sibling: ${mergedIntoPrev}`);
  console.log(`  Delete redundant suffix:        ${deletedRedundant}`);
  console.log(`  Skipped (manual review):        ${leftForReview}`);
  console.log(`  Total affected rows:            ${orphanRows.length}`);

  // Show examples
  const SAMPLE = 12;
  console.log(`\n--- Sample of planned merges (up to ${SAMPLE}) ---`);
  for (const a of actions.filter(x => x.kind !== 'skip').slice(0, SAMPLE)) {
    console.log(`  [${a.kind}]`);
    console.log(`    orphan:   [${a.orphan.id}] "${a.orphan.ingredient_name}"`);
    console.log(`    survivor: [${a.survivor.id}] "${a.survivor.ingredient_name}"`);
    console.log(`    result:   "${a.mergedName}"`);
  }

  if (leftForReview > 0) {
    console.log(`\n--- Skipped (manual review) ---`);
    for (const a of actions.filter(x => x.kind === 'skip').slice(0, 20)) {
      console.log(`  recipe ${a.orphan.recipe_id} [${a.orphan.id}] "${a.orphan.ingredient_name}"`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run: no changes made. Re-run with --apply to commit.');
    await client.end();
    return;
  }

  console.log('\nApplying changes...');
  await client.query('BEGIN');
  try {
    for (const a of actions) {
      if (a.kind === 'merge_into_next' || a.kind === 'merge_into_prev') {
        await client.query(
          `UPDATE recipe_ingredients
             SET ingredient_name = $1, flower_id = NULL, match_status = 'pending', match_confidence = NULL
           WHERE id = $2`,
          [a.mergedName, a.survivor.id]
        );
        await client.query('DELETE FROM recipe_ingredients WHERE id = $1', [a.orphan.id]);
      } else if (a.kind === 'delete_redundant') {
        await client.query('DELETE FROM recipe_ingredients WHERE id = $1', [a.orphan.id]);
      }
    }
    await client.query('COMMIT');
    console.log('Done. Re-run rebuild-catalog.js to rematch.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rolled back:', e.message);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
