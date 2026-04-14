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
  base_type: string | null;
  category: string | null;
  price_unit: string;
  alias_count: number;
  avg_cost: number | null;
  min_cost: number | null;
  max_cost: number | null;
  cost_count: number;
  pp_price: number | null;
}

interface CatalogGroup {
  baseType: string;
  entries: CatalogEntry[];
}

function groupByBaseType(entries: CatalogEntry[]): CatalogGroup[] {
  const map = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    const key = e.base_type ?? e.canonical_name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .map(([baseType, ents]) => ({ baseType, entries: ents }))
    .sort((a, b) => a.baseType.localeCompare(b.baseType));
}

export default function CatalogPage() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [building, setBuilding] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
        `Catalog: ${data.catalog.created} types. ` +
        `Recipes: ${data.recipe_matching.matched} matched. ` +
        `Invoices: ${data.line_item_matching.matched} matched, ${data.line_item_matching.aliases_created} aliases.`
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
        `AI classified ${data.classified} items: ${data.new_matches} new matches, ${data.marked_non_flower} marked non-flower, ${data.errors} errors.`
      );
      fetchCatalog();
    } else {
      setResult(`Error: ${data.error}`);
    }
    setClassifying(false);
  }

  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  useEffect(() => { fetchCatalog(); }, []);

  const flowers = entries.filter(e => e.category === 'flower');
  const foliage = entries.filter(e => e.category === 'foliage');
  const flowerGroups = groupByBaseType(flowers);

  const totalWithCost = entries.filter(e => e.avg_cost != null).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Flower Catalog</h1>
          <p className="text-sm text-stone-500 mt-1">
            {entries.length} product types ({flowers.length} flowers, {foliage.length} foliage) &middot; {totalWithCost} with cost data
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
          <p className="text-sm">Click &ldquo;Rebuild Catalog &amp; Match&rdquo; to build from recipes and invoices</p>
        </div>
      ) : (
        <>
          {/* Flowers — grouped by base type */}
          <div className="mb-8">
            <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">
              Flowers &mdash; {flowerGroups.length} types, {flowers.length} variants
            </h2>
            <div className="border rounded-lg bg-white divide-y">
              {flowerGroups.map(group => {
                const isCollapsed = collapsed.has(group.baseType);
                const hasMultiple = group.entries.length > 1;
                const groupWithCost = group.entries.filter(e => e.avg_cost != null).length;
                return (
                  <div key={group.baseType}>
                    {/* Group header */}
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
                      onClick={() => toggleGroup(group.baseType)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-stone-400">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="font-medium text-stone-800 capitalize">{group.baseType}</span>
                        {hasMultiple && (
                          <Badge variant="outline" className="text-[10px] text-stone-500">
                            {group.entries.length} colors
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-stone-400">
                        {groupWithCost}/{group.entries.length} costed
                      </span>
                    </button>

                    {/* Entries */}
                    {!isCollapsed && (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-white">
                            <TableHead className="pl-10">Variant</TableHead>
                            <TableHead className="text-right">Aliases</TableHead>
                            <TableHead className="text-right">Avg Cost/stem</TableHead>
                            <TableHead className="text-right">P&P Price</TableHead>
                            <TableHead className="text-right">Range</TableHead>
                            <TableHead className="text-right">Price Points</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.entries.map(entry => (
                            <TableRow key={entry.id}>
                              <TableCell className="pl-10">
                                <Link
                                  href={`/catalog/${entry.id}`}
                                  className="text-emerald-700 hover:underline font-medium capitalize"
                                >
                                  {entry.canonical_name}
                                </Link>
                                {entry.canonical_name === entry.base_type && (
                                  <span className="ml-2 text-[10px] text-stone-400 border rounded px-1">no color</span>
                                )}
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
                                  ? <span>${entry.avg_cost.toFixed(2)}<span className="text-stone-400 text-xs font-sans">/stem</span></span>
                                  : <span className="text-stone-300">-</span>}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {entry.pp_price != null
                                  ? <span className={entry.avg_cost != null && entry.pp_price < entry.avg_cost ? 'text-emerald-700' : 'text-stone-500'}>
                                      ${entry.pp_price.toFixed(2)}<span className="text-stone-400 text-xs font-sans">/stem</span>
                                    </span>
                                  : <span className="text-stone-300">-</span>}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-stone-500">
                                {entry.min_cost != null && entry.max_cost != null
                                  ? `$${entry.min_cost.toFixed(2)} – $${entry.max_cost.toFixed(2)}`
                                  : '-'}
                              </TableCell>
                              <TableCell className="text-right text-sm text-stone-500">
                                {entry.cost_count || <span className="text-stone-300">-</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Foliage — flat table */}
          <div className="mb-8">
            <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">
              Foliage &amp; Greenery &mdash; priced per bunch
            </h2>
            <div className="border rounded-lg bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Type</TableHead>
                    <TableHead className="text-right">Aliases</TableHead>
                    <TableHead className="text-right">Avg Cost/bunch</TableHead>
                    <TableHead className="text-right">P&P Price</TableHead>
                    <TableHead className="text-right">Range</TableHead>
                    <TableHead className="text-right">Price Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {foliage.map(entry => (
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
                          ? <span>${entry.avg_cost.toFixed(2)}<span className="text-stone-400 text-xs font-sans">/bunch</span></span>
                          : <span className="text-stone-300">-</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {entry.pp_price != null
                          ? <span className={entry.avg_cost != null && entry.pp_price < entry.avg_cost ? 'text-emerald-700' : 'text-stone-500'}>
                              ${entry.pp_price.toFixed(2)}<span className="text-stone-400 text-xs font-sans">/bunch</span>
                            </span>
                          : <span className="text-stone-300">-</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-stone-500">
                        {entry.min_cost != null && entry.max_cost != null
                          ? `$${entry.min_cost.toFixed(2)} – $${entry.max_cost.toFixed(2)}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm text-stone-500">
                        {entry.cost_count || <span className="text-stone-300">-</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
