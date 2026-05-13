import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  IRAQ_ORDER_PARSER_SYSTEM_PROMPT,
  type ParsedOrderAI,
} from "@/lib/ai/system-prompt";

const ParsedOrderSchema = z.object({
  customer_name: z.string().min(1).max(200),
  phone_number: z.string().min(6).max(30),
  province: z.string().min(1).max(64),
  full_address: z.string().nullable(),
  products: z
    .array(
      z.object({
        product_id: z.string().nullable(),
        name: z.string().min(1),
        size: z.string().nullable(),
        color: z.string().nullable(),
        quantity: z.number().int().positive(),
        unit_price: z.number().nullable(),
      })
    )
    .min(1),
  total_price: z.number().nullable(),
  delivery_fee: z.number().nullable(),
  notes: z.string().nullable(),
  ai_confidence: z.number().min(0).max(100),
});

export type ParsedOrderValidated = z.infer<typeof ParsedOrderSchema>;

const VALID_PROVINCES: ParsedOrderAI["province"][] = [
  "Baghdad",
  "Basra",
  "Nineveh",
  "Erbil",
  "Sulaymaniyah",
  "Duhok",
  "Kirkuk",
  "Anbar",
  "Diyala",
  "Babil",
  "Karbala",
  "Najaf",
  "Wasit",
  "Maysan",
  "Dhi_Qar",
  "Muthanna",
  "Qadisiyyah",
  "Saladin",
  "Halabja",
  "Unknown",
];

function normalizeProvince(input: unknown): ParsedOrderAI["province"] {
  if (typeof input !== "string") return "Unknown";
  const value = input.trim() as ParsedOrderAI["province"];
  return VALID_PROVINCES.includes(value) ? value : "Unknown";
}

export function normalizeIraqiPhone(input: string) {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+964") && digits.length >= 13) {
    return `0${digits.slice(4, 14)}`;
  }
  if (digits.startsWith("964") && digits.length >= 12) {
    return `0${digits.slice(3, 13)}`;
  }
  return digits;
}

function normalizeParsedOrder(raw: ParsedOrderAI | Record<string, unknown>): ParsedOrderAI {
  const obj = raw as Record<string, unknown>;
  const products = Array.isArray(obj.products) ? obj.products : [];

  return {
    customer_name:
      typeof obj.customer_name === "string" && obj.customer_name.trim()
        ? obj.customer_name.trim()
        : "غير مذكور",
    phone_number:
      typeof obj.phone_number === "string" && obj.phone_number.trim()
        ? obj.phone_number.trim()
        : "غير متوفر",
    province: normalizeProvince(obj.province),
    full_address: typeof obj.full_address === "string" ? obj.full_address.trim() : null,
    products:
      products.length > 0
        ? products.map((p) => {
            const item = p as Record<string, unknown>;
            return {
              product_id:
                typeof item.product_id === "string" && item.product_id.trim()
                  ? item.product_id.trim()
                  : null,
              name:
                typeof item.name === "string" && item.name.trim() ? item.name.trim() : "منتج غير محدد",
              size: typeof item.size === "string" && item.size.trim() ? item.size.trim() : null,
              color: typeof item.color === "string" && item.color.trim() ? item.color.trim() : null,
              quantity:
                typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0
                  ? Math.floor(item.quantity)
                  : 1,
              unit_price:
                typeof item.unit_price === "number" && Number.isFinite(item.unit_price)
                  ? item.unit_price
                  : null,
            };
          })
        : [
            {
              product_id: null,
              name: "منتج غير محدد",
              size: null,
              color: null,
              quantity: 1,
              unit_price: null,
            },
          ],
    total_price:
      typeof obj.total_price === "number" && Number.isFinite(obj.total_price) ? obj.total_price : null,
    delivery_fee:
      typeof obj.delivery_fee === "number" && Number.isFinite(obj.delivery_fee)
        ? obj.delivery_fee
        : null,
    notes: typeof obj.notes === "string" && obj.notes.trim() ? obj.notes.trim() : null,
    ai_confidence:
      typeof obj.ai_confidence === "number" && Number.isFinite(obj.ai_confidence)
        ? Math.max(0, Math.min(100, obj.ai_confidence))
        : 70,
  };
}

/** أسرع النماذج أولاً — تقليل وقت الاستجابة */
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-pro",
] as const;

const RETRYABLE_GEMINI_PATTERNS = [
  "503",
  "429",
  "500",
  "overloaded",
  "high demand",
  "temporarily unavailable",
  "timeout",
  "deadline exceeded",
  "internal error",
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(message: string): boolean {
  const m = message.toLowerCase();
  return RETRYABLE_GEMINI_PATTERNS.some((p) => m.includes(p));
}

/** يستخرج أول كائن JSON صالح من نص قد يحتوي على noise قبل/بعد */
function extractJsonObject(text: string): string {
  const stripped = text
    .replace(/^\uFEFF/, "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

export type GeminiParseUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  model: string;
};

/**
 * يحلل رسالة طلب عراقية عبر Gemini ويعيد JSON مُتحققًا.
 * يُفترض أن يكون IRAQ_ORDER_PARSER_SYSTEM_PROMPT يفرض JSON خام فقط.
 */
export async function parseOrderMessageWithGemini(message: string): Promise<{
  data: ParsedOrderValidated;
  usage: GeminiParseUsage;
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment variables");
  }

  const prompt = `${IRAQ_ORDER_PARSER_SYSTEM_PROMPT}\n\nUser message:\n${message}`;

  const genAI = new GoogleGenAI({
    apiKey,
    apiVersion: "v1",
  });

  let lastError: string | null = null;
  let usedModel: string | null = null;
  let overloaded = false;
  let textOut = "";
  let usageMeta: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = (await genAI.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0,
            maxOutputTokens: 768,
          },
        })) as {
          text?: string;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
        };

        textOut = result.text ?? "";
        usageMeta = result.usageMetadata;
        usedModel = model;
        lastError = null;
        break;
      } catch (error) {
        const messageErr = error instanceof Error ? error.message : String(error);
        lastError = messageErr;
        if (messageErr.includes("404")) {
          break;
        }
        if (isRetryableGeminiError(messageErr)) {
          overloaded = true;
          await sleep(280 * (attempt + 1) * (attempt + 1));
          continue;
        }
        throw new Error(`Gemini API error: ${messageErr}`);
      }
    }
    if (usedModel) break;
  }

  if (!usedModel) {
    if (overloaded) {
      const err = new Error(
        "خدمة التحليل مشغولة حاليًا بسبب الضغط. حاول مرة أخرى بعد لحظات."
      );
      (err as Error & { code: string }).code = "AI_OVERLOADED";
      throw err;
    }
    throw new Error(
      `Gemini model not found for configured fallbacks (${GEMINI_MODELS.join(", ")}). Last error: ${lastError}`
    );
  }

  if (!textOut.trim()) {
    throw new Error("Empty response from Gemini model");
  }

  const cleaned = extractJsonObject(textOut);
  const parsedJson = JSON.parse(cleaned) as ParsedOrderAI | Record<string, unknown>;
  const normalized = normalizeParsedOrder(parsedJson);
  const validated = ParsedOrderSchema.parse(normalized);
  validated.phone_number = normalizeIraqiPhone(validated.phone_number);

  return {
    data: validated,
    usage: {
      input_tokens: usageMeta?.promptTokenCount ?? null,
      output_tokens: usageMeta?.candidatesTokenCount ?? null,
      model: usedModel,
    },
  };
}
