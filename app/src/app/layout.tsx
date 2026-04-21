import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Petal & Profit",
  description: "Know what every arrangement actually makes you",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <nav className="border-b bg-white px-6 py-3 flex items-center gap-6">
          <a href="/" className="text-lg font-semibold text-stone-900">Petal <span className="text-emerald-700">&amp;</span> Profit</a>
          <a href="/receipts" className="text-sm text-stone-500 hover:text-stone-900">Receipts</a>
          <a href="/recipes" className="text-sm text-stone-500 hover:text-stone-900">Recipes</a>
          <a href="/catalog" className="text-sm text-stone-500 hover:text-stone-900">Catalog</a>
          <a href="/matching" className="text-sm text-stone-500 hover:text-stone-900">Matching</a>
          <a href="/matching/recipes" className="text-sm text-stone-500 hover:text-stone-900">Recipe Review</a>
          <a href="/profitability" className="text-sm text-stone-500 hover:text-stone-900">Profitability</a>
          <a href="/sales" className="text-sm text-stone-500 hover:text-stone-900">Sales</a>
          <a href="/vendors" className="text-sm text-stone-500 hover:text-stone-900">Vendors</a>
          <a href="/what-if" className="text-sm text-stone-500 hover:text-stone-900">What-If</a>
          <a href="/analysis" className="text-sm text-stone-500 hover:text-stone-900">Analysis</a>
          <a href="/savings" className="text-sm text-stone-500 hover:text-stone-900">P&P Savings</a>
          <a href="/help" className="text-sm text-stone-400 hover:text-stone-900 ml-auto">Help</a>
        </nav>
        <main className="bg-stone-50 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
