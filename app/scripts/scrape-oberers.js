/**
 * Scrape Oberer's Flower Market pricing and insert into wholesale_benchmarks.
 *
 * Usage: node scripts/scrape-oberers.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { insertBenchmarks } = require('./lib/insert-benchmarks');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const SOURCE_URL = 'https://www.oberers.com/flower-market/';

// ---------------------------------------------------------------------------
// Oberer's product data (scraped from BigCommerce catalog)
// ---------------------------------------------------------------------------
const OBERERS_PRODUCTS = [
  // Focal Flowers
  { name: 'Roses',                  priceLow: 23.25, priceHigh: 34.95, qty: 25, unit: 'stem', cat: 'focal' },
  { name: 'Red Roses',              priceLow: 33.95, priceHigh: 51.95, qty: 25, unit: 'stem', cat: 'focal' },
  { name: 'Roses - Seasonal Colors', priceLow: 36.15, priceHigh: 49.25, qty: 25, unit: 'stem', cat: 'focal' },
  { name: 'Roses - Holiday',        priceLow: 29.55, priceHigh: 47.55, qty: 25, unit: 'stem', cat: 'focal' },
  { name: 'Red Roses - Holiday',    priceLow: 25.65, priceHigh: 41.05, qty: 25, unit: 'stem', cat: 'focal' },
  { name: 'Carnations',             priceLow: 14.75, priceHigh: null,  qty: 25, unit: 'stem', cat: 'focal' },
  { name: 'Carnations - Mother\'s Day', priceLow: 17.85, priceHigh: null, qty: 25, unit: 'stem', cat: 'focal' },
  { name: 'Sunflowers',             priceLow: 1.60,  priceHigh: null,  qty: 1,  unit: 'stem', cat: 'focal' },
  { name: 'Gerberas',               priceLow: 16.85, priceHigh: null,  qty: 10, unit: 'stem', cat: 'focal' },
  { name: 'Stock',                   priceLow: 10.95, priceHigh: null,  qty: 10, unit: 'stem', cat: 'focal' },
  { name: 'Asters',                  priceLow: 5.95,  priceHigh: null,  qty: 10, unit: 'stem', cat: 'focal' },
  { name: 'Lilies - Oriental',       priceLow: 2.75,  priceHigh: null,  qty: 1,  unit: 'stem', cat: 'focal' },
  { name: 'Lilies - Asiatic',        priceLow: 2.10,  priceHigh: null,  qty: 1,  unit: 'stem', cat: 'focal' },
  // Filler Flowers
  { name: 'Alstroemeria',            priceLow: 7.85,  priceHigh: null,  qty: 10, unit: 'stem', cat: 'filler' },
  { name: 'Fuji Mums',               priceLow: 9.65,  priceHigh: null,  qty: 10, unit: 'stem', cat: 'filler' },
  { name: 'Solidago',                priceLow: 6.75,  priceHigh: null,  qty: 10, unit: 'stem', cat: 'filler' },
  { name: 'Daisies',                 priceLow: 7.05,  priceHigh: null,  qty: 1,  unit: 'bunch', cat: 'filler' },
  { name: 'Cushion Mums',            priceLow: 7.05,  priceHigh: null,  qty: 1,  unit: 'bunch', cat: 'filler' },
  // Greenery
  { name: 'Leather Leaf',            priceLow: 5.85,  priceHigh: null,  qty: 1,  unit: 'bunch', cat: 'greenery' },
  { name: 'Myrtle',                  priceLow: 8.55,  priceHigh: null,  qty: 1,  unit: 'bunch', cat: 'greenery' },
  { name: 'Roebellini',              priceLow: 4.85,  priceHigh: null,  qty: 10, unit: 'stem', cat: 'greenery' },
  { name: 'Ruscus - Israeli',        priceLow: 6.50,  priceHigh: null,  qty: 10, unit: 'stem', cat: 'greenery' },
  { name: 'Ruscus - Italian',        priceLow: 9.95,  priceHigh: null,  qty: 1,  unit: 'bunch', cat: 'greenery' },
  { name: 'Sword Fern',              priceLow: 6.95,  priceHigh: null,  qty: 25, unit: 'stem', cat: 'greenery' },
  { name: 'Eucalyptus',              priceLow: 9.75,  priceHigh: 11.35, qty: 1,  unit: 'bunch', cat: 'greenery' },
];

// ---------------------------------------------------------------------------
// Map Oberer's product names → our flower_catalog canonical names
// ---------------------------------------------------------------------------
const CATALOG_MAP = {
  'Roses':                     { catalogType: 'standard roses', baseType: 'standard roses' },
  'Red Roses':                 { catalogType: 'red roses',      baseType: 'standard roses' },
  'Roses - Seasonal Colors':   { catalogType: 'standard roses', baseType: 'standard roses' },
  'Roses - Holiday':           { catalogType: 'standard roses', baseType: 'standard roses' },
  'Red Roses - Holiday':       { catalogType: 'red roses',      baseType: 'standard roses' },
  'Carnations':                { catalogType: 'standard carnations', baseType: 'standard carnations' },
  "Carnations - Mother's Day": { catalogType: 'standard carnations', baseType: 'standard carnations' },
  'Sunflowers':                { catalogType: 'sunflowers',     baseType: 'sunflowers' },
  'Gerberas':                  { catalogType: 'standard gerberas', baseType: 'standard gerberas' },
  'Stock':                     { catalogType: 'stock',          baseType: 'stock' },
  'Asters':                    { catalogType: 'aster',          baseType: 'aster' },
  'Lilies - Oriental':         { catalogType: 'oriental lilies', baseType: 'oriental lilies' },
  'Lilies - Asiatic':          { catalogType: 'asiatic lilies', baseType: 'asiatic lilies' },
  'Alstroemeria':              { catalogType: 'alstroemeria',   baseType: 'alstroemeria' },
  'Fuji Mums':                 { catalogType: 'spider mums',    baseType: 'spider mums' },
  'Solidago':                  { catalogType: 'solidago',       baseType: 'solidago' },
  'Daisies':                   { catalogType: 'daisy poms',     baseType: 'daisy poms' },
  'Cushion Mums':              { catalogType: 'cushion poms',   baseType: 'cushion poms' },
  'Leather Leaf':              { catalogType: 'leather leaf',   baseType: 'leather leaf' },
  'Myrtle':                    { catalogType: 'myrtle',         baseType: 'myrtle' },
  'Roebellini':                { catalogType: 'greens',         baseType: 'greens' },
  'Ruscus - Israeli':          { catalogType: 'ruscus',         baseType: 'ruscus' },
  'Ruscus - Italian':          { catalogType: 'ruscus',         baseType: 'ruscus' },
  'Sword Fern':                { catalogType: 'tree fern',      baseType: 'tree fern' },
  'Eucalyptus':                { catalogType: 'eucalyptus',     baseType: 'eucalyptus' },
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("Scraping Oberer's Flower Market pricing...");
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`Products: ${OBERERS_PRODUCTS.length}`);
  console.log();

  const rows = OBERERS_PRODUCTS.map(p => {
    const mapping = CATALOG_MAP[p.name];
    const category = p.cat === 'greenery' ? 'foliage' : 'flower';
    return {
      productName: p.name,
      catalogType: mapping?.catalogType ?? null,
      baseType: mapping?.baseType ?? null,
      category,
      priceLow: p.priceLow,
      priceHigh: p.priceHigh,
      packageQty: p.qty,
      unitType: p.unit,
      sourceUrl: SOURCE_URL,
    };
  });

  const result = await insertBenchmarks(client, 'oberers', "Oberer's Flower Market", rows);
  console.log(`Inserted ${result.inserted} benchmark rows for ${result.vendor}`);

  // Show per-unit pricing summary
  const { rows: summary } = await client.query(`
    SELECT product_name, catalog_type, unit_type,
           package_price_low, package_price_high, package_qty,
           ROUND(price_per_unit::numeric, 2) as per_unit,
           ROUND(pp_price::numeric, 2) as pp_price
    FROM wholesale_benchmarks
    WHERE vendor_slug = 'oberers'
    ORDER BY category, product_name
  `);

  console.log('\nPricing summary:');
  console.log('─'.repeat(90));
  console.log('Product'.padEnd(28), 'Catalog Type'.padEnd(22), 'Per Unit'.padEnd(10), 'P&P Price'.padEnd(10), 'Unit');
  console.log('─'.repeat(90));
  for (const row of summary) {
    console.log(
      row.product_name.padEnd(28),
      (row.catalog_type || '-').padEnd(22),
      `$${row.per_unit}`.padEnd(10),
      `$${row.pp_price}`.padEnd(10),
      row.unit_type
    );
  }

  await client.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
