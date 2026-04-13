import { getUSDABenchmarkForType } from '@/lib/usda';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const productType = request.nextUrl.searchParams.get('type');
    if (!productType) {
      return Response.json({ error: 'type parameter required' }, { status: 400 });
    }

    const benchmark = await getUSDABenchmarkForType(productType);
    return Response.json(benchmark || { not_found: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
