import { Client } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';

const client = new Anthropic();

const SCHEMA_CONTEXT = `
You are a data analyst for Petal & Profit, a profitability tool for Milano's UpTowne Florist.
You have access to a PostgreSQL database. Write a single SELECT query to answer the user's question.

DATABASE SCHEMA:

vendors (id, name, invoice_type, extraction_method, notes)
  Known vendors: 1=Asiri Blooms, 2=Bill Doran, 3=CPF (Cleveland Plant & Flower), 4=Dreisbach, 5=Sam's Club, 6=Budzi, 7=Claprood, 8=Virgin Direct, 9=Xerox Scan (Unknown Vendor), 10=Unknown

receipts (id, vendor_id, file_name, invoice_number, invoice_date TEXT 'YYYY-MM-DD', subtotal, tax, total, extraction_method, extraction_status)
  extraction_status values: 'extracted', 'pending', 'failed'

line_items (id, receipt_id, description, quantity, unit_type, unit_price, line_total, is_flower INTEGER 0/1, price_basis TEXT 'per_stem'|'per_bunch', stems_per_unit, cost_per_stem, review_status TEXT 'pending'|'approved'|'rejected')
  -- One row per line item on a wholesale invoice

flower_catalog (id, canonical_name, category TEXT 'flower'|'foliage')
  -- 48 canonical product types e.g. 'standard roses', 'delphinium', 'eucalyptus', 'gypsophila'

flower_aliases (id, flower_id, alias TEXT, vendor_id, confidence)
  -- Maps vendor-specific descriptions to canonical flower types

ingredient_costs (id, flower_id, vendor_id, unit_cost, cost_per TEXT 'stem'|'bunch', invoice_date TEXT 'YYYY-MM-DD', source_line_item_id)
  -- Per-unit cost records derived from approved invoice line items

recipe_categories (id, name)
  Known categories: Best Sellers, Custom Orders, Holidays, Love & Romance, Luxury, Modern_Tropical Designs, Occasions, Patriotic Flowers, Plants, Prom Flowers, Seasonal, Sympathy Flowers

recipes (id, category_id, name, sell_price, container)
  -- 657 floral arrangement recipes with sell prices

recipe_ingredients (id, recipe_id, ingredient_name, flower_id, quantity, unit, is_foliage INTEGER 0/1, match_status TEXT 'auto_matched'|'pending'|'confirmed')
  -- Stem/foliage counts per recipe

profitability_snapshots (id, recipe_id, sell_price, total_flower_cost, gross_margin, margin_pct, missing_ingredients, computed_at)
  -- Computed profitability per recipe. margin_pct = (gross_margin / sell_price) * 100

sales (id, order_date TEXT 'YYYY-MM-DD', order_number TEXT, item_code TEXT, description TEXT, quantity REAL, amount REAL, total_amount REAL, occasion TEXT, order_type TEXT, recipe_id INTEGER, source_file TEXT)
  -- 75,571 sales line items 2021–2026. source_file examples: 'Copy of Sales - 2021.xlsx' through '2026.xlsx'
  -- occasion examples: 'Birthday', 'Sympathy', 'Wedding', 'Anniversary', 'Get Well', 'New Baby', 'Prom'
  -- recipe_id is NULL for items that didn't match a recipe (tips, balloons, generic designer choice)

usda_benchmarks (id, report_date TEXT, commodity TEXT, catalog_type TEXT, unit_of_sale TEXT, origin TEXT, variety TEXT, low_price REAL, high_price REAL, mostly_price REAL, market_condition TEXT)
  -- USDA wholesale market benchmarks (Boston Terminal Dec 2023, Miami Shipping Point May 2024)

fiftyflowers_benchmarks (id, handle TEXT, title TEXT, catalog_type TEXT, price_per_stem REAL, bunch_price REAL, stems_per_bunch INTEGER, colors TEXT, seasons TEXT)
  -- FiftyFlowers.com retail/event pricing. catalog_type matches flower_catalog.canonical_name.
  -- price_per_stem is retail ceiling; foliage prices are per bunch not per stem.

RULES:
1. Return ONLY a JSON object with keys "sql" and "explanation".
2. sql must be a valid PostgreSQL SELECT statement only. No INSERT/UPDATE/DELETE/DROP.
3. Always LIMIT results to 200 rows unless the user asks for aggregates.
4. Use ILIKE for case-insensitive text matching.
5. Dates are stored as TEXT in 'YYYY-MM-DD' format — use string comparison or CAST to DATE.
6. For vendor name lookups, JOIN vendors and use ILIKE on vendors.name.
7. explanation: one sentence describing what the query will return, in plain English.

Example response format:
{"sql": "SELECT ...", "explanation": "..."}
`.trim();

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();
    if (!question?.trim()) {
      return Response.json({ error: 'Question is required' }, { status: 400 });
    }

    // Step 1: Generate SQL
    const sqlResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `${SCHEMA_CONTEXT}\n\nQuestion: ${question}`,
      }],
    });

    const rawText = (sqlResponse.content[0] as { text: string }).text.trim();

    // Extract JSON from response (may have markdown fences)
    let parsed: { sql: string; explanation: string };
    try {
      const jsonStr = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try to extract SQL directly if JSON parse fails
      const sqlMatch = rawText.match(/```sql\s*([\s\S]+?)\s*```/i) || rawText.match(/SELECT[\s\S]+?;/i);
      if (!sqlMatch) {
        return Response.json({ error: 'Could not generate a SQL query for that question. Try rephrasing.' }, { status: 422 });
      }
      parsed = { sql: sqlMatch[1] || sqlMatch[0], explanation: 'Query generated' };
    }

    const { sql: generatedSql, explanation } = parsed;

    // Step 2: Safety check — SELECT only
    const trimmed = generatedSql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return Response.json({ error: 'Only SELECT queries are allowed.' }, { status: 403 });
    }

    // Step 3: Run query via pg (supports arbitrary SQL strings)
    const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
    let rows: Record<string, unknown>[];
    try {
      await pgClient.connect();
      const result = await pgClient.query(generatedSql);
      rows = result.rows;
    } catch (queryError) {
      const msg = queryError instanceof Error ? queryError.message : 'Query failed';
      await pgClient.end().catch(() => {});
      return Response.json({ error: `Query error: ${msg}`, sql: generatedSql }, { status: 400 });
    } finally {
      await pgClient.end().catch(() => {});
    }

    // Step 4: Plain-English summary of results
    let summary = explanation;
    if (rows.length > 0) {
      const sampleRows = rows.slice(0, 20);
      const summaryResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `The user asked: "${question}"\n\nThe query returned ${rows.length} rows. Here are the first ${sampleRows.length}:\n${JSON.stringify(sampleRows, null, 2)}\n\nWrite a concise 1–3 sentence plain-English summary of what this data shows. Be specific — include numbers, names, and dollar amounts from the data. No preamble.`,
        }],
      });
      summary = (summaryResponse.content[0] as { text: string }).text.trim();
    }

    // Derive column metadata
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return Response.json({
      sql: generatedSql,
      explanation,
      summary,
      columns,
      rows,
      count: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
