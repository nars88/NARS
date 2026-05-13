"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync, createPortal } from "react-dom";
import { Search, RefreshCw, Menu, Printer, Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardChrome, useDashboardSidebar } from "@/components/DashboardChrome";
import { isSameBaghdadCalendarDay } from "@/lib/baghdad-calendar";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  type Order,
  BRAND_NAME,
  getPrintLineItems,
  getPrimaryProductId,
  getPrimaryProductSize,
  STATUS_READY,
  STATUS_WAITING_PREP,
  STATUS_WITH_COURIER,
  STATUS_DELIVERED,
  resolveOrderStatus,
  OrderStatusBadge,
  STATUS_AI_PROCESSING,
} from "./dashboard-shared";

/** هدف يومي لعدد الطلبات — حلقة «معدل الطلبات» = (طلبات اليوم / DAILY_TARGET) × 100 */
const DAILY_TARGET = 50;
/** مقياس مرئي لمبيعات اليوم (د.ع) — حلقة التقدم فقط، يمكن تعديله لاحقًا */
const DAILY_REVENUE_RING_SCALE_IQD = 10_000_000;

/** استجابة GET /api/orders — مقاييس يوم بغداد (تُعرض في البطاقات) */
export type OrdersApiTodayMetrics = {
  todayOrders: number;
  todayReadyOrders: number;
  todayPipelineOrders?: number;
  yesterdayOrders: number;
  todayRevenue: number;
  prepRatePercent: number;
  salesRateVsYesterdayPercent: number;
};

function num(v: unknown, fallback = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/** يقبل أرقامًا كنص من JSON ولا يرفض todayOrders = 0 (عكس Number.isFinite على string). */
function parseOrdersTodayMetrics(raw: unknown): OrdersApiTodayMetrics | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!("todayOrders" in r)) return null;
  return {
    todayOrders: Math.max(0, Math.floor(num(r.todayOrders))),
    todayReadyOrders: Math.max(0, Math.floor(num(r.todayReadyOrders))),
    todayPipelineOrders:
      "todayPipelineOrders" in r ? Math.max(0, Math.floor(num(r.todayPipelineOrders))) : undefined,
    yesterdayOrders: Math.max(0, Math.floor(num(r.yesterdayOrders))),
    todayRevenue: Math.round(num(r.todayRevenue)),
    prepRatePercent: num(r.prepRatePercent),
    salesRateVsYesterdayPercent: num(r.salesRateVsYesterdayPercent),
  };
}
/** إحصائيات الشريط الأيسر — تُشتق من `orders` (نفس مصدر جدول الطلبات) */
function computeNarsStatsFromOrders(orders: Order[]) {
  const rows = orders.filter((o) => !o.id.startsWith("opt-"));
  const todayRows = rows.filter((o) => isSameBaghdadCalendarDay(o.created_at));
  const totalToday = todayRows.length;
  /** «جاري التجهيز» في الواجهة ≈ Pending؛ «تم التجهيز» = Confirmed (انظر ORDER_STATUS_LABEL_AR) */
  const prepPipelineCount = todayRows.filter(
    (o) =>
      o.order_status === STATUS_WAITING_PREP ||
      o.order_status === STATUS_READY ||
      o.order_status === "جاري التجهيز"
  ).length;
  const prepRatePercent =
    totalToday > 0 ? Math.round((prepPipelineCount / totalToday) * 1000) / 10 : 0;
  const todayRevenueIqd = todayRows.reduce((sum, o) => {
    const p = o.total_price;
    if (p == null || !Number.isFinite(Number(p))) return sum;
    return sum + Math.round(Number(p));
  }, 0);
  const orderCountToday = totalToday;
  const orderRateRingPercent = Math.min(100, (orderCountToday / DAILY_TARGET) * 100);
  const salesRingPercent = Math.min(100, (todayRevenueIqd / DAILY_REVENUE_RING_SCALE_IQD) * 100);
  return {
    prepRatePercent,
    prepRingPercent: Math.min(100, prepRatePercent),
    todayRevenueIqd,
    salesRingPercent,
    orderCountToday,
    orderRateRingPercent,
  };
}

const TEAL_STROKE = "#0f766e";
const GOLD_STROKE = "#d97706";
const PREP_RING_STROKE = "#7c3aed";
const ORDERS_PAGE_SIZE = 20;
const ORDERS_LIST_CACHE_MS = 30_000;

function normalizeIngestOrder(row: Record<string, unknown>): Order {
  const created = row.created_at;
  const createdAt =
    typeof created === "string"
      ? created
      : created instanceof Date
        ? created.toISOString()
        : new Date().toISOString();
  return {
    id: String(row.id),
    customer_name: String(row.customer_name ?? ""),
    phone_number: String(row.phone_number ?? ""),
    item_code: row.item_code != null && row.item_code !== "" ? String(row.item_code) : null,
    province: String(row.province ?? "Unknown"),
    full_address: row.full_address != null ? String(row.full_address) : null,
    product_details: Array.isArray(row.product_details) ? row.product_details : [],
    total_price: row.total_price == null ? null : Number(row.total_price),
    delivery_fee: row.delivery_fee == null ? null : Number(row.delivery_fee),
    order_status: String(row.order_status ?? "Pending"),
    created_at: createdAt,
  };
}

function makePlaceholderRow(tempId: string, snippet: string): Order {
  const label = snippet.trim().length > 24 ? `${snippet.trim().slice(0, 24)}…` : snippet.trim() || "…";
  return {
    id: tempId,
    customer_name: label,
    phone_number: "…",
    item_code: null,
    province: "Unknown",
    full_address: null,
    product_details: [],
    total_price: null,
    delivery_fee: null,
    order_status: STATUS_AI_PROCESSING,
    created_at: new Date().toISOString(),
  };
}

const RING_LABEL_SLATE =
  "line-clamp-2 max-w-full rounded-full border border-slate-200/90 bg-slate-100/90 px-2.5 py-1 text-center text-[12px] font-extrabold leading-tight tracking-wide text-slate-800 shadow-sm";

function ProgressRing({
  ringFillPercent,
  center,
  label,
  stroke,
  denseCenter = false,
  trackStroke = "rgba(15,23,42,0.1)",
  labelClassName,
}: {
  ringFillPercent: number;
  center: React.ReactNode;
  label: string;
  stroke: string;
  denseCenter?: boolean;
  trackStroke?: string;
  labelClassName?: string;
}) {
  const r = 33;
  const vb = 100;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, ringFillPercent));
  const offset = c - (p / 100) * c;
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-1 pt-0.5">
      <div className="relative mx-auto h-[96px] w-[96px] max-w-full shrink-0 drop-shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
        <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${vb} ${vb}`} aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke={trackStroke} strokeWidth="5.5" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="5.5"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span
          className={`absolute inset-0 flex min-w-0 items-center justify-center text-center font-black tabular-nums leading-tight text-slate-900 ${
            denseCenter ? "p-3 text-[11px] tracking-tight" : "p-4 text-[17px]"
          }`}
        >
          {center}
        </span>
      </div>
      <span className={labelClassName ?? RING_LABEL_SLATE}>{label}</span>
    </div>
  );
}

function NarsStatsColumn({
  prepRatePercent,
  prepRingPercent,
  todaySalesLabel,
  salesRingPercent,
  orderCountToday,
  orderRateRingPercent,
}: {
  prepRatePercent: number;
  prepRingPercent: number;
  todaySalesLabel: string;
  salesRingPercent: number;
  orderCountToday: number;
  orderRateRingPercent: number;
}) {
  return (
    <aside
      id="stats"
      className="nars-glass flex h-full min-h-0 w-full max-w-full flex-col gap-3 overflow-hidden rounded-[1.6rem] px-2.5 py-3 shadow-lg min-[1367px]:h-full min-[1367px]:w-[160px] min-[1367px]:max-w-[160px] min-[1367px]:shrink-0"
    >
      {/* بطاقة 1: نسبة التجهيز — من computeNarsStatsFromOrders → prepRatePercent / prepRingPercent */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border-2 border-violet-300/85 bg-gradient-to-b from-violet-100/95 via-violet-50/90 to-white p-3 shadow-md shadow-violet-400/20 ring-1 ring-violet-200/70 backdrop-blur-sm">
        <ProgressRing
          ringFillPercent={prepRingPercent}
          center={<>{prepRatePercent.toFixed(1)}%</>}
          label="نسبة التجهيز"
          stroke={PREP_RING_STROKE}
          trackStroke="rgba(124,58,237,0.22)"
          labelClassName="line-clamp-2 max-w-full rounded-full border border-violet-300/80 bg-violet-100/95 px-2.5 py-1 text-center text-[12px] font-extrabold leading-tight tracking-wide text-violet-950 shadow-sm"
        />
      </div>
      {/* بطاقة 2: مبيعات اليوم — من computeNarsStatsFromOrders → todayRevenueIqd (يُعرض كـ todaySalesLabel) */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border-2 border-teal-300/85 bg-gradient-to-b from-teal-100/95 via-teal-50/90 to-white p-3 shadow-md shadow-teal-400/18 ring-1 ring-teal-200/70 backdrop-blur-sm">
        <ProgressRing
          ringFillPercent={salesRingPercent}
          denseCenter
          center={
            <span className="line-clamp-3 max-h-full w-full min-w-0 max-w-[5.25rem] break-words text-center text-[11px] font-black leading-snug text-slate-900">
              {todaySalesLabel}
            </span>
          }
          label="مبيعات اليوم"
          stroke={TEAL_STROKE}
          trackStroke="rgba(15,118,110,0.22)"
          labelClassName="line-clamp-2 max-w-full rounded-full border border-teal-300/80 bg-teal-100/95 px-2.5 py-1 text-center text-[12px] font-extrabold leading-tight tracking-wide text-teal-950 shadow-sm"
        />
      </div>
      {/* بطاقة 3: معدل الطلبات — من computeNarsStatsFromOrders → orderCountToday و orderRateRingPercent (هدف DAILY_TARGET) */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border-2 border-amber-300/85 bg-gradient-to-b from-amber-100/95 via-amber-50/90 to-white p-3 shadow-md shadow-amber-400/22 ring-1 ring-amber-200/70 backdrop-blur-sm">
        <ProgressRing
          ringFillPercent={orderRateRingPercent}
          center={<>{orderCountToday}</>}
          label="معدل الطلبات"
          stroke={GOLD_STROKE}
          trackStroke="rgba(217,119,6,0.24)"
          labelClassName="line-clamp-2 max-w-full rounded-full border border-amber-300/80 bg-amber-100/95 px-2.5 py-1 text-center text-[12px] font-extrabold leading-tight tracking-wide text-amber-950 shadow-sm"
        />
      </div>
    </aside>
  );
}

function ordersRowDataEqual(a: Order, b: Order) {
  return (
    a.id === b.id &&
    a.customer_name === b.customer_name &&
    a.phone_number === b.phone_number &&
    a.order_status === b.order_status &&
    a.total_price === b.total_price &&
    a.province === b.province &&
    (a.item_code ?? "") === (b.item_code ?? "")
  );
}

/** قيمة كود القطعة المعروضة/القابلة للتعديل (العمود أو أول منتج في JSON). */
function effectiveItemCodeForEdit(order: Order): string {
  return (getPrimaryProductId(order) ?? "").trim();
}

function OrdersSkeletonBody() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={`sk-${i}`} className="animate-pulse">
          <td className="border border-violet-200/60 px-[6px] py-[8px]">
            <div className="h-4 rounded bg-slate-200/80" />
          </td>
          <td className="border border-violet-200/60 px-[6px] py-[8px]">
            <div className="mx-auto h-4 w-16 rounded bg-slate-200/80" />
          </td>
          <td className="border border-violet-200/60 px-[6px] py-[8px]">
            <div className="mx-auto h-4 w-10 rounded bg-slate-200/80" />
          </td>
          <td className="border border-violet-200/60 px-[6px] py-[8px]">
            <div className="h-4 rounded bg-slate-200/80" />
          </td>
          <td className="border border-violet-200/60 px-[6px] py-[8px]">
            <div className="h-4 rounded bg-slate-200/80" />
          </td>
          <td className="border border-violet-200/60 px-[6px] py-[8px]">
            <div className="mx-auto h-6 w-20 rounded bg-slate-200/80" />
          </td>
          <td className="border border-violet-200/60 px-[6px] py-[8px]">
            <div className="mx-auto flex gap-2">
              <div className="h-12 w-12 rounded-xl bg-slate-200/80" />
              <div className="h-12 w-12 rounded-xl bg-slate-200/80" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

const OrderMemoRow = React.memo(
  function OrderMemoRow({
    order,
    priceInput,
    itemCodeInput,
    rowPipeline,
    updatingOrderId,
    savingPriceOrderId,
    savingItemCodeOrderId,
    onPriceChange,
    onPriceBlur,
    onItemCodeChange,
    onItemCodeBlur,
    onTryPrintAndPrepare,
    onUpdateOrderStatus,
  }: {
    order: Order;
    priceInput: string;
    itemCodeInput: string;
    rowPipeline: boolean;
    updatingOrderId: string | null;
    savingPriceOrderId: string | null;
    savingItemCodeOrderId: string | null;
    onPriceChange: (orderId: string, value: string) => void;
    onPriceBlur: (order: Order) => void;
    onItemCodeChange: (orderId: string, value: string) => void;
    onItemCodeBlur: (order: Order) => void;
    onTryPrintAndPrepare: (order: Order) => void | Promise<void>;
    onUpdateOrderStatus: (orderId: string, status: string) => void;
  }) {
    const busy =
      rowPipeline ||
      updatingOrderId === order.id ||
      savingPriceOrderId === order.id ||
      savingItemCodeOrderId === order.id;
    return (
      <tr className="transition hover:bg-violet-100/40">
        <td className="min-w-0 border border-violet-200/60 px-[6px] py-[8px] text-right text-[13px] font-bold text-slate-950">
          <span className="line-clamp-2 min-w-0 break-words text-right" title={order.customer_name}>
            {order.customer_name}
          </span>
        </td>
        <td dir="ltr" className="min-w-0 border border-violet-200/60 px-[6px] py-[8px] text-right align-middle">
          <input
            type="text"
            maxLength={200}
            disabled={rowPipeline || savingItemCodeOrderId === order.id}
            value={itemCodeInput}
            onChange={(e) => onItemCodeChange(order.id, e.target.value)}
            onBlur={() => onItemCodeBlur(order)}
            className="w-full min-w-0 rounded-md border border-transparent bg-slate-50/70 px-1 py-0.5 text-right font-mono text-[13px] font-extrabold tracking-tight text-violet-950 outline-none transition placeholder:text-slate-400 focus:border-violet-300 disabled:opacity-60"
            placeholder="كود القطعة"
            aria-label="كود القطعة"
          />
        </td>
        <td className="whitespace-nowrap border border-violet-200/60 px-[6px] py-[8px] text-right text-[13px] font-semibold text-slate-800">
          {getPrimaryProductSize(order) ?? "—"}
        </td>
        <td className="min-w-0 whitespace-normal break-words border border-violet-200/60 px-[6px] py-[8px] text-right text-[13px] font-semibold text-slate-800">
          {order.province}
        </td>
        <td className="border border-violet-200/60 px-[6px] py-[8px] align-middle text-right">
          <div className="inline-flex w-full min-w-0 items-center gap-1 rounded-lg bg-slate-50/70 px-1 py-1">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              disabled={rowPipeline || savingPriceOrderId === order.id}
              value={priceInput}
              onChange={(e) => onPriceChange(order.id, e.target.value)}
              onBlur={() => onPriceBlur(order)}
              className="w-full min-w-0 border-0 bg-transparent px-0 py-0 text-right text-[13px] font-bold text-violet-950 outline-none transition-all duration-200 ease-out placeholder:text-slate-400 disabled:opacity-60"
              placeholder="0"
              aria-label="سعر الطلب"
            />
            <span className="shrink-0 text-xs font-bold text-slate-500">د.ع</span>
          </div>
        </td>
        <td className="min-w-0 border border-violet-200/60 px-[6px] py-[8px] align-middle text-center">
          <div className="flex w-full min-w-0 items-center justify-center overflow-hidden">
            <OrderStatusBadge status={order.order_status} variant="light" />
          </div>
        </td>
        <td className="min-w-0 border border-violet-200/60 px-[6px] py-[8px] align-middle text-center">
          <div className="flex w-full min-w-0 items-center justify-center gap-2 overflow-hidden px-0 py-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onTryPrintAndPrepare(order)}
              title="طباعة وتجهيز"
              aria-label="طباعة وتجهيز"
              className="inline-flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-xl border border-violet-300/90 bg-violet-100 text-violet-700 shadow-sm transition-all duration-200 ease-out hover:bg-violet-200 hover:shadow-md disabled:opacity-50"
            >
              <Printer size={22} strokeWidth={2.4} className="shrink-0" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onUpdateOrderStatus(order.id, "مع المندوب")}
              title="تسليم للشركة"
              aria-label="تسليم للشركة"
              className="inline-flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-xl border border-emerald-300/90 bg-emerald-100 text-emerald-700 shadow-sm transition-all duration-200 ease-out hover:bg-emerald-200 hover:shadow-md disabled:opacity-50"
            >
              <Truck size={22} strokeWidth={2.4} className="shrink-0" />
            </button>
            {order.order_status === STATUS_WITH_COURIER ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onUpdateOrderStatus(order.id, "تم التسليم")}
                title="تم التسليم"
                aria-label="تم التسليم"
                className="inline-flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-xl border border-amber-300/90 bg-amber-100 text-amber-700 shadow-sm transition-all duration-200 ease-out hover:bg-amber-200 hover:shadow-md disabled:opacity-50"
              >
                <CheckCircle2 size={22} strokeWidth={2.4} className="shrink-0" />
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    );
  },
  (prev, next) =>
    ordersRowDataEqual(prev.order, next.order) &&
    prev.priceInput === next.priceInput &&
    prev.itemCodeInput === next.itemCodeInput &&
    prev.rowPipeline === next.rowPipeline &&
    prev.updatingOrderId === next.updatingOrderId &&
    prev.savingPriceOrderId === next.savingPriceOrderId &&
    prev.savingItemCodeOrderId === next.savingItemCodeOrderId
);

const OrdersSection = React.memo(function OrdersSection({
  orders,
  loading,
  loadingMore,
  hasMore,
  tableError,
  totalCount,
  updatingOrderId,
  savingPriceOrderId,
  savingItemCodeOrderId,
  tableEndRef,
  onUpdateOrderStatus,
  onPrintAndPrepare,
  onSaveOrderPrice,
  onSaveOrderItemCode,
  onEnsureReadyForPrepare,
}: {
  orders: Order[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  tableError: string | null;
  totalCount: number;
  updatingOrderId: string | null;
  savingPriceOrderId: string | null;
  savingItemCodeOrderId: string | null;
  tableEndRef: React.RefObject<HTMLTableRowElement | null>;
  onUpdateOrderStatus: (orderId: string, status: string) => void;
  onPrintAndPrepare: (order: Order) => void;
  onSaveOrderPrice: (orderId: string, nextPrice: number | null) => void;
  onSaveOrderItemCode: (orderId: string, nextCode: string | null) => Promise<void>;
  onEnsureReadyForPrepare: (order: Order, totalPrice: number, itemCode: string) => Promise<Order>;
}) {
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [itemCodeDrafts, setItemCodeDrafts] = useState<Record<string, string>>({});

  const rowIsPipeline = useCallback(
    (order: Order) =>
      order.order_status === STATUS_AI_PROCESSING || order.id.startsWith("opt-"),
    []
  );

  const handlePriceChange = useCallback((orderId: string, value: string) => {
    setPriceDrafts((prev) => ({ ...prev, [orderId]: value }));
  }, []);

  const handlePriceBlur = useCallback(
    (order: Order) => {
      if (rowIsPipeline(order)) return;
      const raw = priceDrafts[order.id];
      if (raw == null) return;
      const trimmed = raw.trim();
      const nextPrice = trimmed === "" ? null : Number(trimmed);
      if (trimmed !== "" && !Number.isFinite(nextPrice)) {
        setPriceDrafts((prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
        return;
      }
      const normalized = nextPrice == null ? null : Math.round(nextPrice);
      const current = order.total_price == null ? null : Math.round(order.total_price);
      if (normalized === current) {
        setPriceDrafts((prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
        return;
      }
      onSaveOrderPrice(order.id, normalized);
    },
    [priceDrafts, onSaveOrderPrice, rowIsPipeline]
  );

  const handleItemCodeChange = useCallback((orderId: string, value: string) => {
    setItemCodeDrafts((prev) => ({ ...prev, [orderId]: value }));
  }, []);

  const handleItemCodeBlur = useCallback(
    (order: Order) => {
      if (rowIsPipeline(order)) return;
      const raw = itemCodeDrafts[order.id];
      if (raw == null) return;
      const trimmed = raw.trim();
      const baseline = effectiveItemCodeForEdit(order);
      if (trimmed === baseline) {
        setItemCodeDrafts((prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
        return;
      }
      void onSaveOrderItemCode(order.id, trimmed === "" ? null : trimmed)
        .then(() => {
          setItemCodeDrafts((prev) => {
            const next = { ...prev };
            delete next[order.id];
            return next;
          });
        })
        .catch(() => {
          /* الخطأ يُعرض في شريط الجدول */
        });
    },
    [itemCodeDrafts, onSaveOrderItemCode, rowIsPipeline]
  );

  const tryPrintAndPrepare = useCallback(
    async (order: Order) => {
      const raw = (priceDrafts[order.id] ?? (order.total_price == null ? "" : String(order.total_price))).trim();
      if (raw === "") {
        toast.error("يرجى تحديد السعر قبل تجهيز الطلب");
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        toast.error("يرجى تحديد السعر قبل تجهيز الطلب");
        return;
      }
      const code = (itemCodeDrafts[order.id] ?? effectiveItemCodeForEdit(order)).trim();
      if (!code) {
        toast.warning("يرجى إدخال كود القطعة قبل تجهيز الطلب");
        return;
      }
      try {
        const merged = await onEnsureReadyForPrepare(order, Math.round(n), code);
        onPrintAndPrepare(merged);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر حفظ بيانات الطلب قبل التجهيز");
      }
    },
    [priceDrafts, itemCodeDrafts, onEnsureReadyForPrepare, onPrintAndPrepare]
  );

  const showSkeleton = loading && orders.length === 0;

  return (
    <section className="nars-glass flex min-w-0 shrink-0 flex-col rounded-[2rem] shadow-lg">
      <div className="shrink-0 border-b border-violet-200/80 bg-gradient-to-l from-white to-violet-50/60 px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-extrabold tracking-tight text-slate-950 md:text-lg">جدول طلبات اليوم</h2>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
            ({totalCount})
          </span>
        </div>
      </div>

      <div className="px-2 pb-3 pt-0 md:px-3 md:pb-3">
        <div className="overflow-x-auto rounded-b-[1.25rem] border border-t-0 border-violet-200/80 bg-gradient-to-b from-white to-violet-50/25 shadow-inner [will-change:transform]">
          <table className="w-full min-w-0 table-fixed border-collapse text-right text-[13px]">
            <thead className="border-b border-violet-200/80 bg-violet-100 text-slate-950">
              <tr>
                <th className="w-[18%] min-w-0 border border-violet-200/70 px-[6px] py-[8px] text-right text-[13px] font-extrabold text-slate-900">اسم الزبون</th>
                <th className="w-[11%] whitespace-nowrap border border-violet-200/70 px-[6px] py-[8px] text-right text-[13px] font-extrabold text-slate-900">كود القطعة</th>
                <th className="w-[7%] whitespace-nowrap border border-violet-200/70 px-[6px] py-[8px] text-right text-[13px] font-extrabold text-slate-800">القياس</th>
                <th className="w-[12%] whitespace-nowrap border border-violet-200/70 px-[6px] py-[8px] text-right text-[13px] font-extrabold text-slate-900">المحافظة</th>
                <th className="w-[11%] whitespace-nowrap border border-violet-200/70 px-[6px] py-[8px] text-right text-[13px] font-extrabold text-slate-900">السعر</th>
                <th className="w-[17%] min-w-0 border border-violet-200/70 px-[6px] py-[8px] text-center text-[13px] font-extrabold text-slate-900">الحالة</th>
                <th className="w-[24%] min-w-0 border border-violet-200/70 px-[6px] py-[8px] text-center text-[13px] font-extrabold text-slate-900">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="bg-white/80 text-[13px] text-slate-900">
              {tableError ? (
                <tr>
                  <td colSpan={7} className="border border-violet-200/70 px-5 py-12 text-center text-sm font-semibold text-rose-700">
                    {tableError}
                  </td>
                </tr>
              ) : showSkeleton ? (
                <OrdersSkeletonBody />
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border border-violet-200/70 px-5 py-12 text-center text-sm font-semibold text-slate-700">
                    لا توجد طلبات نشطة
                  </td>
                </tr>
              ) : (
                <>
                  {orders.map((order) => (
                    <OrderMemoRow
                      key={order.id}
                      order={order}
                      priceInput={priceDrafts[order.id] ?? (order.total_price == null ? "" : String(order.total_price))}
                      itemCodeInput={
                        itemCodeDrafts[order.id] ?? (effectiveItemCodeForEdit(order) || "")
                      }
                      rowPipeline={rowIsPipeline(order)}
                      updatingOrderId={updatingOrderId}
                      savingPriceOrderId={savingPriceOrderId}
                      savingItemCodeOrderId={savingItemCodeOrderId}
                      onPriceChange={handlePriceChange}
                      onPriceBlur={handlePriceBlur}
                      onItemCodeChange={handleItemCodeChange}
                      onItemCodeBlur={handleItemCodeBlur}
                      onTryPrintAndPrepare={tryPrintAndPrepare}
                      onUpdateOrderStatus={onUpdateOrderStatus}
                    />
                  ))}
                  {hasMore ? (
                    <tr ref={tableEndRef} className="h-1" aria-hidden>
                      <td colSpan={7} className="h-1 border-0 p-0" />
                    </tr>
                  ) : null}
                  {loadingMore ? (
                    <tr>
                      <td colSpan={7} className="border border-violet-200/70 px-5 py-3">
                        <div className="mx-auto h-6 w-36 animate-pulse rounded-lg bg-violet-200/70" />
                      </td>
                    </tr>
                  ) : null}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
});

export default function DashboardPage() {
  return (
    <DashboardChrome>
      <DashboardView />
    </DashboardChrome>
  );
}

function DashboardView() {
  const [orders, setOrders] = useState<Order[]>([]);
  const ordersRef = useRef<Order[]>([]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const listPageRef = useRef(1);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [totalCount, setTotalCount] = useState(0);
  const [manualMessage, setManualMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [savingPriceOrderId, setSavingPriceOrderId] = useState<string | null>(null);
  const [savingItemCodeOrderId, setSavingItemCodeOrderId] = useState<string | null>(null);
  const [orderForPrint, setOrderForPrint] = useState<Order | null>(null);
  const [printHostReady, setPrintHostReady] = useState(false);
  const [todayMetrics, setTodayMetrics] = useState<OrdersApiTodayMetrics | null>(null);

  const ordersTableEndRef = useRef<HTMLTableRowElement | null>(null);
  const listCacheRef = useRef<{
    search: string;
    ts: number;
    orders: Order[];
    todayMetrics: OrdersApiTodayMetrics | null;
    total: number;
    hasMore: boolean;
  } | null>(null);
  const refetchCoalesceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toggleSidebar } = useDashboardSidebar();

  const ingestQueueRef = useRef<string[]>([]);
  const ingestDrainActiveRef = useRef(false);
  const ingestThrottleRef = useRef(0);

  const fetchOrders = useCallback(
    async (
      search = "",
      opts?: {
        silent?: boolean;
        force?: boolean;
        useShortLivedListCache?: boolean;
        page?: number;
        append?: boolean;
      }
    ) => {
      const silent = opts?.silent === true;
      const force = opts?.force === true;
      const useCache = opts?.useShortLivedListCache === true;
      const append = opts?.append === true;
      const page = opts?.page ?? 1;
      const trimmed = search.trim();

      if (
        useCache &&
        !force &&
        !append &&
        page === 1 &&
        listCacheRef.current &&
        listCacheRef.current.search === trimmed &&
        Date.now() - listCacheRef.current.ts < ORDERS_LIST_CACHE_MS
      ) {
        const c = listCacheRef.current;
        setOrders(c.orders);
        setTodayMetrics(c.todayMetrics);
        setTotalCount(c.total);
        setHasMoreOrders(c.hasMore);
        listPageRef.current = 1;
        return;
      }

      if (!silent && !append) setLoading(true);
      if (append) setLoadingMore(true);
      setTableError(null);

      try {
        const params = new URLSearchParams();
        params.set("active_only", "true");
        if (trimmed) params.set("q", trimmed);
        params.set("limit", String(ORDERS_PAGE_SIZE));
        params.set("page", String(page));

        const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
        const data = (await response.json()) as {
          orders: Order[];
          pagination?: { page: number; totalPages: number; total: number };
          total?: number;
          todayMetrics?: OrdersApiTodayMetrics;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Failed to load");

        const parsedMetrics = parseOrdersTodayMetrics(data.todayMetrics);
        const newOrders = data.orders;
        const total = data.total ?? data.pagination?.total ?? newOrders.length;
        const pag = data.pagination;
        const hasMore = pag ? page < pag.totalPages : false;

        if (append) {
          setOrders((prev) => {
            const seen = new Set(prev.map((o) => o.id));
            const merged = [...prev];
            for (const o of newOrders) {
              if (!seen.has(o.id)) {
                merged.push(o);
                seen.add(o.id);
              }
            }
            return merged;
          });
        } else {
          setOrders(newOrders);
        }

        setTodayMetrics(parsedMetrics);
        setTotalCount(total);
        setHasMoreOrders(hasMore);
        listPageRef.current = page;

        if (!append && page === 1) {
          listCacheRef.current = {
            search: trimmed,
            ts: Date.now(),
            orders: newOrders,
            todayMetrics: parsedMetrics,
            total,
            hasMore,
          };
        }
      } catch (error) {
        setTableError(error instanceof Error ? error.message : "فشل جلب الطلبات");
        if (!append) setTodayMetrics(null);
      } finally {
        if (!silent && !append) setLoading(false);
        if (append) setLoadingMore(false);
      }
    },
    []
  );

  const scheduleOrdersRefetch = useCallback(() => {
    if (refetchCoalesceRef.current) clearTimeout(refetchCoalesceRef.current);
    refetchCoalesceRef.current = setTimeout(() => {
      refetchCoalesceRef.current = null;
      void fetchOrders(debouncedQuery, { silent: true, force: true });
    }, 400);
  }, [fetchOrders, debouncedQuery]);

  const loadMoreOrders = useCallback(() => {
    if (!hasMoreOrders || loadingMore || loading) return;
    const next = listPageRef.current + 1;
    void fetchOrders(debouncedQuery, { silent: true, append: true, page: next });
  }, [hasMoreOrders, loadingMore, loading, debouncedQuery, fetchOrders]);

  useEffect(() => {
    void fetchOrders(debouncedQuery, { force: true });
  }, [debouncedQuery, fetchOrders]);

  useEffect(() => {
    return () => {
      if (refetchCoalesceRef.current) clearTimeout(refetchCoalesceRef.current);
    };
  }, []);

  useEffect(() => {
    const root = document.getElementById("dashboard-center-scroll");
    const el = ordersTableEndRef.current;
    if (!root || !el || !hasMoreOrders) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && !loading) {
          loadMoreOrders();
        }
      },
      { root, rootMargin: "120px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMoreOrders, loadingMore, loading, loadMoreOrders]);

  useEffect(() => {
    void Promise.resolve().then(() => setPrintHostReady(true));
  }, []);

  useEffect(() => {
    const clearPrint = () => setOrderForPrint(null);
    window.addEventListener("afterprint", clearPrint);
    return () => window.removeEventListener("afterprint", clearPrint);
  }, []);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("ar-IQ", {
        maximumFractionDigits: 0,
      }),
    []
  );

  const narsStats = useMemo(() => {
    if (todayMetrics != null) {
      const todayRevenueIqd = todayMetrics.todayRevenue;
      const orderCountToday = todayMetrics.todayOrders;
      const prepRatePercent = todayMetrics.prepRatePercent;
      const prepRingPercent = Math.min(100, prepRatePercent);
      const salesRingPercent = Math.min(100, (todayRevenueIqd / DAILY_REVENUE_RING_SCALE_IQD) * 100);
      const orderRateRingPercent = Math.min(100, (orderCountToday / DAILY_TARGET) * 100);
      return {
        prepRatePercent,
        prepRingPercent,
        todayRevenueIqd,
        salesRingPercent,
        orderCountToday,
        orderRateRingPercent,
      };
    }
    return computeNarsStatsFromOrders(orders);
  }, [orders, todayMetrics]);

  const todaySalesLabel = `${money.format(narsStats.todayRevenueIqd)} د.ع`;

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: string) => {
    if (orderId.startsWith("opt-")) return;
    const apiStatus = resolveOrderStatus(newStatus);
    const previous = ordersRef.current.find((o) => o.id === orderId);
    if (!previous || previous.order_status === apiStatus) return;
    if (previous.order_status === STATUS_AI_PROCESSING) return;

    flushSync(() => {
      setUpdatingOrderId(orderId);
    });
    setTableError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_status: apiStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "فشل تحديث الحالة");

      if (apiStatus === STATUS_DELIVERED) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, order_status: apiStatus } : o))
        );
      }
      listCacheRef.current = null;
      void scheduleOrdersRefetch();
    } catch (error) {
      setTableError(error instanceof Error ? error.message : "فشل تحديث الحالة");
    } finally {
      setUpdatingOrderId(null);
    }
  }, [scheduleOrdersRefetch]);

  const handleSaveOrderItemCode = useCallback(
    (orderId: string, nextCode: string | null): Promise<void> => {
      if (orderId.startsWith("opt-")) return Promise.resolve();
      const row = ordersRef.current.find((o) => o.id === orderId);
      if (!row || row.order_status === STATUS_AI_PROCESSING) return Promise.resolve();
      const normalized =
        nextCode == null || nextCode.trim() === "" ? null : nextCode.trim().slice(0, 200);
      const previousStored = row.item_code ?? null;
      setSavingItemCodeOrderId(orderId);
      setTableError(null);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, item_code: normalized } : o))
      );
      return (async () => {
        try {
          const response = await fetch(`/api/orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_code: normalized }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "فشل تحديث كود القطعة");
          const updated = data.order as Order;
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, item_code: updated.item_code ?? null } : o))
          );
          listCacheRef.current = null;
          void scheduleOrdersRefetch();
        } catch (error) {
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, item_code: previousStored } : o))
          );
          setTableError(error instanceof Error ? error.message : "فشل تحديث كود القطعة");
          throw error;
        } finally {
          setSavingItemCodeOrderId(null);
        }
      })();
    },
    [scheduleOrdersRefetch]
  );

  const ensureOrderReadyForPrepare = useCallback(
    async (order: Order, totalPrice: number, itemCode: string): Promise<Order> => {
      if (order.id.startsWith("opt-") || order.order_status === STATUS_AI_PROCESSING) {
        throw new Error("لا يمكن تجهيز هذا الطلب الآن");
      }
      const code = itemCode.trim().slice(0, 200);
      if (!code) {
        throw new Error("يرجى إدخال كود القطعة قبل تجهيز الطلب");
      }
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total_price: totalPrice, item_code: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل حفظ السعر أو كود القطعة");
      const u = data.order as { total_price?: number | null; item_code?: string | null };
      const merged: Order = {
        ...order,
        total_price: u.total_price == null ? null : Number(u.total_price),
        item_code: u.item_code ?? code,
      };
      setOrders((prev) => prev.map((o) => (o.id === order.id ? merged : o)));
      listCacheRef.current = null;
      void scheduleOrdersRefetch();
      return merged;
    },
    [scheduleOrdersRefetch]
  );

  const handlePrintAndPrepare = useCallback((order: Order) => {
    if (order.id.startsWith("opt-") || order.order_status === STATUS_AI_PROCESSING) return;
    flushSync(() => {
      setOrderForPrint(order);
    });
    window.print();
    void updateOrderStatus(order.id, "تم التجهيز");
  }, [updateOrderStatus]);

  const handleUpdateOrderStatus = useCallback(
    (orderId: string, status: string) => {
      void updateOrderStatus(orderId, status);
    },
    [updateOrderStatus]
  );

  const handleSaveOrderPrice = useCallback(
    (orderId: string, nextPrice: number | null) => {
      if (orderId.startsWith("opt-")) return;
      const row = ordersRef.current.find((o) => o.id === orderId);
      if (!row || row.order_status === STATUS_AI_PROCESSING) return;
      const previousPrice = row.total_price ?? null;
      setSavingPriceOrderId(orderId);
      setTableError(null);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, total_price: nextPrice } : o)));
      void (async () => {
        try {
          const response = await fetch(`/api/orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ total_price: nextPrice }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "فشل تحديث السعر");
          const updated = data.order as Order;
          setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, total_price: updated.total_price } : o)));
          listCacheRef.current = null;
          void scheduleOrdersRefetch();
        } catch (error) {
          setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, total_price: previousPrice } : o)));
          setTableError(error instanceof Error ? error.message : "فشل تحديث السعر");
        } finally {
          setSavingPriceOrderId(null);
        }
      })();
    },
    [scheduleOrdersRefetch]
  );

  const runOneIngest = useCallback(
    async (trimmed: string) => {
      const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const snippet = trimmed.slice(0, 80);
      setParseError(null);
      setOrders((prev) => [makePlaceholderRow(tempId, snippet), ...prev]);
      setTotalCount((c) => c + 1);
      try {
        const res = await fetch("/api/ingest-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, source: "manual" }),
        });
        const json = (await res.json()) as {
          order?: Record<string, unknown>;
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          let msg = "فشل تحليل أو حفظ الطلب";
          if (res.status === 429) msg = "طلبات كثيرة جدًا. انتظر قليلًا ثم أعد المحاولة.";
          else if (json.code === "AI_OVERLOADED" || res.status === 503)
            msg = "خدمة التحليل مشغولة. حاول لاحقًا.";
          else if (typeof json.error === "string") msg = json.error;
          throw new Error(msg);
        }
        if (!json.order) throw new Error("استجابة غير متوقعة من الخادم");
        const normalized = normalizeIngestOrder(json.order);
        setOrders((prev) => prev.map((o) => (o.id === tempId ? normalized : o)));
        listCacheRef.current = null;
        toast.success("تم إضافة الطلب بنجاح! ✅");
        setSuccessMessage("تم الحفظ");
        void scheduleOrdersRefetch();
      } catch (error) {
        setOrders((prev) => prev.filter((o) => o.id !== tempId));
        setTotalCount((c) => Math.max(0, c - 1));
        setParseError(error instanceof Error ? error.message : "حدث خطأ غير متوقع");
      }
    },
    [scheduleOrdersRefetch]
  );

  const ensureIngestDrain = useCallback(() => {
    if (ingestDrainActiveRef.current) return;
    ingestDrainActiveRef.current = true;
    setProcessing(true);
    void (async () => {
      try {
        while (ingestQueueRef.current.length > 0) {
          const msg = ingestQueueRef.current.shift()!;
          await runOneIngest(msg);
        }
      } finally {
        ingestDrainActiveRef.current = false;
        setProcessing(false);
      }
    })();
  }, [runOneIngest]);

  const submitManualMessage = useCallback(() => {
    const trimmed = manualMessage.trim();
    if (trimmed.length < 10) return;
    const now = Date.now();
    if (now - ingestThrottleRef.current < 320) return;
    ingestThrottleRef.current = now;
    setManualMessage("");
    setSuccessMessage(null);
    setParseError(null);
    ingestQueueRef.current.push(trimmed);
    ensureIngestDrain();
  }, [manualMessage, ensureIngestDrain]);

  return (
    <>
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col gap-3 overflow-hidden min-[1367px]:flex-row min-[1367px]:items-stretch min-[1367px]:gap-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden min-[1367px]:min-h-0">
        <div
          id="dashboard-center-scroll"
          className="flex h-full min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth pb-1"
        >
          <header className="nars-glass shrink-0 rounded-[1.2rem] px-3 py-2.5 shadow-md md:rounded-[1.3rem] md:px-4 md:py-3">
            <div className="flex items-center gap-3 md:gap-4">
              <button
                type="button"
                onClick={() => toggleSidebar()}
                className="inline-flex h-12 min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-200/90 bg-white text-violet-900 shadow-sm transition-all duration-200 hover:text-violet-700 hover:shadow-md min-[1367px]:hidden"
                aria-label="فتح القائمة الجانبية"
              >
                <Menu size={22} />
              </button>
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 z-10 size-5 -translate-y-1/2 text-violet-600"
                  size={20}
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void fetchOrders(query.trim(), { force: true });
                  }}
                  placeholder="بحث في الطلبات (اسم، هاتف)…"
                  className="min-h-12 w-full rounded-xl border border-violet-200/90 bg-white py-3 ps-12 pe-4 text-base font-medium text-slate-950 shadow-inner outline-none transition placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-400/35"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                onClick={() => void fetchOrders(query.trim(), { silent: true, useShortLivedListCache: true })}
                className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-600/25 transition-all duration-200 hover:bg-violet-500 hover:shadow-lg md:px-5 md:text-base"
              >
                <RefreshCw
                  size={18}
                  className={`transition-opacity duration-200 ${loading ? "animate-spin" : "opacity-95"}`}
                />
                تحديث
              </button>
            </div>
          </header>

          <section
            id="inventory"
            className="nars-glass shrink-0 rounded-[1.5rem] p-3 shadow-md md:p-3.5"
          >
            <p className="mb-2 text-sm font-bold text-slate-900">رسالة الطلب</p>
            <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
              <textarea
                rows={3}
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submitManualMessage();
                  }
                }}
                placeholder="الصق نص الطلب…"
                className="h-24 min-h-24 w-full flex-1 resize-y rounded-[1.1rem] border border-violet-200/90 bg-white p-3 text-sm font-medium leading-6 text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-violet-500 sm:min-w-0"
              />
              <button
                type="button"
                onClick={() => submitManualMessage()}
                disabled={processing || !manualMessage.trim() || manualMessage.trim().length < 10}
                className="flex min-h-12 shrink-0 items-center justify-center self-stretch rounded-[1.1rem] bg-violet-600 px-5 py-3 text-base font-bold text-white shadow-md transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[9rem]"
              >
                {processing ? "…" : "تحليل وحفظ"}
              </button>
            </div>
            {parseError ? <p className="mt-2 text-xs text-rose-600">{parseError}</p> : null}
            {successMessage ? <p className="mt-2 text-xs text-teal-700">{successMessage}</p> : null}
          </section>

          <OrdersSection
            orders={orders}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMoreOrders}
            tableError={tableError}
            totalCount={totalCount}
            updatingOrderId={updatingOrderId}
            savingPriceOrderId={savingPriceOrderId}
            savingItemCodeOrderId={savingItemCodeOrderId}
            tableEndRef={ordersTableEndRef}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onPrintAndPrepare={handlePrintAndPrepare}
            onSaveOrderPrice={handleSaveOrderPrice}
            onSaveOrderItemCode={handleSaveOrderItemCode}
            onEnsureReadyForPrepare={ensureOrderReadyForPrepare}
          />
        </div>
      </div>

      <div className="w-full shrink-0 overflow-hidden min-[1367px]:flex min-[1367px]:h-full min-[1367px]:min-h-0 min-[1367px]:w-[160px] min-[1367px]:max-w-[160px] min-[1367px]:shrink-0 min-[1367px]:flex-col min-[1367px]:overflow-hidden">
        <NarsStatsColumn
          prepRatePercent={narsStats.prepRatePercent}
          prepRingPercent={narsStats.prepRingPercent}
          todaySalesLabel={todaySalesLabel}
          salesRingPercent={narsStats.salesRingPercent}
          orderCountToday={narsStats.orderCountToday}
          orderRateRingPercent={narsStats.orderRateRingPercent}
        />
      </div>
    </div>

    {printHostReady
        ? createPortal(
            <div id="print-area" className="hidden print:block" aria-hidden={!orderForPrint}>
              {orderForPrint ? (
                <PrintDeliverySlip order={orderForPrint} formatMoney={money} />
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function PrintDeliverySlip({
  order,
  formatMoney,
}: {
  order: Order;
  formatMoney: Intl.NumberFormat;
}) {
  const items = getPrintLineItems(order);
  const dateStr = new Date(order.created_at).toLocaleString("ar-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div
      dir="rtl"
      className="print-slip box-border max-w-[80mm] bg-white px-3 py-3 text-black print:max-w-none print:px-2 print:py-2"
      style={{
        fontFamily: "var(--font-readex), 'Readex Pro', Arial, sans-serif",
      }}
    >
      <header className="mb-2 border-b-2 border-slate-800 pb-2 text-center print:mb-1 print:pb-1.5">
        <p className="text-2xl font-black tracking-[0.15em] text-slate-900 print:text-xl">{BRAND_NAME}</p>
        <h1 className="mt-1 text-base font-semibold text-slate-800 print:text-sm">وصل تسليم طلبية</h1>
        <p className="mt-1 text-[11px] text-slate-600 print:text-[10px]">رقم الطلب: {order.id.slice(0, 8)}…</p>
        <p className="text-[11px] text-slate-600 print:text-[10px]">التاريخ: {dateStr}</p>
      </header>

      <section className="mb-2 space-y-1 text-sm leading-snug print:mb-1.5 print:text-[12px]">
        <h2 className="mb-1 border-b border-slate-300 pb-0.5 text-base font-semibold text-slate-900 print:text-sm">
          بيانات الزبون
        </h2>
        <p>
          <span className="font-semibold text-slate-800">كود القطعة:</span>{" "}
          <span className="font-bold tracking-wide text-slate-900">
            {getPrimaryProductId(order) ?? "غير محدد"}
          </span>
        </p>
        <p>
          <span className="font-semibold text-slate-800">الاسم:</span>{" "}
          <span>{order.customer_name}</span>
        </p>
        <p>
          <span className="font-semibold text-slate-800">الهاتف:</span>{" "}
          <span dir="ltr" className="inline-block">
            {order.phone_number}
          </span>
        </p>
        <p>
          <span className="font-semibold text-slate-800">المحافظة:</span>{" "}
          <span>{order.province}</span>
        </p>
        <p>
          <span className="font-semibold text-slate-800">العنوان:</span>{" "}
          <span>{order.full_address?.trim() ? order.full_address : "—"}</span>
        </p>
      </section>

      <section className="mb-2 print:mb-1.5">
        <h2 className="mb-1 border-b border-slate-300 pb-0.5 text-base font-semibold text-slate-900 print:text-sm">
          المنتجات
        </h2>
        <table className="w-full border-collapse text-xs print:text-[11px]">
          <thead>
            <tr className="border-b-2 border-slate-800 bg-slate-100">
              <th className="px-1 py-0.5 text-center font-semibold print:py-0.5">كود القطعة</th>
              <th className="px-1 py-0.5 text-right font-semibold print:py-0.5">اسم الصنف</th>
              <th className="px-1 py-0.5 text-center font-semibold print:py-0.5">المقاس</th>
              <th className="px-1 py-0.5 text-center font-semibold print:py-0.5">الكمية</th>
              <th className="px-1 py-0.5 text-left font-semibold print:py-0.5">السعر</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-2 text-center text-slate-600 print:p-1.5">
                  لا توجد أصناف مسجلة
                </td>
              </tr>
            ) : (
              items.map((row, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="px-1 py-0.5 text-center font-medium print:py-0.5">{row.product_id ?? "غير محدد"}</td>
                  <td className="px-1 py-0.5 text-right print:py-0.5">{row.name}</td>
                  <td className="px-1 py-0.5 text-center print:py-0.5">{row.size ?? "—"}</td>
                  <td className="px-1 py-0.5 text-center print:py-0.5">{row.quantity}</td>
                  <td className="px-1 py-0.5 text-left print:py-0.5" dir="ltr">
                    {row.unit_price == null ? "—" : `${formatMoney.format(row.unit_price)} د.ع`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <footer className="print-slip-total mt-3 border-t-2 border-slate-800 pt-2 print:mt-2 print:pt-1.5">
        {order.delivery_fee != null && order.delivery_fee > 0 ? (
          <p className="mb-0.5 text-xs text-slate-700 print:text-[11px]">
            أجور التوصيل:{" "}
            <span dir="ltr" className="font-medium">
              {formatMoney.format(order.delivery_fee)} د.ع
            </span>
          </p>
        ) : null}
        <p className="text-lg font-bold leading-tight text-slate-900 print:text-base">
          الإجمالي:{" "}
          <span dir="ltr" className="tabular-nums">
            {order.total_price == null ? "—" : `${formatMoney.format(order.total_price)} د.ع`}
          </span>
        </p>
      </footer>
    </div>
  );
}
