import { getDb } from '@/lib/db';

export async function GET() {
  const sql = await getDb();

  const rows = await sql`
    SELECT
      ri.id,
      ri.recipe_id,
      ri.ingredient_name,
      ri.match_status,
      ri.match_confidence,
      ri.flower_id AS suggested_flower_id,
      fc.canonical_name AS suggested_canonical,
      fc.category AS suggested_category,
      r.name AS recipe_name,
      rc.name AS category_name,
      rc.source_file AS source_file,
      (SELECT STRING_AGG(DISTINCT ri2.ingredient_name, ', ')
         FROM recipe_ingredients ri2
         WHERE ri2.recipe_id = ri.recipe_id
           AND ri2.id <> ri.id
           AND ri2.flower_id IS NOT NULL
           AND ri2.match_status IN ('auto_matched', 'fuzzy_matched', 'claude_matched', 'confirmed')
      ) AS siblings
    FROM recipe_ingredients ri
    LEFT JOIN flower_catalog fc ON fc.id = ri.flower_id
    JOIN recipes r ON r.id = ri.recipe_id
    LEFT JOIN recipe_categories rc ON rc.id = r.category_id
    WHERE (ri.flower_id IS NULL AND COALESCE(ri.match_status, 'pending') NOT IN ('non_ingredient', 'rejected'))
       OR ri.match_status IN ('fuzzy_suggested', 'claude_suggested')
    ORDER BY
      CASE ri.match_status
        WHEN 'claude_suggested' THEN 1
        WHEN 'fuzzy_suggested'  THEN 2
        ELSE 3
      END,
      ri.match_confidence DESC NULLS LAST,
      ri.recipe_id, ri.id
  `;

  const catalog = await sql`
    SELECT id, canonical_name, category, base_type
    FROM flower_catalog
    ORDER BY canonical_name
  `;

  return Response.json({ suggestions: rows, catalog });
}

export async function POST(request: Request) {
  const sql = await getDb();
  const body = await request.json();
  const id = Number(body.ingredient_id);
  if (!id) return Response.json({ error: 'ingredient_id required' }, { status: 400 });

  switch (body.action) {
    case 'confirm': {
      const flowerId = Number(body.flower_id);
      await sql`
        UPDATE recipe_ingredients
          SET flower_id = ${flowerId},
              match_status = 'confirmed',
              match_confidence = 1.0
        WHERE id = ${id}
      `;
      return Response.json({ success: true });
    }
    case 'set': {
      const flowerId = Number(body.flower_id);
      await sql`
        UPDATE recipe_ingredients
          SET flower_id = ${flowerId},
              match_status = 'confirmed',
              match_confidence = 1.0
        WHERE id = ${id}
      `;
      return Response.json({ success: true });
    }
    case 'reject': {
      await sql`
        UPDATE recipe_ingredients
          SET flower_id = NULL,
              match_status = 'rejected',
              match_confidence = NULL
        WHERE id = ${id}
      `;
      return Response.json({ success: true });
    }
    case 'mark_non_ingredient': {
      await sql`
        UPDATE recipe_ingredients
          SET flower_id = NULL,
              match_status = 'non_ingredient',
              match_confidence = NULL
        WHERE id = ${id}
      `;
      return Response.json({ success: true });
    }
    default:
      return Response.json({ error: 'unknown action' }, { status: 400 });
  }
}
