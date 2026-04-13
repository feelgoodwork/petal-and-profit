'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import type { Recipe } from '@/types';

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  async function fetchRecipes() {
    setLoading(true);
    const res = await fetch('/api/recipes');
    if (res.ok) setRecipes(await res.json());
    setLoading(false);
  }

  async function importRecipes() {
    setImporting(true);
    const res = await fetch('/api/recipes/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (data.success) fetchRecipes();
    setImporting(false);
  }

  useEffect(() => { fetchRecipes(); }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Recipes</h1>
          <p className="text-sm text-stone-500 mt-1">
            {recipes.length} arrangements imported
          </p>
        </div>
        <Button onClick={importRecipes} disabled={importing}>
          {importing ? 'Importing...' : 'Import from PDF'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-stone-400">Loading...</p>
      ) : recipes.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-lg mb-2">No recipes imported yet</p>
          <p className="text-sm">Click "Import from PDF" to load recipes from the Best Sellers PDF</p>
        </div>
      ) : (
        <div className="border rounded-lg bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Sell Price</TableHead>
                <TableHead className="text-right">Ingredients</TableHead>
                <TableHead>Container</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipes.map((recipe) => (
                <TableRow key={recipe.id}>
                  <TableCell>
                    <Link href={`/recipes/${recipe.id}`} className="text-emerald-700 hover:underline font-medium">
                      {recipe.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{recipe.category_name}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${recipe.sell_price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {recipe.ingredient_count}
                  </TableCell>
                  <TableCell className="text-stone-500 text-sm max-w-48 truncate">
                    {recipe.container || '-'}
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
