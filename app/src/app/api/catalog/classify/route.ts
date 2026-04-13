import { classifyUnmatchedItems } from '@/lib/matching/claude-classifier';

export async function POST() {
  try {
    const result = await classifyUnmatchedItems();
    return Response.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
