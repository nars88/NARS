import { NextRequest, NextResponse } from "next/server";
import { OrderStatus, Prisma } from "@prisma/client";
import { baghdadAddLocalDays, baghdadStartOfDayContaining } from "@/lib/baghdad-calendar";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/require-api-session";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DB_QUERY_TIMEOUT_MS = 10000;

function withDbTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`DB_TIMEOUT:${label}`)), DB_QUERY_TIMEOUT_MS)
    ),
  ]);
}

function buildWhere(query: string | undefined, status: string | null, activeOnly: boolean) {
  const where: Prisma.OrderWhereInput = {};
  if (query) {
    where.OR = [
      { customer_name: { contains: query, mode: "insensitive" } },
      { phone_number: { contains: query, mode: "insensitive" } },
      { item_code: { contains: query, mode: "insensitive" } },
      { full_address: { contains: query, mode: "insensitive" } },
    ];
  }
  if (activeOnly) {
    where.order_status = { in: [OrderStatus.Pending, OrderStatus.Confirmed, OrderStatus.Shipped] };
  } else if (status && Object.values(OrderStatus).includes(status as OrderStatus)) {
    where.order_status = status as OrderStatus;
  }
  return where;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();
    const status = searchParams.get("status");
    const activeOnly =
      searchParams.get("active_only") === "1" ||
      searchParams.get("active_only") === "true";
    const limitParam = searchParams.get("limit");
    const pageParam = searchParams.get("page");
    const limitRaw = Number(limitParam);
    const limit =
      limitParam == null || limitParam.trim() === ""
        ? DEFAULT_LIMIT
        : Number.isFinite(limitRaw)
          ? Math.max(1, Math.min(limitRaw, MAX_LIMIT))
          : DEFAULT_LIMIT;
    const pageRaw = Number(pageParam ?? 1);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;

    const where = buildWhere(query, status, activeOnly);

    const now = new Date();
    const startTodayBaghdad = baghdadStartOfDayContaining(now);
    const startTomorrowBaghdad = baghdadAddLocalDays(startTodayBaghdad, 1);
    const startYesterdayBaghdad = baghdadAddLocalDays(startTodayBaghdad, -1);

    let filteredTotal: number;
    let orders: Array<{
      id: string;
      customer_name: string;
      phone_number: string;
      item_code: string | null;
      province: string;
      full_address: string | null;
      product_details: unknown;
      total_price: Prisma.Decimal | null;
      delivery_fee: Prisma.Decimal | null;
      order_status: string;
      created_at: Date;
    }>;
    let counts: Array<{ order_status: OrderStatus; _count: { _all: number } }>;
    let todayTotals: { _sum: { total_price: Prisma.Decimal | null } };
    let yesterdayTotals: { _sum: { total_price: Prisma.Decimal | null } };
    let todayReady: number;
    let yesterdayCount: number;
    let todayCount: number;
    let todayPipelineCount: number;

    [filteredTotal, orders, counts, todayTotals, yesterdayTotals, todayReady, yesterdayCount, todayCount, todayPipelineCount] =
      await withDbTimeout(Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            customer_name: true,
            phone_number: true,
            item_code: true,
            province: true,
            full_address: true,
            product_details: true,
            total_price: true,
            delivery_fee: true,
            order_status: true,
            created_at: true,
          },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.order.groupBy({
          by: ["order_status"],
          _count: { _all: true },
        }),
        prisma.order.aggregate({
          where: {
            created_at: {
              gte: startTodayBaghdad,
              lt: startTomorrowBaghdad,
            },
          },
          _sum: { total_price: true },
        }),
        prisma.order.aggregate({
          where: {
            created_at: {
              gte: startYesterdayBaghdad,
              lt: startTodayBaghdad,
            },
          },
          _sum: { total_price: true },
        }),
        prisma.order.count({
          where: {
            created_at: {
              gte: startTodayBaghdad,
              lt: startTomorrowBaghdad,
            },
            order_status: OrderStatus.Confirmed,
          },
        }),
        prisma.order.count({
          where: {
            created_at: {
              gte: startYesterdayBaghdad,
              lt: startTodayBaghdad,
            },
          },
        }),
        prisma.order.count({
          where: {
            created_at: {
              gte: startTodayBaghdad,
              lt: startTomorrowBaghdad,
            },
          },
        }),
        prisma.order.count({
          where: {
            created_at: {
              gte: startTodayBaghdad,
              lt: startTomorrowBaghdad,
            },
            order_status: { in: [OrderStatus.Pending, OrderStatus.Confirmed] },
          },
        }),
      ]), "orders.get");

    const stats = {
      total: orders.length,
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      canceled: 0,
    };

    for (const row of counts) {
      const count = row._count._all;
      switch (row.order_status) {
        case "Pending":
          stats.pending = count;
          break;
        case "Confirmed":
          stats.confirmed = count;
          break;
        case "Shipped":
          stats.shipped = count;
          break;
        case "Delivered":
          stats.delivered = count;
          break;
        case "Canceled":
          stats.canceled = count;
          break;
      }
    }

    const normalizedOrders = orders.map((order) => ({
      ...order,
      total_price: order.total_price == null ? null : Number(order.total_price),
      delivery_fee: order.delivery_fee == null ? null : Number(order.delivery_fee),
    }));

    stats.total = counts.reduce((acc, row) => acc + row._count._all, 0);

    const todayRevenue = Number(todayTotals._sum.total_price ?? 0);
    const yesterdayRevenue = Number(yesterdayTotals._sum.total_price ?? 0);

    const prepRatePercent =
      todayCount > 0 ? Math.round((todayPipelineCount / todayCount) * 1000) / 10 : 0;

    const todayMetrics = {
      todayOrders: todayCount,
      todayReadyOrders: todayReady,
      todayPipelineOrders: todayPipelineCount,
      yesterdayOrders: yesterdayCount,
      todayRevenue,
      prepRatePercent,
      salesRateVsYesterdayPercent:
        yesterdayRevenue > 0
          ? Math.min(200, Math.round((todayRevenue / yesterdayRevenue) * 100))
          : todayRevenue > 0
            ? 100
            : 0,
    };

    return NextResponse.json({
      success: true,
      orders: normalizedOrders,
      stats,
      todayMetrics,
      total: filteredTotal,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("DB_TIMEOUT:")) {
      console.error("[orders] DB timeout:", error);
      return NextResponse.json(
        { error: "Service Unavailable", code: "DB_TIMEOUT" },
        { status: 503 }
      );
    }
    console.error("[orders] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
