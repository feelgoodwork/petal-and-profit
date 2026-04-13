/**
 * Re-apply catalog_type mapping to existing fiftyflowers_benchmarks rows.
 * Run this after updating FF_TYPE_MAP in fiftyflowers.ts — no re-scraping needed.
 * Usage: node scripts/reprocess-fiftyflowers.js
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const sql = neon(process.env.DATABASE_URL);

// Must stay in sync with fiftyflowers.ts FF_TYPE_MAP
const FF_TYPE_MAP = {
  'roses standard':         'standard roses',
  'vd roses standard':      'standard roses',
  'md roses standard':      'standard roses',
  'roses spray':            'spray roses',
  'roses sweetheart':       'spray roses',
  'roses garden':           'garden roses',
  'carnations':             'standard carnations',
  'vd carnations vd':       'standard carnations',
  'vd carnations':          'standard carnations',
  'carnations mini':        'mini carnations',
  'gerbera daisies':        'standard gerberas',
  'gerbera':                'standard gerberas',
  'hydrangea':              'hydrangea',
  'hydrangeas':             'hydrangea',
  'tulips':                 'tulips',
  'vd tulips vd':           'tulips',
  'ranunculus':             'ranunculus',
  'peonies':                'peony',
  'dahlias':                'dahlias',
  'sunflowers':             'sunflowers',
  'delphinium':             'delphinium',
  'stock':                  'stock',
  'snapdragons':            'snapdragons',
  'alstroemeria':           'alstroemeria',
  'alstroemerias':          'alstroemeria',
  'lisianthus':             'lisianthus',
  'disbud':                 'spider mums',
  'pompom':                 'button poms',
  'berries':                'hypericum',
  'eucalyptus':             'eucalyptus',
  'ruscus':                 'ruscus',
  'greens':                 'greens',
  'greenery':               'greens',
};

async function main() {
  // Null out all catalog_types first, then re-apply
  await sql`UPDATE fiftyflowers_benchmarks SET catalog_type = NULL`;

  for (const [ffType, catalogType] of Object.entries(FF_TYPE_MAP)) {
    await sql`
      UPDATE fiftyflowers_benchmarks
      SET catalog_type = ${catalogType}
      WHERE LOWER(product_type) = ${ffType}
    `;
  }

  // Stats
  const [stats] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(catalog_type) as mapped,
      COUNT(*) - COUNT(catalog_type) as unmapped
    FROM fiftyflowers_benchmarks
  `;

  const byType = await sql`
    SELECT catalog_type, COUNT(*) as n,
      ROUND(AVG(price_per_stem)::numeric, 2) as avg_stem
    FROM fiftyflowers_benchmarks
    WHERE catalog_type IS NOT NULL AND price_per_stem IS NOT NULL
    GROUP BY catalog_type ORDER BY catalog_type
  `;

  console.log(`\nMapped: ${stats.mapped} / ${stats.total} products`);
  console.log('\nCoverage by type:');
  for (const r of byType) {
    console.log(`  ${String(r.catalog_type).padEnd(28)} ${String(r.n).padStart(4)} products  avg $${r.avg_stem}/stem`);
  }

  const unmatchedTypes = await sql`
    SELECT LOWER(product_type) as pt, COUNT(*) as n
    FROM fiftyflowers_benchmarks WHERE catalog_type IS NULL
    GROUP BY LOWER(product_type) ORDER BY COUNT(*) DESC LIMIT 10
  `;
  if (unmatchedTypes.length) {
    console.log('\nStill unmapped (top 10):');
    for (const r of unmatchedTypes) console.log(`  ${String(r.n).padStart(4)}x  ${r.pt}`);
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
