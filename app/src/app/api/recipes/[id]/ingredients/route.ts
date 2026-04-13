import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

// Update an ingredient's catalog mapping or details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const sql = getDb();
    const recipeId = Number(id);

    const ingredientId = Number(body.ingredient_id);

    if (body.flower_id !== undefined) {
      const flowerId = body.flower_id ? Number(body.flower_id) : null;
      await sql`UPDATE recipe_ingredients SET flower_id = ${flowerId}, match_status = 'human_confirmed', match_confidence = 1.0 WHERE id = ${ingredientId} AND recipe_id = ${recipeId}`;
    }
    if (body.ingredient_name !== undefined) {
      await sql`UPDATE recipe_ingredients SET ingredient_name = ${body.ingredient_name} WHERE id = ${ingredientId} AND recipe_id = ${recipeId}`;
    }
    if (body.quantity !== undefined) {
      await sql`UPDATE recipe_ingredients SET quantity = ${Number(body.quantity)} WHERE id = ${ingredientId} AND recipe_id = ${recipeId}`;
    }
    if (body.is_foliage !== undefined) {
      await sql`UPDATE recipe_ingredients SET is_foliage = ${body.is_foliage ? 1 : 0} WHERE id = ${ingredientId} AND recipe_id = ${recipeId}`;
    }

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

// Add a new ingredient to a recipe
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const sql = getDb();
    const recipeId = Number(id);

    const flowerId = body.flower_id ? Number(body.flower_id) : null;

    await sql`
      INSERT INTO recipe_ingredients (recipe_id, ingredient_name, flower_id, quantity, unit, is_foliage, match_status, match_confidence)
      VALUES (${recipeId}, ${body.ingredient_name}, ${flowerId}, ${body.quantity || null}, ${body.unit || 'stem'}, ${body.is_foliage ? 1 : 0}, ${flowerId ? 'human_confirmed' : 'pending'}, ${flowerId ? 1.0 : null})
    `;

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

// Delete an ingredient from a recipe
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const sql = getDb();

    await sql`DELETE FROM recipe_ingredients WHERE id = ${Number(body.ingredient_id)} AND recipe_id = ${Number(id)}`;

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
