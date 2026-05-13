"use client";

import React from "react";

export interface Order {
  id: string;
  customer_name: string;
  phone_number: string;
  item_code?: string | null;
  province: string;
  full_address?: string | null;
  product_details?: unknown;
  total_price: number | null;
  delivery_fee?: number | null;
  order_status: string;
  created_at: string;
}

export interface PrintProductRow {
  product_id: string | null;
  name: string;
  size: string | null;
  quantity: number;
  unit_price: number | null;
}

/** اسم العلامة — يظهر في الوصل المطبوع والواجهة */
export const BRAND_NAME = "NARS";

export function getPrintLineItems(order: Order): PrintProductRow[] {
  const pd = order.product_details;
  if (!pd || !Array.isArray(pd)) return [];
  return pd.map((item: unknown) => {
    const r = item as Record<string, unknown>;
    const qty = typeof r.quantity === "number" && r.quantity > 0 ? Math.floor(r.quantity) : 1;
    return {
      product_id:
        typeof r.product_id === "string" && r.product_id.trim() ? r.product_id.trim() : null,
      name: typeof r.name === "string" && r.name.trim() ? r.name : "—",
      size:
        typeof r.size === "string"
          ? r.size
          : r.size === null
            ? null
            : r.size != null
              ? String(r.size)
              : null,
      quantity: qty,
      unit_price:
        typeof r.unit_price === "number" && Number.isFinite(r.unit_price) ? r.unit_price : null,
    };
  });
}

export function getPrimaryProductId(order: Order): string | null {
  if (order.item_code && order.item_code.trim()) return order.item_code.trim();
  const rows = getPrintLineItems(order);
  for (const row of rows) {
    if (row.product_id && row.product_id.trim()) return row.product_id.trim();
  }
  return null;
}

/** أول مقاس من أول سطر في تفاصيل المنتج */
export function getPrimaryProductSize(order: Order): string | null {
  const rows = getPrintLineItems(order);
  const first = rows[0];
  if (!first?.size || !String(first.size).trim()) return null;
  return String(first.size).trim();
}

/** إحصائيات الشريط — تُحسب من الطلبات النشطة محليًا */
export interface DashboardStats {
  total: number;
  newOrders: number;
  readyOrders: number;
  withCourier: number;
}

/** يربط النصوص العربية من الأزرار بقيم order_status في قاعدة البيانات (Prisma enum). */
export const STATUS_ALIAS: Record<string, string> = {
  "تم التجهيز": "Confirmed",
  "مع المندوب": "Shipped",
  "تم التسليم": "Delivered",
};

export const STATUS_WAITING_PREP = "Pending";
export const STATUS_READY = "Confirmed";
export const STATUS_WITH_COURIER = "Shipped";
export const STATUS_DELIVERED = "Delivered";

export const STATUS_AI_PROCESSING = "__AI_PROCESSING__";

export const ORDER_STATUS_LABEL_AR: Record<string, string> = {
  Pending: "بانتظار التجهيز",
  Confirmed: "تم التجهيز",
  Shipped: "مع المندوب",
  Delivered: "تم التسليم",
  Canceled: "ملغي",
  [STATUS_AI_PROCESSING]: "جاري المعالجة…",
};

export const ACTIVE_ORDER_STATUSES: readonly string[] = [
  STATUS_WAITING_PREP,
  STATUS_READY,
  STATUS_WITH_COURIER,
];

export function resolveOrderStatus(input: string): string {
  return STATUS_ALIAS[input] ?? input;
}

export function OrderStatusBadge({
  status,
  variant = "dark",
  compact = false,
}: {
  status: string;
  variant?: "dark" | "light";
  compact?: boolean;
}) {
  const label = ORDER_STATUS_LABEL_AR[status] ?? status;
  const isProcessing = status === STATUS_AI_PROCESSING;
  const pillDark =
    isProcessing
      ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/50 animate-pulse"
      : status === STATUS_WAITING_PREP
      ? "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/45"
      : status === STATUS_READY
        ? "bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/45"
        : status === STATUS_WITH_COURIER
          ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/45"
          : status === STATUS_DELIVERED
            ? "bg-teal-500/15 text-teal-100 ring-1 ring-teal-400/40"
            : status === "Canceled"
              ? "bg-rose-500/15 text-rose-100 ring-1 ring-rose-400/40"
              : "bg-slate-500/20 text-slate-200 ring-1 ring-slate-500/35";
  const pillLight =
    isProcessing
      ? "bg-violet-200/90 text-violet-950 ring-1 ring-violet-400/60 animate-pulse"
      : status === STATUS_WAITING_PREP
      ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80"
      : status === STATUS_READY
        ? "bg-violet-100 text-violet-900 ring-1 ring-violet-200/80"
        : status === STATUS_WITH_COURIER
          ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80"
          : status === STATUS_DELIVERED
            ? "bg-teal-100 text-teal-900 ring-1 ring-teal-200/80"
            : status === "Canceled"
              ? "bg-rose-100 text-rose-900 ring-1 ring-rose-200/80"
              : "bg-slate-100 text-slate-800 ring-1 ring-slate-200/80";
  const pill = variant === "light" ? pillLight : pillDark;
  const weight = variant === "light" ? "font-bold" : "font-semibold";
  const size = compact ? "px-2 py-0.5 text-[11px]" : "px-3.5 py-1.5 text-sm";
  return (
    <span
      className={`inline-flex max-w-full items-center whitespace-nowrap rounded-full ${size} ${weight} ${pill}`}
    >
      {label}
    </span>
  );
}

export function computeDashboardStats(orderList: Order[]): DashboardStats {
  const list = orderList.filter((o) => o.order_status !== STATUS_AI_PROCESSING);
  const newOrders = list.filter((o) => o.order_status === STATUS_WAITING_PREP).length;
  const readyOrders = list.filter((o) => o.order_status === STATUS_READY).length;
  const withCourier = list.filter((o) => o.order_status === STATUS_WITH_COURIER).length;
  return {
    total: list.length,
    newOrders,
    readyOrders,
    withCourier,
  };
}
