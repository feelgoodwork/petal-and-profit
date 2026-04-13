'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import type { ProfitabilitySnapshot } from '@/types';

export default function ProfitabilityPage() {
  const [snapshots, setSnapshots] = useState<ProfitabilitySnapshot[]>([]);
  const [computing, setComputing] = useState(false);

  async function fetchSnapshots() {
    const res = await fetch('/api/profitability');
    if (res.ok) setSnapshots(await res.json());
  }

  async function computeProfitability() {
    setComputing(true);
    await fetch('/api/profitability', { method: 'POST' });
    await fetchSnapshots();
    setComputing(false);
  }

  useEffect(() => { fetchSnapshots(); }, []);

  function marginColor(pct: number | null, missing: number): string {
    if (pct === null || missing > 0) return 'text-stone-400';
    if (pct >= 70) return 'text-emerald-700';
    if (pct >= 50) return 'text-emerald-600';
    if (pct >= 30) return 'text-amber-600';
    return 'text-red-600';
  }

  function marginBg(pct: number | null, missing: number): string {
    if (pct === null || missing > 0) return '';
    if (pct >= 70) return 'bg-emerald-50';
    if (pct >= 50) return '';
    if (pct >= 30) return 'bg-amber-50';
    return 'bg-red-50';
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Profitability</h1>
          <p className="text-sm text-stone-500 mt-1">
            {snapshots.length} arrangements analyzed
          </p>
        </div>
        <Button onClick={computeProfitability} disabled={computing}>
          {computing ? 'Computing...' : 'Compute Profitability'}
        </Button>
      </div>

      {snapshots.length === 0 ? (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">No profitability data yet</p>
          <p className="text-sm">
            Import recipes, extract receipts, match items, then click "Compute Profitability"
          </p>
        </div>
      ) : (
        <div className="border rounded-lg bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arrangement</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Sell Price</TableHead>
                <TableHead className="text-right">Flower Cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">Completeness</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((s) => (
                <TableRow key={s.id} className={marginBg(s.margin_pct, s.missing_ingredients)}>
                  <TableCell>
                    <Link href={`/recipes/${s.recipe_id}`} className="text-emerald-700 hover:underline font-medium">
                      {s.recipe_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{s.category_name}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${s.sell_price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {s.total_flower_cost != null && s.total_flower_cost > 0
                      ? `$${s.total_flower_cost.toFixed(2)}`
                      : '-'}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-medium ${marginColor(s.margin_pct, s.missing_ingredients)}`}>
                    {s.gross_margin != null && s.total_flower_cost != null && s.total_flower_cost > 0
                      ? `$${s.gross_margin.toFixed(2)}`
                      : '-'}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-medium ${marginColor(s.margin_pct, s.missing_ingredients)}`}>
                    {s.margin_pct != null && s.total_flower_cost != null && s.total_flower_cost > 0
                      ? `${s.margin_pct.toFixed(1)}%`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.missing_ingredients === 0 ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px]">Complete</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">
                        {s.missing_ingredients} missing
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
