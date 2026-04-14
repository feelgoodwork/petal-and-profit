'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface SavingsItem {
  flower_type: string;
  base_type: string | null;
  category: string;
  unit_type: string;
  purchase_count: number;
  avg_actual_cost: number;
  total_actual_cost: number;
  pp_price_per_unit: number;
  total_pp_cost: number;
  savings_per_unit: number;
  total_savings: number;
  savings_pct: number;
  benchmark_vendor: string;
  match_type: string;
}

interface SavingsData {
  date_range: { start: string; end: string };
  min_savings_pct: number;
  summary: {
    flower_types_compared: number;
    total_actual_cost: number;
    total_pp_cost: number;
    total_savings: number;
    overall_savings_pct: number;
  };
  items: SavingsItem[];
}

function formatCurrency(val: number) {
  return '$' + val.toFixed(2);
}

export default function SavingsPage() {
  const [data, setData] = useState<SavingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('2025-02-01');
  const [endDate, setEndDate] = useState('2025-03-31');

  const fetchSavings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/savings?start=${startDate}&end=${endDate}&min_pct=10`);
      const d = await res.json();
      if (d.error) setError(d.error);
      else setData(d);
    } catch {
      setError('Failed to load savings data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchSavings(); }, [fetchSavings]);

  const flowers = data?.items.filter(i => i.category === 'flower') ?? [];
  const foliage = data?.items.filter(i => i.category === 'foliage') ?? [];

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">
          Petal &amp; Profit Savings Analysis
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Compare what you paid vs what you would pay through Petal &amp; Profit
        </p>
      </div>

      {/* Date range controls */}
      <div className="flex items-end gap-4 mb-6">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <Button onClick={fetchSavings} variant="outline" size="sm" disabled={loading}>
          {loading ? 'Loading...' : 'Update'}
        </Button>
        <p className="text-xs text-stone-400 ml-2">Only showing flower types with 10%+ savings</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-stone-400">Loading savings analysis...</div>
      )}

      {!loading && !error && (!data || data.items.length === 0) && (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">No savings opportunities found</p>
          <p className="text-sm">
            No invoice cost data in the selected date range, or no P&P benchmark data loaded yet.
          </p>
        </div>
      )}

      {!loading && data && data.items.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs text-stone-400 uppercase tracking-wider">What You Paid</p>
              <p className="text-2xl font-semibold text-stone-900 mt-1">
                {formatCurrency(data.summary.total_actual_cost)}
              </p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs text-stone-400 uppercase tracking-wider">P&P Price Would Be</p>
              <p className="text-2xl font-semibold text-emerald-700 mt-1">
                {formatCurrency(data.summary.total_pp_cost)}
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-xs text-emerald-600 uppercase tracking-wider">Total Savings</p>
              <p className="text-2xl font-semibold text-emerald-700 mt-1">
                {formatCurrency(data.summary.total_savings)}
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-xs text-emerald-600 uppercase tracking-wider">Overall Savings</p>
              <p className="text-2xl font-semibold text-emerald-700 mt-1">
                {data.summary.overall_savings_pct}%
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                across {data.summary.flower_types_compared} flower types
              </p>
            </div>
          </div>

          {/* Flowers table */}
          {flowers.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">
                Flowers &mdash; {flowers.length} types with savings
              </h2>
              <SavingsTable items={flowers} />
            </div>
          )}

          {/* Foliage table */}
          {foliage.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">
                Foliage &amp; Greenery &mdash; {foliage.length} types with savings
              </h2>
              <SavingsTable items={foliage} />
            </div>
          )}

          <p className="text-xs text-stone-400 mt-4">
            P&P pricing = wholesale cost + 20% markup.
            Only showing types where current vendor cost exceeds P&P price by 10% or more.
          </p>
        </>
      )}
    </div>
  );
}

function SavingsTable({ items }: { items: SavingsItem[] }) {
  return (
    <div className="border rounded-lg bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Flower Type</TableHead>
            <TableHead className="text-right">Purchases</TableHead>
            <TableHead className="text-right">You Paid (avg)</TableHead>
            <TableHead className="text-right">P&P Price</TableHead>
            <TableHead className="text-right">Savings/unit</TableHead>
            <TableHead className="text-right">Total Paid</TableHead>
            <TableHead className="text-right">P&P Total</TableHead>
            <TableHead className="text-right">Total Saved</TableHead>
            <TableHead className="text-right">% Saved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.flower_type + item.unit_type}>
              <TableCell>
                <span className="font-medium text-stone-800 capitalize">{item.flower_type}</span>
                <span className="text-[10px] text-stone-400 ml-2">
                  per {item.unit_type}
                </span>
                {item.match_type === 'base_type' && (
                  <Badge variant="outline" className="ml-2 text-[9px] text-stone-400">
                    base type match
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right text-sm text-stone-600">
                {item.purchase_count}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-red-600">
                {formatCurrency(item.avg_actual_cost)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-emerald-700">
                {formatCurrency(item.pp_price_per_unit)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-emerald-700">
                {formatCurrency(item.savings_per_unit)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-stone-600">
                {formatCurrency(item.total_actual_cost)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-emerald-700">
                {formatCurrency(item.total_pp_cost)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                {formatCurrency(item.total_savings)}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  className={
                    item.savings_pct >= 30
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : item.savings_pct >= 20
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                  }
                  variant="outline"
                >
                  {item.savings_pct}%
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
