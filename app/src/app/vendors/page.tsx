'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface VendorPrice {
  vendor: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  latest: string | null;
}

type ComparisonData = Record<string, VendorPrice[]>;

export default function VendorsPage() {
  const [data, setData] = useState<ComparisonData | null>(null);

  useEffect(() => {
    fetch('/api/vendors/compare').then(r => r.json()).then(setData);
  }, []);

  if (!data) return <div className="p-8 text-stone-400">Loading...</div>;

  const types = Object.entries(data)
    .filter(([, vendors]) => vendors.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Vendor Price Comparison</h1>
        <p className="text-sm text-stone-500 mt-1">
          Side-by-side cost per stem across vendors. Green = cheapest for that product type.
        </p>
      </div>

      <div className="space-y-6">
        {types.map(([type, vendors]) => {
          const cheapest = Math.min(...vendors.map(v => v.avg));
          return (
            <div key={type} className="border rounded-lg bg-white">
              <div className="px-4 py-2 border-b bg-stone-50">
                <h3 className="font-medium text-stone-900 capitalize">{type}</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Avg $/Stem</TableHead>
                    <TableHead className="text-right">Range</TableHead>
                    <TableHead className="text-right">Data Points</TableHead>
                    <TableHead>Latest Invoice</TableHead>
                    <TableHead className="text-right">vs Cheapest</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((v) => {
                    const isCheapest = v.avg === cheapest;
                    const premium = cheapest > 0 ? ((v.avg - cheapest) / cheapest * 100) : 0;
                    return (
                      <TableRow key={v.vendor} className={isCheapest ? 'bg-emerald-50' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{v.vendor}</span>
                            {isCheapest && <Badge className="text-[9px] bg-emerald-100 text-emerald-700">Best Price</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${isCheapest ? 'text-emerald-700' : ''}`}>
                          ${v.avg.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-stone-500">
                          ${v.min.toFixed(2)} - ${v.max.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-stone-500">{v.count}</TableCell>
                        <TableCell className="text-sm text-stone-500">{v.latest || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {isCheapest ? (
                            <span className="text-emerald-600">--</span>
                          ) : (
                            <span className="text-red-500">+{premium.toFixed(0)}%</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
