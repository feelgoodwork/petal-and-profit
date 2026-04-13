'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import type { LineItem } from '@/types';

interface ReceiptDetail {
  id: number;
  file_name: string;
  file_path: string;
  vendor_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  extraction_method: string;
  extraction_status: string;
  items: LineItem[];
}

export default function ReceiptDetailPage() {
  const { id } = useParams();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [extracting, setExtracting] = useState(false);

  async function fetchReceipt() {
    const res = await fetch(`/api/receipts/${id}`);
    if (res.ok) {
      const data = await res.json();
      setReceipt(data);
      setItems(data.items || []);
    }
  }

  async function extractReceipt() {
    setExtracting(true);
    await fetch(`/api/receipts/${id}/extract`, { method: 'POST' });
    await fetchReceipt();
    setExtracting(false);
  }

  async function updateItem(itemId: number, updates: Partial<LineItem>) {
    const res = await fetch(`/api/receipts/${id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, ...updates }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems(updated);
      setEditingId(null);
    }
  }

  async function approveAll() {
    const res = await fetch(`/api/receipts/${id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve_all' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems(updated);
      fetchReceipt();
    }
  }

  useEffect(() => { fetchReceipt(); }, [id]);

  if (!receipt) return <div className="p-8 text-stone-400">Loading...</div>;

  const flowerItems = items.filter(i => i.is_flower);
  const nonFlowerItems = items.filter(i => !i.is_flower);
  const flowerTotal = flowerItems.reduce((sum, i) => sum + (i.line_total || 0), 0);

  return (
    <div className="p-8">
      <Link href="/receipts" className="text-sm text-stone-400 hover:text-stone-600 mb-4 block">
        &larr; Back to receipts
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">
            {receipt.file_name.replace('Copy of ', '')}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant="outline">{receipt.vendor_name}</Badge>
            {receipt.invoice_number && (
              <span className="text-sm text-stone-500">Invoice #{receipt.invoice_number}</span>
            )}
            {receipt.invoice_date && (
              <span className="text-sm text-stone-500">{receipt.invoice_date}</span>
            )}
            <span className="text-sm text-stone-400">{receipt.extraction_method}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {receipt.extraction_status === 'pending' && (
            <Button onClick={extractReceipt} disabled={extracting}>
              {extracting ? 'Extracting...' : 'Extract Items'}
            </Button>
          )}
          {items.length > 0 && items.some(i => i.review_status === 'pending') && (
            <Button onClick={approveAll} variant="outline">
              Approve All Items
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      {receipt.total && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-3">
            <p className="text-xs text-stone-400 uppercase">Subtotal</p>
            <p className="text-lg font-mono">${receipt.subtotal?.toFixed(2) || '-'}</p>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <p className="text-xs text-stone-400 uppercase">Tax</p>
            <p className="text-lg font-mono">${receipt.tax?.toFixed(2) || '0.00'}</p>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <p className="text-xs text-stone-400 uppercase">Total</p>
            <p className="text-lg font-mono font-medium">${receipt.total.toFixed(2)}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-xs text-emerald-600 uppercase">Flower Items</p>
            <p className="text-lg font-mono font-medium text-emerald-700">${flowerTotal.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Line Items */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">No items extracted yet</p>
          <p className="text-sm">Click "Extract Items" to process this receipt</p>
        </div>
      ) : (
        <div className="border rounded-lg bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead className="text-right">Cost/Stem</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-16">Flower</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className={!item.is_flower ? 'bg-stone-50' : ''}
                >
                  <TableCell className="text-xs text-stone-400">{item.line_number}</TableCell>
                  <TableCell>
                    {editingId === item.id ? (
                      <Input
                        defaultValue={item.description}
                        onBlur={(e) => updateItem(item.id, { description: e.target.value })}
                        className="h-7 text-sm"
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:text-emerald-700 text-sm"
                        onClick={() => setEditingId(item.id)}
                      >
                        {item.description}
                      </span>
                    )}
                    {item.notes && (
                      <span className="text-xs text-amber-600 ml-2">{item.notes}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.quantity ?? '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.unit_price != null ? `$${item.unit_price.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell>
                    {item.is_flower ? (
                      <Badge variant="outline" className={`text-[9px] ${
                        item.price_basis === 'per_stem' ? 'text-emerald-600 border-emerald-300' :
                        item.price_basis === 'per_bunch' ? 'text-blue-600 border-blue-300' :
                        'text-stone-400 border-stone-200'
                      }`}>
                        {item.price_basis || 'unknown'}
                        {item.stems_per_unit ? ` (${item.stems_per_unit}/bu)` : ''}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-emerald-700">
                    {item.cost_per_stem != null
                      ? `$${item.cost_per_stem.toFixed(2)}`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {item.line_total != null ? `$${item.line_total.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={!!item.is_flower}
                      onCheckedChange={(checked) => updateItem(item.id, { is_flower: checked ? 1 : 0 } as Partial<LineItem>)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        item.review_status === 'approved' ? 'text-emerald-600 border-emerald-300' :
                        item.review_status === 'edited' ? 'text-blue-600 border-blue-300' :
                        'text-stone-400 border-stone-200'
                      }`}
                    >
                      {item.review_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.review_status !== 'approved' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => updateItem(item.id, { review_status: 'approved' })}
                      >
                        OK
                      </Button>
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
