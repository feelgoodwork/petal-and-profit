'use client';

import { useState, useRef, useEffect } from 'react';

interface AnalysisResult {
  sql: string;
  explanation: string;
  summary: string;
  columns: string[];
  rows: Record<string, unknown>[];
  count: number;
}

interface QueryEntry {
  id: number;
  question: string;
  result?: AnalysisResult;
  error?: string;
  loading: boolean;
}

const EXAMPLE_QUESTIONS = [
  'Show me all aster line items from CPF',
  'What are the top 10 best-selling arrangements by quantity in 2024?',
  'Which vendor has the cheapest standard roses on average?',
  'What is the average margin across all Best Sellers recipes?',
  'Show me all sales with occasion = Sympathy sorted by total amount',
  'Which recipes are missing cost data?',
  'What flowers did we buy most from Asiri Blooms?',
  'Show monthly revenue totals for 2025',
];

export default function AnalysisPage() {
  const [queries, setQueries] = useState<QueryEntry[]>([]);
  const [input, setInput] = useState('');
  const [nextId, setNextId] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [queries]);

  async function runQuery(question: string) {
    const id = nextId;
    setNextId(n => n + 1);
    setInput('');

    const entry: QueryEntry = { id, question, loading: true };
    setQueries(prev => [...prev, entry]);

    try {
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();

      setQueries(prev => prev.map(q =>
        q.id === id
          ? { ...q, loading: false, result: res.ok ? data : undefined, error: res.ok ? undefined : data.error }
          : q
      ));
    } catch {
      setQueries(prev => prev.map(q =>
        q.id === id ? { ...q, loading: false, error: 'Network error' } : q
      ));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim()) runQuery(input.trim());
  }

  return (
    <div className="flex flex-col h-screen bg-stone-50">
      {/* Header */}
      <div className="border-b bg-white px-8 py-4">
        <h1 className="text-xl font-semibold text-stone-900">Data Analysis</h1>
        <p className="text-sm text-stone-500 mt-0.5">Ask questions about your sales, costs, recipes, or invoices in plain English.</p>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {queries.length === 0 && (
          <div className="max-w-2xl mx-auto mt-8">
            <p className="text-sm text-stone-500 mb-3">Try one of these:</p>
            <div className="grid grid-cols-2 gap-2">
              {EXAMPLE_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => runQuery(q)}
                  className="text-left text-sm px-3 py-2 bg-white border rounded-lg text-stone-600 hover:border-emerald-400 hover:text-stone-900 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {queries.map(entry => (
          <QueryCard key={entry.id} entry={entry} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t bg-white px-8 py-4">
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything about your data..."
            className="flex-1 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}

function QueryCard({ entry }: { entry: QueryEntry }) {
  const [showSql, setShowSql] = useState(false);

  return (
    <div className="max-w-5xl mx-auto w-full">
      {/* Question */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">Q</div>
        <p className="text-stone-800 font-medium pt-0.5">{entry.question}</p>
      </div>

      {/* Answer */}
      <div className="ml-10">
        {entry.loading && (
          <div className="bg-white border rounded-lg p-4 text-sm text-stone-400 animate-pulse">
            Generating query...
          </div>
        )}

        {entry.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {entry.error}
          </div>
        )}

        {entry.result && (
          <div className="bg-white border rounded-lg overflow-hidden">
            {/* Summary */}
            {entry.result.summary && (
              <div className="px-4 py-3 border-b bg-stone-50 text-sm text-stone-700">
                {entry.result.summary}
              </div>
            )}

            {/* Results table */}
            {entry.result.rows.length > 0 ? (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-white sticky top-0">
                      {entry.result.columns.map(col => (
                        <th key={col} className="text-left px-3 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider whitespace-nowrap">
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entry.result.rows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                        {entry.result!.columns.map(col => (
                          <td key={col} className="px-3 py-1.5 font-mono text-xs text-stone-700 whitespace-nowrap max-w-xs truncate">
                            {formatCell(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-stone-400">No results found.</div>
            )}

            {/* Footer */}
            <div className="px-4 py-2 border-t bg-stone-50 flex items-center justify-between">
              <span className="text-xs text-stone-400">{entry.result.count} row{entry.result.count !== 1 ? 's' : ''}</span>
              <button
                onClick={() => setShowSql(s => !s)}
                className="text-xs text-stone-400 hover:text-stone-600 font-mono"
              >
                {showSql ? 'hide SQL' : 'show SQL'}
              </button>
            </div>

            {/* SQL block */}
            {showSql && (
              <div className="border-t bg-stone-900 px-4 py-3 overflow-x-auto">
                <pre className="text-xs text-emerald-400 whitespace-pre-wrap">{entry.result.sql}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return val.toLocaleString();
    return val.toFixed(2);
  }
  return String(val);
}
