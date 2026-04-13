'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

interface WhatIfRecipe {
  id: number;
  name: string;
  category: string;
  current_price: number;
  new_price: number;
  flower_cost: number | null;
  current_margin: number | null;
  current_margin_pct: number | null;
  new_margin: number | null;
  new_margin_pct: number | null;
  margin_change: number | null;
  missing: number;
}

interface WhatIfData {
  adjust: number;
  recipes: WhatIfRecipe[];
  summary: {
    current_avg_margin: number | null;
    new_avg_margin: number | null;
    recipes_with_cost: number;
    total_recipes: number;
  };
}

export default function WhatIfPage() {
  const [adjust, setAdjust] = useState(0);
  const [data, setData] = useState<WhatIfData | null>(null);

  useEffect(() => {
    fetch(`/api/what-if?adjust=${adjust}`).then(r => r.json()).then(setData);
  }, [adjust]);

  function marginColor(pct: number | null): string {
    if (pct === null) return 'text-stone-400';
    if (pct >= 70) return 'text-emerald-700';
    if (pct >= 50) return 'text-emerald-600';
    if (pct >= 30) return 'text-amber-600';
    return 'text-red-600';
  }

  const presets = [-10, -5, 0, 5, 10, 15, 20];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">What-If Pricing</h1>
        <p className="text-sm text-stone-500 mt-1">
          See how price changes affect your margins across all arrangements
        </p>
      </div>

      {/* Price Adjustment Control */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <p className="text-sm text-stone-600 mb-3">Adjust all sell prices by:</p>
        <div className="flex items-center gap-4 mb-4">
          <input
            type="range"
            min={-20}
            max={30}
            value={adjust}
            onChange={(e) => setAdjust(Number(e.target.value))}
            className="flex-1 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
          />
          <span className={`text-3xl font-mono font-medium w-24 text-right ${adjust > 0 ? 'text-emerald-700' : adjust < 0 ? 'text-red-600' : 'text-stone-900'}`}>
            {adjust > 0 ? '+' : ''}{adjust === 0 ? '$0' : `$${adjust}`}
          </span>
        </div>
        <div className="flex gap-2">
          {presets.map(p => (
            <button
              key={p}
              onClick={() => setAdjust(p)}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                adjust === p
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {p > 0 ? '+' : ''}{p === 0 ? 'Current' : `$${p}`}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-stone-400 uppercase">Current Avg Margin</p>
            <p className={`text-2xl font-mono font-medium ${marginColor(data.summary.current_avg_margin)}`}>
              {data.summary.current_avg_margin != null ? `${data.summary.current_avg_margin.toFixed(1)}%` : '-'}
            </p>
          </div>
          <div className={`border rounded-lg p-4 ${adjust !== 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-white'}`}>
            <p className="text-xs text-stone-400 uppercase">New Avg Margin {adjust !== 0 ? `(${adjust > 0 ? '+' : ''}$${adjust})` : ''}</p>
            <p className={`text-2xl font-mono font-medium ${marginColor(data.summary.new_avg_margin)}`}>
              {data.summary.new_avg_margin != null ? `${data.summary.new_avg_margin.toFixed(1)}%` : '-'}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-stone-400 uppercase">Recipes with Cost Data</p>
            <p className="text-2xl font-mono font-medium">{data.summary.recipes_with_cost} / {data.summary.total_recipes}</p>
          </div>
        </div>
      )}

      {/* Recipe Table */}
      {data && (
        <div className="border rounded-lg bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arrangement</TableHead>
                <TableHead className="text-right">Current Price</TableHead>
                <TableHead className="text-right">{adjust !== 0 ? 'New Price' : ''}</TableHead>
                <TableHead className="text-right">Flower Cost</TableHead>
                <TableHead className="text-right">Current Margin</TableHead>
                <TableHead className="text-right">{adjust !== 0 ? 'New Margin' : ''}</TableHead>
                <TableHead className="text-right">{adjust !== 0 ? 'Change' : ''}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recipes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/recipes/${r.id}`} className="text-emerald-700 hover:underline font-medium text-sm">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">${r.current_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {adjust !== 0 ? <span className={adjust > 0 ? 'text-emerald-700' : 'text-red-600'}>${r.new_price.toFixed(2)}</span> : ''}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {r.flower_cost != null ? `$${r.flower_cost.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-medium ${marginColor(r.current_margin_pct)}`}>
                    {r.current_margin_pct != null ? `${r.current_margin_pct.toFixed(1)}%` : '-'}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-medium ${marginColor(r.new_margin_pct)}`}>
                    {adjust !== 0 && r.new_margin_pct != null ? `${r.new_margin_pct.toFixed(1)}%` : ''}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {adjust !== 0 && r.margin_change != null ? (
                      <Badge className={`text-[10px] ${r.margin_change > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {r.margin_change > 0 ? '+' : ''}{r.margin_change.toFixed(1)}%
                      </Badge>
                    ) : ''}
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
