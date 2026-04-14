'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

interface SavingsItem {
  recipe_id: number;
  recipe_name: string;
  category: string;
  sell_price: number;
  times_sold: number;
  total_revenue: number;
  current_flower_cost: number;
  pp_flower_cost: number;
  current_margin_pct: number;
  pp_margin_pct: number;
  savings_per_arrangement: number;
  total_savings: number;
  savings_pct: number;
  ingredients_costed: number;
  ingredients_total: number;
  pp_ingredients_costed: number;
}

interface SavingsData {
  summary: {
    arrangements_compared: number;
    total_times_sold: number;
    total_revenue: number;
    total_current_flower_cost: number;
    total_pp_flower_cost: number;
    total_savings: number;
    overall_savings_pct: number;
  } | null;
  items: SavingsItem[];
}

function fmt(val: number) {
  return '$' + val.toFixed(2);
}

export default function SavingsPage() {
  const [data, setData] = useState<SavingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/savings')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load savings data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-stone-400">Loading savings analysis...</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>
      </div>
    );
  }

  if (!data?.summary || data.items.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">P&P Savings Analysis</h1>
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">No savings opportunities found</p>
          <p className="text-sm">No matching data between 2026 sales, recipe costs, and wholesale benchmarks.</p>
        </div>
      </div>
    );
  }

  const { summary, items } = data;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">
          Petal &amp; Profit Savings Analysis
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          2026 arrangements sold &middot; Where P&P sourcing would save at least 10% on flower costs
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-stone-400 uppercase tracking-wider">Arrangements</p>
          <p className="text-2xl font-semibold text-stone-900 mt-1">
            {summary.arrangements_compared}
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            sold {summary.total_times_sold.toLocaleString()} times
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-stone-400 uppercase tracking-wider">2026 Revenue</p>
          <p className="text-2xl font-semibold text-stone-900 mt-1">
            {fmt(summary.total_revenue)}
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-stone-400 uppercase tracking-wider">Current Flower Cost</p>
          <p className="text-2xl font-semibold text-stone-900 mt-1">
            {fmt(summary.total_current_flower_cost)}
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-stone-400 uppercase tracking-wider">P&P Flower Cost</p>
          <p className="text-2xl font-semibold text-emerald-700 mt-1">
            {fmt(summary.total_pp_flower_cost)}
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <p className="text-xs text-emerald-600 uppercase tracking-wider">Total Savings</p>
          <p className="text-2xl font-semibold text-emerald-700 mt-1">
            {fmt(summary.total_savings)}
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            {summary.overall_savings_pct}% less on flowers
          </p>
        </div>
      </div>

      {/* Arrangements table */}
      <div className="border rounded-lg bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arrangement</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Sell Price</TableHead>
              <TableHead className="text-right">Times Sold</TableHead>
              <TableHead className="text-right">Current Cost</TableHead>
              <TableHead className="text-right">Current Margin</TableHead>
              <TableHead className="text-right">P&P Cost</TableHead>
              <TableHead className="text-right">P&P Margin</TableHead>
              <TableHead className="text-right">Saved/each</TableHead>
              <TableHead className="text-right">Total Saved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.recipe_id}>
                <TableCell>
                  <Link
                    href={`/recipes/${item.recipe_id}`}
                    className="text-emerald-700 hover:underline font-medium"
                  >
                    {item.recipe_name}
                  </Link>
                  {item.ingredients_costed < item.ingredients_total && (
                    <span className="text-[10px] text-stone-400 ml-2">
                      {item.ingredients_costed}/{item.ingredients_total} costed
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{item.category}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt(item.sell_price)}
                </TableCell>
                <TableCell className="text-right text-sm text-stone-600">
                  {item.times_sold}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-stone-600">
                  {fmt(item.current_flower_cost)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-stone-600">
                  {item.current_margin_pct.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-emerald-700">
                  {fmt(item.pp_flower_cost)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-emerald-700 font-medium">
                  {item.pp_margin_pct.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-emerald-700">
                  {fmt(item.savings_per_arrangement)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm font-semibold text-emerald-700">
                    {fmt(item.total_savings)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-stone-400 mt-4">
        P&P pricing = wholesale cost + 20% markup. Current costs based on historical invoice avg cost/stem.
        Only showing arrangements where P&P sourcing saves at least 10% on flower costs.
        Total savings = savings per arrangement x times sold in 2026.
      </p>
    </div>
  );
}
