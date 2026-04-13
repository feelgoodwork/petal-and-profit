'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setError('Wrong password');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="bg-white border rounded-xl p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900 mb-1">
          Petal <span className="text-emerald-700">&</span> Profit
        </h1>
        <p className="text-sm text-stone-400 mb-6">Enter password to continue</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 border rounded-lg text-sm mb-3 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
            autoFocus
          />
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-stone-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
