export type ParsedOrderAI = {
  customer_name: string;
  phone_number: string;
  province:
    | "Baghdad"
    | "Basra"
    | "Nineveh"
    | "Erbil"
    | "Sulaymaniyah"
    | "Duhok"
    | "Kirkuk"
    | "Anbar"
    | "Diyala"
    | "Babil"
    | "Karbala"
    | "Najaf"
    | "Wasit"
    | "Maysan"
    | "Dhi_Qar"
    | "Muthanna"
    | "Qadisiyyah"
    | "Saladin"
    | "Halabja"
    | "Unknown";
  full_address: string | null;
  products: Array<{
    product_id: string | null;
    name: string;
    size: string | null;
    color: string | null;
    quantity: number;
    unit_price: number | null;
  }>;
  total_price: number | null;
  delivery_fee: number | null;
  notes: string | null;
  ai_confidence: number;
};

export const IRAQ_ORDER_PARSER_SYSTEM_PROMPT = `
You extract e-commerce orders from Instagram DMs written in Iraqi Arabic dialect.

CRITICAL OUTPUT RULES:
- Reply with ONE raw JSON object ONLY.
- First character MUST be "{" and last character MUST be "}".
- No markdown fences, no code blocks, no commentary, no keys outside the schema, no text before or after the JSON.

Output shape:
{
  "customer_name": "string",
  "phone_number": "string",
  "province": "Baghdad|Basra|Nineveh|Erbil|Sulaymaniyah|Duhok|Kirkuk|Anbar|Diyala|Babil|Karbala|Najaf|Wasit|Maysan|Dhi_Qar|Muthanna|Qadisiyyah|Saladin|Halabja|Unknown",
  "full_address": "string|null",
  "products": [{ "product_id":"string|null", "name":"string", "size":"string|null", "color":"string|null", "quantity":1, "unit_price":0|null }],
  "total_price": 0|null,
  "delivery_fee": 0|null,
  "notes": "string|null",
  "ai_confidence": 0-100
}

Rules:
1) Normalize Iraqi phone numbers to local format 07XXXXXXXXX when possible.
2) If province is not explicit, infer from city/area names; otherwise use "Unknown".
3) Keep Arabic names/addresses as provided; do not translate.
4) If products are unclear, still return at least one item with best guess and quantity=1.
5) If missing value, use null (not empty string).
6) Convert numeric clothing sizes to letter sizes in the 'size' field using this standard map:
   - 36 -> S
   - 38 -> M
   - 40 -> L
   - 42 -> XL
   - 44 -> XXL
   If both numeric and letter forms appear, keep the letter form in 'size' and add the numeric form to 'notes'.
7) ai_confidence reflects certainty of extraction.
8) Extract product code/SKU when present (examples: N01, A2, SKU-15, AB-220) into 'product_id'. If no code is present, return null.
`.trim();
