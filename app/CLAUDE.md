@AGENTS.md

# Petal & Profit -- Receipt-to-Profitability POC

## What This Is

A Next.js 16 + SQLite app that processes wholesale florist invoices, matches line items to floral arrangement recipes, and calculates profitability per arrangement. Built for Milano's UpTowne Florist as the first customer of Petal & Profit.

## Current State (2026-04-12)

### What's Working
- **Production mode only.** Dev mode hangs because better-sqlite3 native module chokes webpack/turbopack. Always use `npx next build && npx next start -p 3456`.
- **Database:** SQLite at `data/petal-and-profit.db`
- **10 vendors seeded**
- **24 Best Sellers recipes** with 163 ingredients
- **36 product-type catalog entries** (standard roses, spray roses, mini carnations, etc.) with variety-to-type lookup
- **252 total receipts** (34 extracted so far, 218 more in progress)
- **Price basis detection:** auto-flags per_stem vs per_bunch, computes cost_per_stem
- **Profitability computed** for all 24 recipes with real per-stem costs
- **All UI pages working in production mode**

### Planned: Neon + Vercel Deploy
- Migrate SQLite to Neon Postgres
- Deploy to Vercel with built-in password protection
- This unblocks the dev-mode issue too (no native SQLite module)

### Feature Roadmap
1. **Cost trends over time** -- date every cost entry, show price movement per product type. Answer "what does this arrangement cost to build TODAY?"
2. **What-if pricing analysis** -- slide sell price, see margin impact across all arrangements
3. **Upload sales data** -- import the Sales 2021-2026 xlsx files, cross-reference with profitability
4. **Most profitable arrangement right now** -- factor in seasonal costs + what's currently available
5. **Vendor price comparison** -- side-by-side pricing across vendors for same product type
6. **Waste factor** -- configurable % multiplier on costs
7. **Labor + container costs** -- add to margin calculation
8. **Real-time vendor pricing feed** -- research in progress on API/data access from wholesalers
9. **Matching review UI** -- ability to change/override line item to recipe ingredient matching

## Data Location
- **GDrive:** `/Users/lorimercer/Library/CloudStorage/GoogleDrive-lori@feelgoodwork.com/Shared drives/Feel Good Work Team/1 - CLIENTS/Jeff Boothman Projects/uptowne florist - jeff/`
- **Env vars:** `.env.local` has `GDRIVE_DATA_PATH` and `ANTHROPIC_API_KEY`

## Key Files
- `src/lib/db.ts` -- SQLite connection, migrations, vendor seeding
- `src/lib/schema.sql` -- full database schema
- `src/lib/extractors/asiri.ts` -- programmatic extractor for Asiri text PDFs
- `src/lib/extractors/claude-vision.ts` -- Claude Vision extractor for scanned PDFs
- `src/lib/extractors/recipe-parser.ts` -- parses recipe PDFs using unpdf
- `src/lib/extractors/vendor-classifier.ts` -- classifies vendor from filename
- `src/lib/matching/variety-lookup.ts` -- rose variety to product type mapping (Freedom→standard roses, etc.)
- `src/lib/matching/name-normalizer.ts` -- classifies descriptions to product types
- `src/lib/matching/catalog-builder.ts` -- builds catalog, matches recipes + invoices
- `src/lib/matching/fuzzy-matcher.ts` -- Fuse.js matching for unmatched items
- `scripts/extract-all.js` -- batch extraction script (runs outside Next.js)

## How to Run
```bash
cd app
npx next build && npx next start -p 3456
# Open http://localhost:3456
```

## Important: Price Basis
Line items have `price_basis` (per_stem, per_bunch, per_unit, unknown) and `cost_per_stem` (normalized). The catalog uses `cost_per_stem` for all cost calculations. Common stems-per-bunch: roses=25, carnations=25, gerberas=10, most fillers=10.
