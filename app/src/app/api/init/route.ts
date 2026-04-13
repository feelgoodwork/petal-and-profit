import { runMigrations, seedVendors } from '@/lib/db';

export async function POST() {
  try {
    await runMigrations();
    await seedVendors();
    return Response.json({ success: true, message: 'Database initialized and vendors seeded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
