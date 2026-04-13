@AGENTS.md

# Petal & Profit -- Receipt-to-Profitability Engine

## What This Is

A Next.js 16 + Neon Postgres app that processes wholesale florist invoices, matches line items to floral arrangement recipes, and calculates profitability per arrangement. Built for Milano's UpTowne Florist. Deployed on Vercel with cookie-based password auth.

## Current State (2026-04-13)

### Infrastructure
- **Database:** Neon Postgres (migrated from SQLite)
- **Hosting:** Vercel (auto-deploys from main branch)
- **Auth:** Cookie-based password gate (default: petalandprofit2026, set APP_PASSWORD env var to change)
- **Dev mode:** Works now with Neon (no more better-sqlite3 native module issues)

### Data Loaded
- **10 vendors** seeded (Asiri Blooms, Bill Doran, CPF, Dreisbach, Sam's Club, Budzi, Claprood, Virgin Direct, Xerox Scan, Unknown)
- **252 receipts** imported, **250 extracted** (2,657 line items, 1,750 flower items)
- **24 Best Sellers recipes** with 163 ingredients
- **36 product-type catalog entries** with variety-to-type lookup (Freedom Rose -> standard roses, etc.)
- **1,015 line items matched** to catalog, **513 aliases** learned
- **Price basis detection:** auto-flags per_stem vs per_bunch, computes cost_per_stem

### Pricing Benchmarks
- **USDA Boston Terminal Market** (Dec 2023) -- 81 prices, 22 product types
- **USDA Miami Shipping Point** (May 2024) -- 57 prices (most recent USDA ornamental data available)
- **FiftyFlowers.com** -- Shopify JSON API scraper, retail/event pricing as ceiling benchmark
- Note: USDA ornamental reports appear discontinued (Boston last Dec 2023, Miami last May 2024)

### Features Built
1. **Dashboard** (/) -- pipeline overview with stats
2. **Receipts** (/receipts) -- import, extract (programmatic + Claude Vision), review with per_stem/per_bunch badges
3. **Recipes** (/recipes) -- parsed from PDF, ingredient cost breakdown with margin calculation
4. **Flower Catalog** (/catalog) -- product types with avg/min/max costs, USDA + FiftyFlowers benchmarks, manual cost entry
5. **Catalog Detail** (/catalog/[id]) -- all invoice line items for a type, recipe usage, 3 benchmark panels (USDA, FiftyFlowers, manual), vendor aliases
6. **AI Classifier** -- Claude batch classification of unmatched invoice items (451 items, run from catalog page)
7. **Match Review** (/matching) -- fuzzy match suggestions with confidence scores
8. **Profitability** (/profitability) -- all recipes ranked by margin, color-coded
9. **Password Auth** -- middleware cookie gate, public access to /landing.html, /demo.html, /strategy.html
10. **Help** (/help) -- full feature guide with workflow instructions

### Feature Roadmap
- **Cost trends over time** -- date every cost entry, show price movement per product type
- **What-if pricing analysis** -- slide sell price, see margin impact
- **Upload sales data** -- import Sales 2021-2026 xlsx files, cross-reference with profitability
- **Most profitable arrangement right now** -- factor in seasonal costs + availability
- **Vendor price comparison** -- side-by-side pricing across vendors
- **Waste factor** -- configurable % multiplier on costs
- **Labor + container costs** -- add to margin calculation
- **Vendor newsletter ingestion** -- Make.com automation to capture weekly price lists from vendor emails
- **Best time to buy** -- seasonal pricing analysis from historical invoice data
- **Recipe ingredient matching override** -- UI to change/reassign line item to recipe ingredient matches

## Key Files
- `src/lib/db.ts` -- Neon Postgres connection
- `src/lib/schema.postgres.sql` -- full database schema
- `src/lib/extractors/asiri.ts` -- programmatic extractor for Asiri text PDFs
- `src/lib/extractors/claude-vision.ts` -- Claude Vision extractor for scanned PDFs
- `src/lib/extractors/recipe-parser.ts` -- parses recipe PDFs using unpdf
- `src/lib/extractors/vendor-classifier.ts` -- classifies vendor from filename
- `src/lib/matching/variety-lookup.ts` -- rose variety to product type mapping
- `src/lib/matching/name-normalizer.ts` -- classifies descriptions to product types
- `src/lib/matching/catalog-builder.ts` -- builds catalog, matches recipes + invoices
- `src/lib/matching/fuzzy-matcher.ts` -- Fuse.js matching for unmatched items
- `src/lib/matching/claude-classifier.ts` -- AI batch classification of unmatched items
- `src/lib/usda.ts` -- USDA MARS report parser (Boston + Miami)
- `src/lib/fiftyflowers.ts` -- FiftyFlowers.com Shopify scraper
- `src/middleware.ts` -- password auth gate
- `scripts/extract-all.js` -- batch receipt extraction (runs standalone, uses Claude Vision API)
- `scripts/migrate-to-neon.js` -- SQLite to Neon data migration

## How to Run Locally
```bash
cd app
npm run dev
# Open http://localhost:3456
```

## Environment Variables
- `DATABASE_URL` -- Neon Postgres connection string (required)
- `ANTHROPIC_API_KEY` -- for Claude Vision extraction and AI classifier
- `APP_PASSWORD` -- login password (default: petalandprofit2026)
- `GDRIVE_DATA_PATH` -- local path to Google Drive synced data (for import/extract endpoints)

## Important Notes
- The receipt import and extract endpoints require local file system access (GDRIVE_DATA_PATH). They work locally but not on Vercel. Use `scripts/extract-all.js` for batch extraction.
- Run `POST /api/catalog` to rebuild catalog + matching after importing new receipts.
- Run `POST /api/catalog/classify` to send unmatched items to Claude for AI classification.
- Run `POST /api/usda/sync` to fetch latest USDA data (may not have new data -- reports appear discontinued).
- Run `POST /api/fiftyflowers` to scrape all FiftyFlowers collections (takes ~2 min, stores in Neon).
- Run `POST /api/profitability` to recompute margins after any cost changes.
