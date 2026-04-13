export interface Vendor {
  id: number;
  name: string;
  invoice_type: string;
  extraction_method: string;
  notes: string | null;
  created_at: string;
}

export interface Receipt {
  id: number;
  vendor_id: number;
  file_path: string;
  file_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  extraction_method: string | null;
  extraction_status: string;
  raw_extraction: string | null;
  created_at: string;
  // joined fields
  vendor_name?: string;
}

export interface LineItem {
  id: number;
  receipt_id: number;
  line_number: number | null;
  item_code: string | null;
  description: string;
  unit_type: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  discount_pct: number | null;
  is_flower: number;
  price_basis: string | null;
  stems_per_unit: number | null;
  cost_per_stem: number | null;
  notes: string | null;
  review_status: string;
  reviewed_at: string | null;
  created_at: string;
}

export interface FlowerCatalog {
  id: number;
  canonical_name: string;
  category: string | null;
  notes: string | null;
}

export interface FlowerAlias {
  id: number;
  flower_id: number;
  alias: string;
  vendor_id: number | null;
  confidence: number;
}

export interface RecipeCategory {
  id: number;
  name: string;
  source_file: string | null;
  created_at: string;
}

export interface Recipe {
  id: number;
  category_id: number;
  name: string;
  sell_price: number;
  container: string | null;
  notes: string | null;
  created_at: string;
  // joined fields
  category_name?: string;
  ingredient_count?: number;
}

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  ingredient_name: string;
  flower_id: number | null;
  quantity: number | null;
  unit: string;
  is_foliage: number;
  match_status: string;
  match_confidence: number | null;
  created_at: string;
  // joined fields
  canonical_name?: string;
}

export interface IngredientCost {
  id: number;
  flower_id: number;
  vendor_id: number | null;
  unit_cost: number;
  cost_per: string;
  source_line_item_id: number | null;
  invoice_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface ProfitabilitySnapshot {
  id: number;
  recipe_id: number;
  sell_price: number;
  total_flower_cost: number | null;
  container_cost: number;
  labor_cost: number;
  total_cost: number | null;
  gross_margin: number | null;
  margin_pct: number | null;
  missing_ingredients: number;
  computed_at: string;
  // joined fields
  recipe_name?: string;
  category_name?: string;
}
