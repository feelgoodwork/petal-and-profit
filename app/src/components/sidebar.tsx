'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '◈' },
  { href: '/receipts', label: 'Receipts', icon: '▤' },
  { href: '/recipes', label: 'Recipes', icon: '❋' },
  { href: '/catalog', label: 'Flower Catalog', icon: '⚘' },
  { href: '/matching', label: 'Match Review', icon: '⟷' },
  { href: '/profitability', label: 'Profitability', icon: '▲' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r bg-white flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b">
        <Link href="/" className="block">
          <h1 className="text-lg font-semibold tracking-tight text-stone-900">
            Petal <span className="text-emerald-700">&</span> Profit
          </h1>
          <p className="text-[10px] tracking-widest uppercase text-stone-400 mt-0.5">
            Recipe Cost Engine
          </p>
        </Link>
      </div>
      <nav className="flex-1 py-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-5 py-2 text-sm transition-colors border-l-2 ${
                isActive
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50 font-medium'
                  : 'border-transparent text-stone-500 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              <span className="text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-3 border-t text-[10px] text-stone-400">
        Uptowne Florist POC
      </div>
    </aside>
  );
}
