import { NextRequest, NextResponse } from "next/server";
import { IraqProvince } from "@prisma/client";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/require-api-session";

const IRAQI_PHONE_REGEX = /^(\+964|964|0)(77|78|79|75)\d{8}$/;

const ProductSchema = z.object({
  product_id: z.string().nullable(),
  name: z.string().min(1),
  size: z.string().nullable(),
  color: z.string().nullable(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nullable(),
});

const SaveOrderSchema = z.object({
  customer_name: z.string().min(2).max(200),
  phone_number: z.string().regex(IRAQI_PHONE_REGEX, "Invalid Iraqi phone number"),
  province: z.nativeEnum(IraqProvince).default(IraqProvince.Unknown),
  full_address: z.string().nullable(),
  products: z.array(ProductSchema).min(1),
  total_price: z.number().nullable(),
  delivery_fee: z.number().nullable(),
  notes: z.string().nullable(),
  original_raw_text: z.string().min(1),
  ai_confidence: z.number().min(0).max(100).nullable().optional(),
  ai_model: z.string().default("claude-3-5-sonnet-20241022"),
});

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

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const payload = SaveOrderSchema.parse(body);
    const itemCode = resolvePrimaryItemCode(payload.products);

    const order = await prisma.order.create({
      data: {
        customer_name: payload.customer_name,
        phone_number: normalizePhone(payload.phone_number),
        item_code: itemCode,
        province: payload.province,
        full_address: payload.full_address,
        product_details: payload.products,
        total_price: payload.total_price,
        delivery_fee: payload.delivery_fee ?? 0,
        original_raw_text: payload.original_raw_text,
        ai_confidence: payload.ai_confidence ?? null,
        ai_model: payload.ai_model,
        notes: payload.notes,
      },
    });

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error) {
    console.error("[saveorder] error:", error);
    if (error instanceof ZodError) {
      console.warn("[saveorder] Zod validation:", error.flatten());
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
