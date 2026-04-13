'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

interface CatalogEntry {
  id: number;
  canonical_name: string;
  category: string | null;
  price_unit: string;
  alias_count: number;
  avg_cost: number | null;
  min_cost: number | null;
  max_cost: number | null;
  cost_count: number;
}

export default function CatalogPage() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [building, setBuilding] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function fetchCatalog() {
    const res = await fetch('/api/catalog');
    if (res.ok) setEntries(await res.json());
  }

  async function buildCatalog() {
    setBuilding(true);
    setResult(null);
    const res = await fetch('/api/catalog', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setResult(
        `Catalog: ${data.catalog.created} types created. ` +
        `Recipes: ${data.recipe_matching.matched} matched, ${data.recipe_matching.unmatched} unmatched. ` +
        `Invoices: ${data.line_item_matching.matched} matched, ${data.line_item_matching.unmatched} unmatched, ${data.line_item_matching.aliases_created} aliases.`
      );
      fetchCatalog();
    }
    setBuilding(false);
  }

  async function classifyWithAI() {
    setClassifying(true);
    setResult(null);
    const res = await fetch('/api/catalog/classify', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setResult(
        `AI classified ${data.classified} items: ${data.new_matches} new matches, ${data.marked_non_flower} marked as non-flower, ${data.errors} errors.`
      );
      fetchCatalog();
    } else {
      setResult(`Error: ${data.error}`);
    }
    setClassifying(false);
  }

  useEffect(() => { fetchCatalog(); }, []);

  const flowers = entries.filter(e => e.category === 'flower');
  const foliage = entries.filter(e => e.category === 'foliage');

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Flower Catalog</h1>
          <p className="text-sm text-stone-500 mt-1">
            {entries.length} product types ({flowers.length} flowers, {foliage.length} foliage)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={buildCatalog} disabled={building}>
            {building ? 'Building...' : 'Rebuild Catalog & Match'}
          </Button>
          <Button onClick={classifyWithAI} disabled={classifying}>
            {classifying ? 'Classifying...' : 'Classify Unmatched with AI'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-6 text-sm text-emerald-800">
          {result}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">Catalog is empty</p>
          <p className="text-sm">Click "Rebuild Catalog & Match" to create product types from recipes and match invoice items</p>
        </div>
      ) : (
        <>
          <CatalogTable title="Flowers" entries={flowers} />
          <CatalogTable title="Foliage & Greenery" entries={foliage} />
        </>
      )}
    </div>
  );
}

function CatalogTable({ title, entries }: { title: string; entries: CatalogEntry[] }) {
  if (entries.length === 0) return null;
  // All entries in a table share the same category, so use the first entry's unit
  const unit = entries[0]?.price_unit ?? 'stem';
  const unitLabel = `/${unit}`;

  return (
    <div className="mb-8">
      <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">{title}</h2>
      <div className="border rounded-lg bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product Type</TableHead>
              <TableHead className="text-right">Aliases</TableHead>
              <TableHead className="text-right">Avg Cost{unitLabel}</TableHead>
              <TableHead className="text-right">Range</TableHead>
              <TableHead className="text-right">Price Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <Link href={`/catalog/${entry.id}`} className="text-emerald-700 hover:underline font-medium capitalize">
                    {entry.canonical_name}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  {entry.alias_count > 0 ? (
                    <Badge variant="outline" className="text-xs">{entry.alias_count}</Badge>
                  ) : (
                    <span className="text-stone-300">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {entry.avg_cost != null
                    ? <span>${entry.avg_cost.toFixed(2)}<span className="text-stone-400 text-xs font-sans">{unitLabel}</span></span>
                    : '-'}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-stone-500">
                  {entry.min_cost != null && entry.max_cost != null
                    ? `$${entry.min_cost.toFixed(2)} – $${entry.max_cost.toFixed(2)}`
                    : '-'}
                </TableCell>
                <TableCell className="text-right text-sm text-stone-500">
                  {entry.cost_count || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
