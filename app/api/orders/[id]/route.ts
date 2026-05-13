import { NextRequest, NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/require-api-session";

const DB_QUERY_TIMEOUT_MS = 10000;

function withDbTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`DB_TIMEOUT:${label}`)), DB_QUERY_TIMEOUT_MS)
    ),
  ]);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      order_status?: string;
      status?: string;
      total_price?: number | null;
      item_code?: string | null;
    };
    const rawStatus = body.order_status ?? body.status;
    const hasStatus = typeof rawStatus === "string" && rawStatus.length > 0;
    const hasPrice = Object.prototype.hasOwnProperty.call(body, "total_price");
    const hasItemCode = Object.prototype.hasOwnProperty.call(body, "item_code");

    if (!hasStatus && !hasPrice && !hasItemCode) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }
    if (hasStatus && !Object.values(OrderStatus).includes(rawStatus as OrderStatus)) {
      return NextResponse.json({ error: "Invalid order_status" }, { status: 400 });
    }
    if (hasPrice && body.total_price != null && (!Number.isFinite(body.total_price) || body.total_price < 0)) {
      return NextResponse.json({ error: "Invalid total_price" }, { status: 400 });
    }
    if (hasItemCode && body.item_code != null && typeof body.item_code !== "string") {
      return NextResponse.json({ error: "Invalid item_code" }, { status: 400 });
    }

    const nextStatus = hasStatus ? (rawStatus as OrderStatus) : null;

    /**
     * Confirmed = وضع «تم التجهيز» بعد الطباعة/التجهيز (لا يُقبل الاسم العربي «جاري التجهيز» هنا — فقط قيم الـ enum).
     * يجب أن يكون للطلب سعر > 0 وكود قطعة غير فارغ بعد دمج الحقول المرسلة مع المخزن.
     */
    if (nextStatus === OrderStatus.Confirmed) {
      const existing = await withDbTimeout(
        prisma.order.findUnique({
          where: { id },
          select: { total_price: true, item_code: true },
        }),
        "orders.patch.preflight"
      );
      if (!existing) {
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
      }

      const mergedPrice = hasPrice
        ? body.total_price == null
          ? null
          : Math.round(body.total_price as number)
        : existing.total_price == null
          ? null
          : Number(existing.total_price);

      let mergedItemCode: string | null;
      if (hasItemCode) {
        const rawIc = body.item_code;
        if (rawIc == null) mergedItemCode = null;
        else {
          const t = typeof rawIc === "string" ? rawIc.trim() : "";
          mergedItemCode = t === "" ? null : t.slice(0, 200);
        }
      } else {
        const ic = existing.item_code;
        mergedItemCode = ic == null || ic.trim() === "" ? null : ic.trim();
      }

      if (mergedPrice == null || !Number.isFinite(mergedPrice) || mergedPrice <= 0) {
        return NextResponse.json({ error: "Bad Request" }, { status: 400 });
      }
      if (!mergedItemCode?.trim()) {
        return NextResponse.json({ error: "Bad Request" }, { status: 400 });
      }
    }

    const data: {
      order_status?: OrderStatus;
      total_price?: number | null;
      item_code?: string | null;
      updated_at: Date;
    } = {
      updated_at: new Date(),
    };
    if (hasStatus) data.order_status = rawStatus as OrderStatus;
    if (hasPrice) data.total_price = body.total_price == null ? null : Math.round(body.total_price);
    if (hasItemCode) {
      const raw = body.item_code;
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      data.item_code = trimmed === "" ? null : trimmed.slice(0, 200);
    }

    const order = await withDbTimeout(prisma.order.update({
      where: { id },
      data,
    }), "orders.patch");

    return NextResponse.json({
      success: true,
      order: {
        ...order,
        total_price: order.total_price == null ? null : Number(order.total_price),
        delivery_fee: order.delivery_fee == null ? null : Number(order.delivery_fee),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("DB_TIMEOUT:")) {
      console.error("[orders PATCH] DB timeout:", error);
      return NextResponse.json(
        { error: "Service Unavailable", code: "DB_TIMEOUT" },
        { status: 503 }
      );
    }
    console.error("[orders PATCH] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
