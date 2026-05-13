import { NextRequest, NextResponse } from "next/server";
import { IraqProvince } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseOrderMessageWithGemini } from "@/lib/ai/parse-order-with-gemini";
import { requireApiSession } from "@/lib/require-api-session";
import { llmRouteRateLimitResponse } from "@/lib/llm-route-rate-limit";

const IngestSchema = z
  .object({
    message: z.string().max(5000).optional(),
    rawText: z.string().max(5000).optional(),
    source: z.enum(["instagram", "manual"]).default("manual"),
  })
  .refine(
    (d) =>
      Boolean(
        (d.message && d.message.trim().length >= 10) ||
          (d.rawText && d.rawText.trim().length >= 10)
      ),
    { message: "Either message or rawText is required (min 10 chars)" }
  );

function normalizePhone(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+964")) return `0${digits.slice(4)}`;
  if (digits.startsWith("964")) return `0${digits.slice(3)}`;
  return digits;
}

function resolvePrimaryItemCode(products: Array<{ product_id: string | null }>): string | null {
  for (const p of products) {
    if (p.product_id && p.product_id.trim()) return p.product_id.trim();
  }
  return null;
}

function toProvinceEnum(p: string): IraqProvince {
  const values = Object.values(IraqProvince) as string[];
  const t = p.trim();
  return values.includes(t) ? (t as IraqProvince) : IraqProvince.Unknown;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const limited = llmRouteRateLimitResponse(req, "ingest-order");
  if (limited) return limited;
  try {
    const body = await req.json();
    const input = IngestSchema.safeParse(body);
    if (!input.success) {
      console.warn("[ingest-order] validation failed:", input.error.flatten());
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const raw = (input.data.message ?? input.data.rawText ?? "").trim();
    const { data: parsed, usage } = await parseOrderMessageWithGemini(raw);
    const itemCode = resolvePrimaryItemCode(parsed.products);

    const order = await prisma.order.create({
      data: {
        customer_name: parsed.customer_name,
        phone_number: normalizePhone(parsed.phone_number),
        item_code: itemCode,
        province: toProvinceEnum(parsed.province),
        full_address: parsed.full_address,
        product_details: parsed.products,
        total_price: parsed.total_price,
        delivery_fee: parsed.delivery_fee ?? 0,
        original_raw_text: raw,
        ai_confidence: parsed.ai_confidence ?? null,
        ai_model: usage.model,
        notes: parsed.notes,
      },
    });

    const normalized = {
      ...order,
      total_price: order.total_price == null ? null : Number(order.total_price),
      delivery_fee: order.delivery_fee == null ? null : Number(order.delivery_fee),
    };

    return NextResponse.json(
      { success: true, order: normalized, usage },
      { status: 201 }
    );
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "AI_OVERLOADED") {
      console.warn("[ingest-order] AI overloaded:", err.message);
      return NextResponse.json(
        { error: "Service Unavailable", code: "AI_OVERLOADED" },
        { status: 503 }
      );
    }
    console.error("[ingest-order] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
