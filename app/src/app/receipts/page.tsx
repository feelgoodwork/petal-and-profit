'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

interface ReceiptRow {
  id: number;
  file_name: string;
  vendor_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  extraction_method: string;
  extraction_status: string;
  item_count: number;
}

const statusColors: Record<string, string> = {
  pending: 'bg-stone-100 text-stone-600',
  extracted: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
};

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [extracting, setExtracting] = useState<number | null>(null);

  async function fetchReceipts() {
    const res = await fetch('/api/receipts');
    if (res.ok) setReceipts(await res.json());
  }

  async function importReceipts() {
    setImporting(true);
    await fetch('/api/receipts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    });
    await fetchReceipts();
    setImporting(false);
  }

  async function extractReceipt(id: number) {
    setExtracting(id);
    await fetch(`/api/receipts/${id}/extract`, { method: 'POST' });
    await fetchReceipts();
    setExtracting(null);
  }

  async function extractAll() {
    const pending = receipts.filter(r => r.extraction_status === 'pending');
    for (const r of pending) {
      setExtracting(r.id);
      await fetch(`/api/receipts/${r.id}/extract`, { method: 'POST' });
      await fetchReceipts();
    }
    setExtracting(null);
  }

  useEffect(() => { fetchReceipts(); }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Receipts</h1>
          <p className="text-sm text-stone-500 mt-1">
            {receipts.length} receipts imported
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={importReceipts} disabled={importing}>
            {importing ? 'Importing...' : 'Import Receipts'}
          </Button>
          {receipts.some(r => r.extraction_status === 'pending') && (
            <Button onClick={extractAll} disabled={extracting !== null}>
              {extracting ? 'Extracting...' : 'Extract All Pending'}
            </Button>
          )}
        </div>
      </div>

      {receipts.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-lg mb-2">No receipts imported yet</p>
          <p className="text-sm">Click "Import Receipts" to load PDFs from Google Drive</p>
        </div>
      ) : (
        <div className="border rounded-lg bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-48">
                    <Link href={`/receipts/${r.id}`} className="text-emerald-700 hover:underline text-sm">
                      {r.file_name.replace('Copy of ', '').substring(0, 40)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{r.vendor_name}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-stone-600">
                    {r.invoice_number || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-stone-600">
                    {r.invoice_date || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {r.total ? `$${r.total.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.item_count || '-'}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-stone-400">{r.extraction_method}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${statusColors[r.extraction_status] || ''}`}>
                      {r.extraction_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.extraction_status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => extractReceipt(r.id)}
                        disabled={extracting === r.id}
                      >
                        {extracting === r.id ? '...' : 'Extract'}
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
