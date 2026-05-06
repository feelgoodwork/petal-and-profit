@AGENTS.md

# Petal & Profit -- Receipt-to-Profitability Engine

## What This Is

A Next.js 16 + Neon Postgres app that processes wholesale florist invoices, matches line items to floral arrangement recipes, and calculates profitability per arrangement. Built for Milano's UpTowne Florist. Deployed on Vercel with cookie-based password auth.

## Current State (2026-05-06)

### Infrastructure
- **Database:** Neon Postgres (migrated from SQLite)
- **Hosting:** Vercel (auto-deploys from main branch)
- **Auth:** Cookie-based password gate (default: petalandprofit2026, set APP_PASSWORD env var to change)
- **Neon connection notes:** The `pg` Client drops TCP connections on long operations (500+ sequential queries). Use Neon serverless HTTP driver (`@neondatabase/serverless`) for DB updates in long-running scripts. Use per-file reconnection for batch imports. Keep `keepAlive: true, keepAliveInitialDelayMillis: 10000` on all pg Client connections.

### Data Loaded
- **10 vendors** seeded (Asiri Blooms, Bill Doran, CPF, Dreisbach, Sam's Club, Budzi, Claprood, Virgin Direct, Xerox Scan, Unknown)
- **252 receipts** imported, **250 extracted** (2,657 line items, 1,750 flower items)
- **657 recipes** across 11 categories, 4,526 ingredients (cleaned: label prefixes stripped, multi-ingredient rows split, line-break splits merged)
- **496 recipe images** extracted from all-categories PDF via Claude Vision + sharp cropping
- **209 color-aware catalog entries** (194 flowers, 15 foliage) across 48 base types with variety-to-color lookup
- **1,166 cost records**, 173 marked `is_current` (112 from 2024+, 61 fallback to most recent)
- **602 aliases** learned from invoice matching
- **Sales data:** 58,016 total line items across 2021-2026, 13,553 orders
  - 24,478 classified as arrangements, 33,538 as non-arrangement (tips, loose wraps, corsages, balloons, etc.)
  - 16,633 matched to recipes (68.0%) via 4-tier matching (item code, exact, fuzzy, category-stripped)
  - 929 unique item codes mapped to recipes
  - New columns: `source` (Web/Phone/Walkin/FSN), `item_code`, `occasion`, `is_arrangement`, `match_tier`

### Pricing & Benchmarks
- **USDA Boston Terminal Market** (Dec 2023) -- 81 prices, 22 product types
- **USDA Miami Shipping Point** (May 2024) -- 57 prices (most recent available)
- **FiftyFlowers.com** -- Shopify JSON API scraper, retail/event pricing as ceiling benchmark
- **Wholesale benchmarks** (`wholesale_benchmarks` table) -- multi-vendor design, currently Oberer's Flower Market (25 products)
- **P&P pricing** -- wholesale + 20% markup, shown on catalog, recipe detail, profitability, and savings pages

### Cost Resolution Rules
- **Currency rule:** Only use invoice costs from 2024+. If a flower type has no 2024+ data, fall back to the single most recent invoice. Controlled by `is_current` boolean on `ingredient_costs`. Run `scripts/update-cost-currency.js` or `scripts/rebuild-catalog.js` (which includes the currency step) to recompute.
- **Tiered cost fallback:** exact match -> color family (hot pink -> pink) -> base type (pink gerberas -> standard gerberas). Implemented in `src/lib/matching/cost-resolver.ts`.
- **Tiered PP price fallback:** exact catalog_type -> base_type -> product family (mini carnations -> standard carnations, spray roses -> standard roses). Also in `cost-resolver.ts`.

### Features Built
1. **Dashboard** (/) -- pipeline overview with stats
2. **Receipts** (/receipts) -- import, extract (programmatic + Claude Vision), review with per_stem/per_bunch badges
3. **Recipes** (/recipes) -- 657 recipes with ingredient cost breakdown, margin calculation, arrangement photos
4. **Recipe Detail** (/recipes/[id]) -- arrangement image, "Cost Today" + "P&P Sourcing" summary cards, ingredients with cost source tier indicator (exact/color_family/base_type), P&P price per line
5. **Flower Catalog** (/catalog) -- 209 types grouped by base_type, collapsible, P&P price column, avg/min/max costs
6. **Catalog Detail** (/catalog/[id]) -- invoice line items, recipe usage, USDA + FiftyFlowers + wholesale benchmarks, stem size breakdown
7. **AI Classifier** -- Claude batch classification of unmatched invoice items
8. **Match Review** (/matching) -- fuzzy match suggestions with confidence scores
9. **Profitability** (/profitability) -- all recipes ranked by margin, P&P Cost + P&P Margin % columns, color-coded
10. **Sales** (/sales) -- top sellers with profitability (full list, scrollable, sortable by Times Sold / Total Revenue / Flower Cost / Margin), date range filter, per-order list when range <= 6 months, revenue by occasion, monthly trend chart
11. **Vendors** (/vendors) -- side-by-side cost/stem across vendors, "Best Price" badge per product type
12. **What-If Pricing** (/what-if) -- slider adjusts sell prices, shows margin impact per recipe
13. **P&P Savings** (/savings) -- sales-driven analysis: 2026 arrangements sold vs P&P sourcing cost, per-arrangement savings
14. **AI Analysis** (/analysis) -- natural language SQL queries against the database via Claude
15. **Password Auth** -- middleware cookie gate
16. **Help** (/help) -- full feature guide

### Where We Left Off (2026-05-06)

**Completed this session:**
- Sales page top sellers: client-side sortable columns (Times Sold, Total Revenue, Flower Cost, Margin) -- click header to toggle direction, ↓/↑ indicator, nulls always sink to the bottom. Default sort is Times Sold descending.
- Sales page top sellers: removed `LIMIT 50` from API query so every unique description in the date range is returned. Wrapped table in `max-h-[600px] overflow-auto` scroll container with sticky header (matches the orders block pattern). Header now shows total unique-item count.
- Important: the top sellers list includes ALL line types (arrangements + tips + loose wraps + non-arrangements), not just arrangements. Summing the Total Revenue column equals the stat card revenue total because there's no longer a row cap.

**Prior session (2026-04-15) -- still relevant:**
- Wholesale benchmarks system: multi-vendor `wholesale_benchmarks` table, Oberer's scraper (25 products), P&P pricing (wholesale + 20%) shown across catalog, recipe detail, profitability, and savings pages
- P&P Savings page: sales-driven analysis showing per-arrangement savings if sourced through P&P
- Recipe ingredient data cleanup: stripped "Flowers:"/"Greens:" label prefixes (71 rows), split multi-ingredient rows (5 rows -> 25), merged line-break splits (13 pairs)
- Cost currency rule: only use 2024+ invoice data, fallback to most recent. `parsed_date` + `is_current` columns on `ingredient_costs`
- Tiered cost fallback: exact -> color family -> base type for both costs and PP prices. Product family mapping for PP prices (mini carnations -> standard carnations, etc.)
- Sales reimport: 58,016 rows with source/occasion/item_code/is_arrangement columns. 4-tier matching (item code, exact, fuzzy, category-stripped). 68% match rate.
- Recipe images: 496 arrangement photos extracted from all-categories PDF (Claude Vision + sharp), displayed on recipe detail page

**Known data quality items (not auto-fixed):**
- 8 standalone color orphans in recipe ingredients ("Dusty", "Blue", "Green", etc.) -- need manual review
- 9 standalone flower words ("lily", "fern") with null quantity -- may be line-break remnants
- ~7,800 unmatched sales arrangements -- mostly products without recipes in the DB (ANGELIC BOUQUET, GRACEFUL GARDEN, Season for Sunflowers, etc.)

**Next natural steps:**
- Import the DesignerReview xlsx (867 rows, Feb-Apr 2026) for richer order data with designer names and special instructions
- Investigate unmatched sales: some are real arrangements that need recipe data, others need manual alias mapping
- Review recipe image quality: some crops may include text bleed from adjacent cells
- Build "top sellers x profitability" cross-view: which arrangements sell the most AND have the best margin
- Add source/occasion breakdowns to sales and profitability pages

### Feature Roadmap
- **Cost trends over time** -- show price movement per product type using `parsed_date`
- **Waste factor** -- configurable % multiplier on costs
- **Labor + container costs** -- add to margin calculation
- **Vendor newsletter ingestion** -- Make.com automation to capture weekly price lists from vendor emails
- **Best time to buy** -- seasonal pricing analysis from historical invoice data
- **Top sellers x profitability cross-view** -- matrix of volume vs. margin
- **Profitability by source** -- break down margins by Web Order vs Phone vs Walkin
- **Profitability by occasion** -- which occasions (Birthday, Sympathy, Valentine's) are most profitable

## Key Files

### Core
- `src/lib/db.ts` -- Neon Postgres connection (serverless HTTP)
- `src/lib/schema.postgres.sql` -- base database schema (additional columns added by scripts)
- `src/middleware.ts` -- password auth gate

### Extractors
- `src/lib/extractors/asiri.ts` -- programmatic extractor for Asiri text PDFs
- `src/lib/extractors/claude-vision.ts` -- Claude Vision extractor for scanned PDFs
- `src/lib/extractors/recipe-parser.ts` -- parses recipe PDFs
- `src/lib/extractors/vendor-classifier.ts` -- classifies vendor from filename

### Matching & Costing
- `src/lib/matching/variety-lookup.ts` -- rose variety to color mapping, color-aware canonical naming, classifyProductType()
- `src/lib/matching/name-normalizer.ts` -- invoice description to product type classification
- `src/lib/matching/catalog-builder.ts` -- builds catalog, matches recipes + invoices
- `src/lib/matching/fuzzy-matcher.ts` -- Fuse.js matching for unmatched items
- `src/lib/matching/claude-classifier.ts` -- AI batch classification of unmatched items
- `src/lib/matching/cost-resolver.ts` -- tiered cost resolution (exact/color_family/base_type) + PP price resolution with product family fallback

### Benchmarks
- `src/lib/usda.ts` -- USDA MARS report parser (Boston + Miami)
- `src/lib/fiftyflowers.ts` -- FiftyFlowers.com Shopify scraper

### Scripts (run locally against Neon, bypass Vercel 60s timeout)
- `scripts/rebuild-catalog.js` -- rebuilds flower catalog, matches recipes + invoices, sets `is_current` cost flags. **Run after importing new receipts.**
- `scripts/rebuild-profitability.js` -- recomputes margins with tiered cost fallback. **Run after cost changes.**
- `scripts/import-sales.js` -- imports Sales 2021-2026 xlsx files, classifies non-arrangements, captures source/occasion/item_code. Use `--reimport` to clear and re-import all.
- `scripts/rematch-sales.js` -- 4-tier matching (item code, exact, fuzzy, category-stripped). Use `--all` to re-match everything.
- `scripts/scrape-oberers.js` -- scrapes Oberer's Flower Market pricing into `wholesale_benchmarks`
- `scripts/lib/insert-benchmarks.js` -- shared insert utility for any wholesale vendor scraper
- `scripts/update-cost-currency.js` -- backfills `parsed_date` and sets `is_current` flag on ingredient_costs
- `scripts/clean-recipe-ingredients.js` -- splits multi-ingredient rows, merges line-break splits. Use `--apply` to commit.
- `scripts/extract-recipe-images.js` -- extracts arrangement photos from all-categories PDF using Claude Vision + sharp
- `scripts/extract-all.js` -- batch receipt extraction using Claude Vision API
- `scripts/import-all-recipes.js` -- imports all recipe PDFs
- `scripts/reprocess-fiftyflowers.js` -- re-applies catalog_type mapping to FF data

## How to Run Locally
```bash
cd app
npm run dev
# Open http://localhost:3456
```

## Environment Variables
- `DATABASE_URL` -- Neon Postgres connection string (required)
- `ANTHROPIC_API_KEY` -- for Claude Vision extraction, AI classifier, recipe image extraction
- `APP_PASSWORD` -- login password (default: petalandprofit2026)
- `GDRIVE_DATA_PATH` -- local path to Google Drive synced data (for import/extract scripts)

## Important Notes
- Scripts that do bulk DB writes should use `pg` Client with `keepAlive: true` and per-file reconnection, or use the Neon serverless HTTP driver for updates. The pg TCP connection drops after ~60s of sequential queries.
- Run `scripts/rebuild-catalog.js` locally to rebuild catalog + matching + cost currency after importing new receipts.
- Run `scripts/rebuild-profitability.js` locally to recompute margins after any cost changes.
- The Vercel "Rebuild Catalog & Match" button on /catalog will timeout for full rebuilds. Use the local scripts instead.
- To add a new wholesale vendor: write a scraper in `scripts/scrape-vendorname.js` that calls `insertBenchmarks()` from `scripts/lib/insert-benchmarks.js`. The API, catalog, recipe, profitability, and savings pages pick it up automatically.
