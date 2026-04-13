import { getDb, runMigrations } from '@/lib/db';
import { classifyVendor, isDuplicate } from '@/lib/extractors/vendor-classifier';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    await runMigrations();
    const sql = getDb();

    const body = await request.json().catch(() => ({}));
    const gdrivePath = body.path || process.env.GDRIVE_DATA_PATH;
    if (!gdrivePath) {
      return Response.json({ error: 'GDRIVE_DATA_PATH not set' }, { status: 400 });
    }

    const receiptsDir = path.join(gdrivePath, 'receipts');
    if (!fs.existsSync(receiptsDir)) {
      return Response.json({ error: `Receipts directory not found: ${receiptsDir}` }, { status: 400 });
    }

    const files = fs.readdirSync(receiptsDir)
      .filter(f => /\.pdf$/i.test(f) && !isDuplicate(f));

    const limit = body.limit || 10;
    let imported = 0;
    const byVendor: Record<string, number> = {};
    const vendorFilter = body.vendors as string[] | undefined;

    for (const file of files) {
      if (imported >= limit && !body.all) break;

      const [existing] = await sql`SELECT id FROM receipts WHERE file_name = ${file}`;
      if (existing) continue;

      const { vendorName, extractionMethod } = classifyVendor(file);
      if (vendorFilter && !vendorFilter.includes(vendorName)) continue;

      const [vendor] = await sql`SELECT id FROM vendors WHERE name = ${vendorName}`;
      if (!vendor) continue;

      const filePath = path.join(receiptsDir, file);
      await sql`INSERT INTO receipts (vendor_id, file_path, file_name, extraction_method, extraction_status) VALUES (${vendor.id}, ${filePath}, ${file}, ${extractionMethod}, 'pending')`;

      byVendor[vendorName] = (byVendor[vendorName] || 0) + 1;
      imported++;
    }

    return Response.json({ success: true, imported, by_vendor: byVendor, total_available: files.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
