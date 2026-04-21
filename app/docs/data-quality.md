# Data Quality System

## What this is, and why

Petal & Profit turns unstructured florist data — scanned invoices, recipe PDFs, sales exports — into clean structured numbers (costs per stem, margins per arrangement). The journey from "scanned PDF" to "usable cost" passes through a lot of messy steps: OCR, classification, pricing, matching. Every step can introduce errors, and errors compound.

The data quality system exists to **catch those errors systematically** rather than one-off, and to **remember what we learn** so the next customer's data gets cleaned faster, with less human review.

It has three parts that feed each other in a loop:

1. **Rules file** — a versioned, human-readable list of everything we've learned (typos, bad patterns, price ceilings). The source of truth.
2. **Scanner** — runs automated checks against the store's database and writes a list of suspected issues.
3. **Review UI** — where a human looks at each suspected issue, decides what to do, and optionally upgrades a one-off fix into a permanent rule.

---

## The motivating example: GEGERA DAISY → $391/stem

One of our recipes, "Admin Professionals Day Cheerful Yellow", kept showing a bizarre negative margin. The culprit turned out to be a single invoice line item from Cleveland Plant & Flower: `GEGERA DAISY` at $391.25.

What happened step by step:

1. **The invoice was scanned.** The handwritten label "GERBERA DAISY" got OCR'd as "GEGERA DAISY" (typo in the extraction).
2. **The classifier** saw "GEGERA DAISY", didn't recognize "gegera" as gerbera, fell through to the next keyword it knew — "daisy" — and classified the line item as generic **daisies**.
3. **The $391.25** was a bunch price (about 100 stems for $391 ≈ $3.91/stem gerberas). But the system stored it as $391.25 **per stem** of daisies.
4. **Yellow daisies** in our recipes had no cost of their own, so the [tiered cost fallback](../src/lib/matching/cost-resolver.ts) kicked in: no exact match → no color-family match → fall back to the base type `daisies`. The only cost on `daisies` was the $391.25.
5. **Every recipe** using "yellow daisies" inherited $391/stem. Recipe margins crashed.

One bad record in one invoice line → wrong costs across dozens of recipes. This pattern repeats with any scanning/classification error: **errors spread through the fallback chain**. That's why catching them systematically matters.

---

## Part 1: The rules file

[`src/lib/data-quality-rules.json`](../src/lib/data-quality-rules.json) — versioned in git, edited like code, reviewed like code.

Every entry has a `why` line explaining the reason. Without the "why", future maintainers can't judge edge cases and rules rot.

### What lives in it

**`typo_fixes`** — Common misspellings we've seen. Applied before classification runs.

```json
"gegera":   { "to": "gerbera",   "why": "misspelling that caused gerbera to match 'daisy' base" },
"soliago":  { "to": "solidago",  "why": "missing 'd' — common typo in recipes" },
"liatrus":  { "to": "liatris",   "why": "vowel transposition" }
```

After this rule existed, the next invoice containing "GEGERA" gets corrected to "GERBERA" at import time, before the classifier sees it. No more GEGERA→daisies accidents.

**`not_a_flower_patterns`** — Things that look like line items but aren't flowers. Usually invoice metadata that got pulled in by OCR.

```json
{ "pattern": "^BILL TO:",      "why": "invoice header text scanned as a line item" },
{ "pattern": "^RFU ",          "why": "vendor stock-keeping prefix, not a flower" },
{ "pattern": "MIXED OPERATIONS", "why": "vendor internal code" }
```

Real lines from Uptowne invoices that this catches: `RFU MISCOF`, `RFU GRIB`, `BILL TO: 120916 OWNER'S NAME: JEFF FISHER SALESMAN: 9 TERMS: CASH`. These were all being counted as flowers until we added these patterns.

**`composite_ingredient_patterns`** — Single vendor lines that mix multiple flowers (bundles or special-order shorthand). Cost data from these is unreliable because we can't tell which flower the price belongs to.

```json
{ "pattern": "SOLID STOCK .*ROSES.*LILY", "why": "BQF/solid-color bundle lines that mix multiple flowers" }
```

Example from Uptowne: `SOLID STOCK BLK TOP THERESA GOLD OPT GOLD S.O. ORDER OPT GLD ROSES LILY QD GOLD DAISY ONISIS` — one line containing stock, roses, lily, daisy. Any cost attached to this is meaningless for any specific flower.

**`price_ceilings_per_stem`** — The most important one. Each base flower type has a realistic per-stem ceiling. Anything above is almost certainly a bunch price misattributed as per-stem, or a misclassification.

```json
"standard carnations": 2.0,
"mini carnations":     1.5,
"standard roses":      6,
"peonies":             20,
"king protea":         35,
"_default":            15
```

These aren't guesses — they come from the actual distribution of prices in our invoices. Carnations in wholesale reality are $0.50–$1 per stem; nobody pays $139. When we saw a "red carnations" cost at $139.25/stem, we knew that was a 25-stem bunch price at $5.55/stem.

**`known_bunch_sizes`** — How many stems come in a typical wholesale bunch of each flower. Used later (pass 4) to automatically convert bunch prices to per-stem prices instead of just flagging them.

### How the rules file grows

Every time we investigate a finding in the review UI that reveals a general pattern, that pattern gets added to this file. The review UI shows you a suggested JSON snippet for findings of kind `not_a_flower`, so you can copy it into the rules file and commit.

Example growth over one cleansing session:

- First session found `GEGERA DAISY` → added `"gegera": "gerbera"`, now every future invoice with that typo auto-corrects.
- We saw invoice headers ending up as line items → added `^BILL TO:` and `SALESMAN:` to `not_a_flower_patterns`.
- We saw `POME ORDER WOLL587` (a vendor code) classified as flower → added `^POME ORDER` to patterns.
- Carnations and roses kept having bunch-prices-as-stem-prices → added tight per-base-type ceilings.

Each new store we onboard inherits all of this automatically.

---

## Part 2: The scanner

[`scripts/scan-data-quality.js`](../scripts/scan-data-quality.js) runs seven passes against a store's database and writes findings to the `data_quality_findings` table. Takes a few seconds to run.

### Pass 1: `price_outlier`

Look at every per-stem cost record. Compare `unit_cost` to the per-base-type ceiling in the rules file. Flag anything over.

**Severity logic:** if over by more than 5× the ceiling → `high`. Otherwise `medium`.

**Real examples from the first Uptowne scan:**
- `$97/stem on standard roses (cap $6)` — a $97 bunch mistakenly recorded as a single stem
- `$57/stem on cushion poms (cap $2)` — appeared four times; same composite-line bug leaking through
- `$139.99/stem on red carnations (cap $2)` — 25-stem bunch at $5.60/stem mis-stored
- `$21/stem on stock (cap $4)` — less dramatic but still likely a partial bunch

Total: 216 findings on first scan. Auto-fix: mark `is_current = false` so the bad record stops polluting averages and the tiered fallback.

### Pass 2: `duplicate_catalog`

Scan the flower catalog for case-variant duplicates or entries that are substrings of each other. Example (hypothetical): if we had both `gerberas` and `Gerberas` as separate catalog rows, this would flag one for consolidation.

First Uptowne scan found **zero** — the catalog rebuild step normalizes case, so duplicates don't sneak in. But the check stays valuable for new stores that might import from sloppier sources.

Auto-fix: consolidate all costs/aliases/recipe-ingredient rows onto the keeper id, then delete the duplicate catalog row.

### Pass 3: `unused_catalog`

Catalog entries with zero costs, zero recipe references, and zero aliases. Usually these are classifier artifacts — a catalog entry got created from a one-off classification that never stuck.

First Uptowne scan: 2 findings. Low priority.

Auto-fix: delete the orphan catalog row. It's safe because nothing references it.

### Pass 4: `quantity_outlier`

Recipe ingredient rows with `quantity > 100` (probably a parse-error extra digit — 10 stems became 100) or `0 < quantity < 0.25` (probably a fraction-parsing error — "1/4" became 0.25 when it should've been "1-4").

First Uptowne scan: 0 findings. The recipe parser is well-behaved.

No auto-fix — these require looking at the source recipe PDF to know the real intent. User edits manually, then clicks Accept.

### Pass 5: `recipe_cost_anomaly`

Look at every recipe's computed profitability snapshot. Flag any with `margin_pct < -50%` or `> 95%` when the recipe has costed ingredients.

These are almost never real business signals (florists don't sell at 104% loss, and they rarely have 99% margins). They're signals that cost data is wrong — either a single polluted cost record is dragging the recipe's total cost up, or the recipe is almost entirely missing cost data and showing inflated margin.

**Real examples:**
- `"Easter Egg Hunt": margin -104.0% — cost $101.98 vs sell $50.00` — an outlier cost on one ingredient tanked the whole recipe
- `"FOREVER LOVE": margin 98.6% — cost $2.27 vs sell $159.00` — the recipe has many ingredients but only one got priced; the rest fell back to nothing, so "total cost" understates reality massively
- `"Natural Touch": margin 99.5% — cost $0.38 vs sell $70.00` — same pattern, worse

No auto-fix — requires judgement. User fixes the underlying data (cap a bad cost, add missing prices, adjust the sell price), then clicks Accept.

### Pass 6: `composite_description`

Match invoice line descriptions against `composite_ingredient_patterns` from the rules. Flag any cost record derived from a line that mixes multiple flowers.

**Real example from Uptowne:** `SOLID STOCK BLK TOP THERESA GOLD OPT GOLD S.O. ORDER OPT GLD ROSES LILY QD GOLD DAISY ONISIS` — one invoice line that contains stock, roses, lily, and daisy. Any cost attributed to it lies about at least three flowers.

Auto-fix: demote all `ingredient_costs` records where `source_line_item_id` points at this line — mark them `is_current = false`. The line stays (for audit) but stops influencing averages.

### Pass 7: `not_a_flower`

Match invoice descriptions against `not_a_flower_patterns`. Flag any line item currently marked `is_flower = 1` that matches a pattern.

**Real examples:** `RFU MISCOF`, `RFU GRIB`, `MIXED OPERATIONS`, `BILL TO: 120916 OWNER'S NAME: JEFF FISHER SALESMAN: 9 TERMS: CASH SHIP VIA: MONTH REP NO: ENTERED BY: DSC` — all matched and flagged.

Auto-fix: flip `is_flower = 0`, set `review_status = 'reviewed'`. The row keeps its data but stops being counted as a flower.

### Idempotency

The scanner is safe to re-run. Each `(kind, subject_type, subject_id)` combination has at most one `open` finding at a time. Re-running updates existing findings with fresh details instead of creating duplicates. You should run it:

- After every invoice import
- After every recipe import
- After every rebuild-catalog run
- Whenever you change the rules file

---

## Part 3: The review UI

Located at [`/admin/data-quality`](/admin/data-quality). Superadmin-only.

### Three statuses

- **Open** — newly found, awaiting decision
- **Accepted** — you've acknowledged it (and optionally applied a fix)
- **Dismissed** — you've decided it's not actually a problem (false positive, legitimate edge case)

### Three actions per finding

**Apply fix** — executes the kind-specific auto-remediation and marks the finding `accepted`. Only shown for kinds that have an auto-fix (all of them except `recipe_cost_anomaly` and `quantity_outlier`).

**Accept (no fix)** — marks the finding `accepted` without doing anything to the data. Use this when you've manually fixed the underlying problem (edited a recipe, corrected a cost, etc.) and you just want to clear the finding.

**Dismiss** — marks `dismissed`. Use when the finding is a false positive — e.g., a price outlier that turns out to be a legitimately expensive premium flower, or a "recipe cost anomaly" that actually is a loss leader.

### Severity and kind filters

- Severity badge on each card (high/medium/low)
- Kind filter pills at the top — click a pill to narrow to one kind
- Findings sorted by severity (high first), then creation date

### When the UI suggests a rule

Some findings come with a `rule_snippet` field — JSON you can copy directly into [`data-quality-rules.json`](../src/lib/data-quality-rules.json) to make the rule permanent.

Example: a `not_a_flower` finding on "RFU GRIB" would show you:

```json
{
  "not_a_flower_patterns": [
    { "pattern": "^RFU ", "why": "detected by data-quality scan" }
  ]
}
```

You edit [`data-quality-rules.json`](../src/lib/data-quality-rules.json), append the pattern, edit the `why` to be more specific (e.g., "vendor stock-keeping prefix"), commit. Next scan won't flag anything matching this anymore because — after you update the `is_flower` flags — the matching line items won't show up as flowers in the first place.

---

## How the loop runs end-to-end

1. **Customer sends new data** (invoices, recipes, sales).
2. **Import** runs the data through existing pipelines (receipts extract, recipe parser, sales import, rebuild-catalog).
3. **Run the scanner:** `node scripts/scan-data-quality.js`
4. **Open the review UI** at `/admin/data-quality`.
5. **Triage:**
   - For findings with an auto-fix that looks right → click **Apply fix**
   - For findings where the pattern would recur across future invoices → **edit the rules file** and commit (this is the knowledge capture)
   - For findings that need judgement (negative-margin recipes, quantity outliers) → edit the underlying data manually, then click **Accept**
   - For false positives → **Dismiss**
6. **Rebuild profitability** (`node scripts/rebuild-profitability.js`) so margins reflect the cleaned costs.
7. **Re-run the scanner** — verify the findings you fixed are gone, spot-check what remains.

First pass on a new store might take 30–60 minutes of review. Subsequent runs are minutes.

---

## Real numbers from Uptowne (first scan)

| Finding kind | Count | Notes |
|---|---|---|
| price_outlier | 216 | Almost all bunch-price-as-stem errors. 21 are >5× the ceiling |
| not_a_flower | 26 | Vendor codes + invoice headers caught by patterns |
| recipe_cost_anomaly | 13 | Recipes with extreme margins — mostly missing cost data |
| composite_description | 5 | Multi-flower vendor lines |
| unused_catalog | 2 | Classifier artifacts |
| duplicate_catalog | 0 | Catalog rebuild keeps these out |
| quantity_outlier | 0 | Recipe parser is clean |

The `price_outlier` findings are the biggest bucket but also the easiest to handle — Apply fix on each one demotes the bad record. After triaging these, rebuild profitability and watch margins tighten.

---

## What's next

### Pass 2 — Claude-powered name review

Send every distinct ingredient name + its current classification + a few source examples to Claude in one batch call. Claude flags anything that looks misclassified, ambiguous, or like a vendor code we haven't added a pattern for.

Example of what this would catch: "GOLD DAISY" at $10.25/stem. Is that a spray-painted daisy (a real thing — florists do this for Christmas accents)? A vendor code for something else? Claude's answer becomes a finding; we Accept or Dismiss.

Not built yet — waiting on the triage of existing 262 findings first.

### Pass 3 — Claude-powered invoice reclassification

Extends the existing [`claude-match-recipes.js`](../scripts/claude-match-recipes.js) to review invoice line items the classifier handled uncertainly. Uses the same recipe-context approach.

### Pass 4 — Benchmark cross-check

For flowers where we have both invoice costs AND external benchmarks (FiftyFlowers, USDA, Oberer's wholesale), flag where invoice avg is >2.5× benchmark. Catches classifier errors that slipped through the per-base-type ceilings.

### Rules-file edit UI

Right now the rules file is edited like code — it lives in git, gets PRs, gets reviewed. Eventually we'll want a superadmin UI that appends to it (stored in the control DB as an overlay so non-engineers can add rules without a code deploy). Git-first stays the source of truth; the UI becomes a fast-path for common additions.

---

## File map

| File | What it does |
|---|---|
| [`src/lib/data-quality-rules.json`](../src/lib/data-quality-rules.json) | The rules file (institutional memory) |
| [`src/lib/data-quality.ts`](../src/lib/data-quality.ts) | `loadRules()`, `priceCeilingFor()`, `isNotAFlower()`, `applyTypoFixes()` helpers |
| [`scripts/scan-data-quality.js`](../scripts/scan-data-quality.js) | The scanner, seven passes |
| [`src/app/api/admin/data-quality/route.ts`](../src/app/api/admin/data-quality/route.ts) | List + filter findings API |
| [`src/app/api/admin/data-quality/[id]/route.ts`](../src/app/api/admin/data-quality/[id]/route.ts) | Accept / Dismiss / Apply-fix API |
| [`src/app/admin/data-quality/page.tsx`](../src/app/admin/data-quality/page.tsx) | Review UI |
| [`src/lib/store-schema.sql`](../src/lib/store-schema.sql) | `data_quality_findings` table definition (so new stores get it too) |

## Commands cheat-sheet

```bash
# Point DATABASE_URL at the store you want to scan (will change to --store flag later)
node scripts/scan-data-quality.js                    # run all passes
node scripts/scan-data-quality.js --pass=price_outlier   # one pass only

# After triaging in the UI, recompute margins:
node scripts/rebuild-profitability.js

# If you hand-edit the rules file:
#   - commit the change (it's versioned)
#   - re-run the scanner (rules are re-read on every run)
```
