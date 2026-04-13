export default function HelpPage() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-stone-900 mb-1">How to Use Petal & Profit</h1>
      <p className="text-sm text-stone-500 mb-8">Know what every arrangement actually makes you.</p>

      <Section num={1} title="Dashboard" path="/">
        <p>Overview of the pipeline. Shows counts for receipts, line items, recipes, and catalog entries. Pipeline steps light up green as you complete them.</p>
      </Section>

      <Section num={2} title="Receipts" path="/receipts">
        <p>All vendor invoices imported from Google Drive. Click any receipt to see extracted line items with:</p>
        <ul>
          <li><strong>Pricing badge</strong> -- "per_stem" (green) or "per_bunch" (blue) so you know what the price represents</li>
          <li><strong>Cost/Stem</strong> -- normalized cost regardless of how the vendor priced it</li>
          <li><strong>Approve All Items</strong> -- marks items as reviewed after you check them</li>
        </ul>
      </Section>

      <Section num={3} title="Recipes" path="/recipes">
        <p>Floral arrangements parsed from the Flower Shop Network catalog PDFs. Click any recipe to see:</p>
        <ul>
          <li><strong>Cost breakdown</strong> -- every ingredient with its matched product type, cost per stem, and line cost</li>
          <li><strong>Margin calculation</strong> -- sell price minus flower cost, with percentage</li>
          <li><strong>Missing ingredients</strong> highlighted in amber -- these need manual costs or better matching</li>
        </ul>
      </Section>

      <Section num={4} title="Flower Catalog" path="/catalog">
        <p>Product types (standard roses, spray roses, mini carnations, etc.) with average costs and price ranges from invoice data.</p>
        <ul>
          <li><strong>Rebuild Catalog & Match</strong> -- re-runs the matching engine. Use after importing new receipts.</li>
          <li><strong>Classify Unmatched with AI</strong> -- sends unrecognized invoice descriptions to Claude for classification. Identifies flower types, flags non-flower items (ribbon, containers).</li>
        </ul>
        <p className="mt-2">Click any product type to see:</p>
        <ul>
          <li><strong>All invoice line items</strong> for that type across all vendors and dates</li>
          <li><strong>USDA Benchmark</strong> from the Boston Terminal Market</li>
          <li><strong>Set Manual Cost</strong> -- enter a per-stem price for items with no invoice data (foliage, etc.)</li>
          <li><strong>Use USDA Price</strong> -- apply the USDA benchmark as a fallback cost</li>
          <li><strong>Recipe usage</strong> -- which arrangements use this flower and what it costs them</li>
        </ul>
      </Section>

      <Section num={5} title="Match Review" path="/matching">
        <p>Queue of invoice items that the system couldn't auto-match. Shows the best guess with a confidence score. Confirm to teach the system -- it remembers the alias forever. Next time that description appears on an invoice, it auto-matches.</p>
      </Section>

      <Section num={6} title="Profitability" path="/profitability">
        <p>All recipes ranked by margin. Click "Compute Profitability" to recalculate after adding costs.</p>
        <ul>
          <li>Green = healthy margin</li>
          <li>Amber = thin margin</li>
          <li>Red = losing money</li>
          <li>"Complete" badge = every ingredient has cost data</li>
        </ul>
      </Section>

      <Divider />

      <h2 className="text-lg font-semibold text-stone-900 mb-4">Typical Workflow</h2>
      <ol className="space-y-2 text-sm text-stone-700 mb-8 list-none">
        <Step n={1}>Go to <strong>Catalog</strong> and click <strong>Rebuild Catalog & Match</strong></Step>
        <Step n={2}>Click <strong>Classify Unmatched with AI</strong> (takes about 30 seconds)</Step>
        <Step n={3}>Go to <strong>Profitability</strong> and click <strong>Compute Profitability</strong></Step>
        <Step n={4}>Click into recipes with "missing" ingredients</Step>
        <Step n={5}>Click the uncosted ingredient's product type to open its catalog page</Step>
        <Step n={6}>Set a manual cost or click "Use USDA price" for the fallback</Step>
        <Step n={7}>Go back to <strong>Profitability</strong> and recompute</Step>
      </ol>

      <Divider />

      <h2 className="text-lg font-semibold text-stone-900 mb-4">How Matching Works</h2>
      <div className="space-y-3 text-sm text-stone-700 mb-8">
        <p><strong>Layer 1 -- Variety lookup.</strong> Named rose varieties (Freedom, Mondial, Explorer) are mapped to product types. "Freedom Roses 70 CM" becomes "standard roses".</p>
        <p><strong>Layer 2 -- Keyword detection.</strong> "Spray Roses ASSORTED" matches "spray roses". "MINI CARNATIONS FANCY" matches "mini carnations". Specific types are checked before generic ones.</p>
        <p><strong>Layer 3 -- AI classification.</strong> Claude classifies unrecognized wholesale codes (CPF abbreviations, garbled OCR) using floral industry knowledge.</p>
        <p><strong>Layer 4 -- Fuzzy match.</strong> Remaining items get fuzzy-searched against the catalog with a confidence score for human review.</p>
      </div>

      <Divider />

      <h2 className="text-lg font-semibold text-stone-900 mb-4">Price Basis</h2>
      <div className="space-y-2 text-sm text-stone-700 mb-8">
        <p>Vendors price flowers differently. The system auto-detects and normalizes:</p>
        <ul>
          <li><strong>Per stem</strong> (green badge) -- Asiri Blooms typically prices this way. Cost/stem = unit price.</li>
          <li><strong>Per bunch</strong> (blue badge) -- CPF, Dreisbach, and many wholesalers. Cost/stem = unit price / stems per bunch. Common bunch sizes: roses 25, carnations 25, gerberas 10, most fillers 10.</li>
          <li><strong>Per unit</strong> -- Sam's Club and some others. May be stem or bunch depending on the item.</li>
        </ul>
      </div>

      <Divider />

      <h2 className="text-lg font-semibold text-stone-900 mb-4">USDA Benchmarks</h2>
      <div className="space-y-2 text-sm text-stone-700">
        <p>The system pulls wholesale flower pricing from the USDA Boston Terminal Market Ornamentals report. This provides an independent benchmark to compare against what you actually pay your vendors.</p>
        <p>Data is stored with the report date and fetch timestamp. Use the "Use USDA Price" button on any catalog entry to set it as the fallback cost when no invoice data exists.</p>
      </div>
    </div>
  );
}

function Section({ num, title, path, children }: { num: number; title: string; path: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-medium">{num}</span>
        <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
        <a href={path} className="text-xs text-emerald-600 hover:underline">{path}</a>
      </div>
      <div className="pl-9 text-sm text-stone-700 space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_li]:text-stone-600">
        {children}
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-5 h-5 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center text-[10px] font-medium mt-0.5 shrink-0">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function Divider() {
  return <hr className="border-stone-200 my-8" />;
}
