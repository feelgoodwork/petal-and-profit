'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface MatchSuggestion {
  line_item_id: number;
  line_item_description: string;
  flower_id: number;
  canonical_name: string;
  confidence: number;
}

export default function MatchingPage() {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchSuggestions() {
    setLoading(true);
    const res = await fetch('/api/matching');
    if (res.ok) setSuggestions(await res.json());
    setLoading(false);
  }

  async function confirmMatch(lineItemId: number, flowerId: number) {
    await fetch('/api/matching', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', line_item_id: lineItemId, flower_id: flowerId }),
    });
    setSuggestions(prev => prev.filter(s => s.line_item_id !== lineItemId));
  }

  async function confirmAll() {
    for (const s of suggestions.filter(s => s.confidence >= 0.7)) {
      await confirmMatch(s.line_item_id, s.flower_id);
    }
  }

  useEffect(() => { fetchSuggestions(); }, []);

  const highConfidence = suggestions.filter(s => s.confidence >= 0.7);
  const lowConfidence = suggestions.filter(s => s.confidence < 0.7);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Match Review</h1>
          <p className="text-sm text-stone-500 mt-1">
            {suggestions.length} items to review ({highConfidence.length} high confidence)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSuggestions} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          {highConfidence.length > 0 && (
            <Button onClick={confirmAll}>
              Confirm All High-Confidence ({highConfidence.length})
            </Button>
          )}
        </div>
      </div>

      {suggestions.length === 0 ? (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">No matches to review</p>
          <p className="text-sm">
            Import and extract receipts first, then build the catalog to generate match suggestions
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions
            .sort((a, b) => b.confidence - a.confidence)
            .map((s) => (
              <Card key={s.line_item_id} className={s.confidence >= 0.7 ? '' : 'border-amber-200'}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-stone-900">{s.line_item_description}</p>
                      <p className="text-xs text-stone-400">Invoice line item</p>
                    </div>
                    <span className="text-stone-300">&rarr;</span>
                    <div>
                      <p className="text-sm font-medium text-emerald-700">{s.canonical_name}</p>
                      <p className="text-xs text-stone-400">Catalog entry</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={
                        s.confidence >= 0.9 ? 'text-emerald-600 border-emerald-300' :
                        s.confidence >= 0.7 ? 'text-blue-600 border-blue-300' :
                        'text-amber-600 border-amber-300'
                      }
                    >
                      {(s.confidence * 100).toFixed(0)}%
                    </Badge>
                    <Button size="sm" onClick={() => confirmMatch(s.line_item_id, s.flower_id)}>
                      Confirm
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
