import { getDb } from '@/lib/db';
import { generateMatchSuggestions, confirmMatch } from '@/lib/matching/fuzzy-matcher';

export async function GET() {
  try {
    const suggestions = await generateMatchSuggestions();
    return Response.json(suggestions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === 'confirm') {
      const sql = await getDb();
      const [receipt] = await sql`
        SELECT r.vendor_id FROM line_items li
        JOIN receipts r ON li.receipt_id = r.id
        WHERE li.id = ${Number(body.line_item_id)}
      `;
      await confirmMatch(body.line_item_id, body.flower_id, receipt?.vendor_id || null);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
