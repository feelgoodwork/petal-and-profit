'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import Link from 'next/link';

interface LineItem {
  id: number;
  line_number: number;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  is_flower: number;
  price_basis: string | null;
  stems_per_unit: number | null;
  cost_per_stem: number | null;
  notes: string | null;
  review_status: string;
}

interface CatalogEntry {
  id: number;
  canonical_name: string;
  category: string;
}

interface ReceiptDetail {
  id: number;
  file_name: string;
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
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [editItem, setEditItem] = useState<LineItem | null>(null);
  const [extracting, setExtracting] = useState(false);

  async function fetchReceipt() {
    const res = await fetch(`/api/receipts/${id}`);
    if (res.ok) {
      const data = await res.json();
      setReceipt(data);
      setItems(data.items || []);
    }
  }

  async function fetchCatalog() {
    const res = await fetch('/api/catalog');
    if (res.ok) setCatalog(await res.json());
  }

  async function updateItem(itemId: number, updates: Record<string, unknown>) {
    const res = await fetch(`/api/receipts/${id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, ...updates }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems(updated);
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

  async function extractReceipt() {
    setExtracting(true);
    await fetch(`/api/receipts/${id}/extract`, { method: 'POST' });
    await fetchReceipt();
    setExtracting(false);
  }

  useEffect(() => { fetchReceipt(); fetchCatalog(); }, [id]);

  if (!receipt) return <div className="p-8 text-stone-400">Loading...</div>;

  const flowerTotal = items.filter(i => i.is_flower).reduce((s, i) => s + (i.line_total || 0), 0);

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
            {receipt.invoice_number && <span className="text-sm text-stone-500">#{receipt.invoice_number}</span>}
            {receipt.invoice_date && <span className="text-sm text-stone-500">{receipt.invoice_date}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {receipt.extraction_status === 'pending' && (
            <Button onClick={extractReceipt} disabled={extracting}>
              {extracting ? 'Extracting...' : 'Extract Items'}
            </Button>
          )}
          {items.length > 0 && items.some(i => i.review_status === 'pending') && (
            <Button onClick={approveAll} variant="outline">Approve All</Button>
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
          <p>No items extracted yet. Click "Extract Items" to process.</p>
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
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className={!item.is_flower ? 'bg-stone-50' : ''}>
                  <TableCell className="text-xs text-stone-400">{item.line_number}</TableCell>
                  <TableCell>
                    <span className="text-sm">{item.description}</span>
                    {item.notes && <span className="text-xs text-amber-600 ml-2">{item.notes}</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{item.quantity ?? '-'}</TableCell>
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
                    {item.cost_per_stem != null ? `$${item.cost_per_stem.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {item.line_total != null ? `$${item.line_total.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={!!item.is_flower}
                      onCheckedChange={(checked) => updateItem(item.id, { is_flower: checked ? 1 : 0 })}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${
                      item.review_status === 'approved' ? 'text-emerald-600 border-emerald-300' :
                      item.review_status === 'edited' ? 'text-blue-600 border-blue-300' :
                      'text-stone-400 border-stone-200'
                    }`}>{item.review_status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditItem(item)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      {editItem && (
        <EditItemDialog
          item={editItem}
          catalog={catalog}
          onSave={async (updates) => {
            await updateItem(editItem.id, updates);
            setEditItem(null);
          }}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

function EditItemDialog({
  item,
  catalog,
  onSave,
  onClose,
}: {
  item: LineItem;
  catalog: CatalogEntry[];
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [desc, setDesc] = useState(item.description);
  const [qty, setQty] = useState(String(item.quantity ?? ''));
  const [price, setPrice] = useState(String(item.unit_price ?? ''));
  const [basis, setBasis] = useState(item.price_basis || 'unknown');
  const [spu, setSpu] = useState(String(item.stems_per_unit ?? ''));
  const [flowerId, setFlowerId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updates: Record<string, unknown> = {};
    if (desc !== item.description) updates.description = desc;
    if (qty !== String(item.quantity ?? '')) updates.quantity = parseFloat(qty) || null;
    if (price !== String(item.unit_price ?? '')) updates.unit_price = parseFloat(price) || null;
    if (basis !== (item.price_basis || 'unknown')) updates.price_basis = basis;
    if (spu !== String(item.stems_per_unit ?? '')) updates.stems_per_unit = parseFloat(spu) || null;
    if (flowerId) updates.flower_id = parseInt(flowerId);

    if (Object.keys(updates).length > 0) {
      await onSave(updates);
    } else {
      onClose();
    }
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Line Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-stone-500 uppercase block mb-1">Description</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-500 uppercase block mb-1">Quantity</label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 uppercase block mb-1">Unit Price</label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-500 uppercase block mb-1">Price Basis</label>
              <Select value={basis} onValueChange={(v) => setBasis(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_stem">Per Stem</SelectItem>
                  <SelectItem value="per_bunch">Per Bunch</SelectItem>
                  <SelectItem value="per_unit">Per Unit</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-stone-500 uppercase block mb-1">Stems per Bunch</label>
              <Input type="number" value={spu} onChange={(e) => setSpu(e.target.value)} placeholder="e.g. 25" />
            </div>
          </div>

          <div>
            <label className="text-xs text-stone-500 uppercase block mb-1">Map to Catalog Entry</label>
            <Select value={flowerId} onValueChange={(v) => setFlowerId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select product type..." /></SelectTrigger>
              <SelectContent>
                {catalog.filter(c => c.category === 'flower').map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.canonical_name}</SelectItem>
                ))}
                <SelectItem value="separator" disabled>---</SelectItem>
                {catalog.filter(c => c.category === 'foliage').map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.canonical_name} (foliage)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
