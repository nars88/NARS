"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, Menu, ArrowRight } from "lucide-react";
import { DashboardChrome, useDashboardSidebar } from "@/components/DashboardChrome";
import { type Order, getPrimaryProductId, OrderStatusBadge, STATUS_DELIVERED } from "../dashboard-shared";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const ARCHIVE_CACHE_MS = 30_000;

function ArchiveSkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={`ask-${i}`} className="animate-pulse">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="border border-violet-100/80 px-3 py-2.5 md:px-4 md:py-3">
              <div className="h-4 rounded bg-violet-200/60" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function ArchivePage() {
  return (
    <DashboardChrome>
      <ArchivePageInner />
    </DashboardChrome>
  );
}

function ArchivePageInner() {
  const { toggleSidebar } = useDashboardSidebar();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [error, setError] = useState<string | null>(null);
  const listCacheRef = useRef<{ q: string; orders: Order[]; ts: number } | null>(null);
  const hasFetchedOnce = useRef(false);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("ar-IQ", {
        maximumFractionDigits: 0,
      }),
    []
  );

  const fetchArchived = useCallback(
    async (search = "", opts?: { silent?: boolean; useShortLivedCache?: boolean }) => {
      const trimmed = search.trim();
      if (
        opts?.useShortLivedCache &&
        listCacheRef.current &&
        listCacheRef.current.q === trimmed &&
        Date.now() - listCacheRef.current.ts < ARCHIVE_CACHE_MS
      ) {
        setOrders(listCacheRef.current.orders);
        return;
      }

      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("status", STATUS_DELIVERED);
        params.set("limit", "100");
        if (trimmed) params.set("q", trimmed);
        const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "فشل التحميل");
        const nextOrders = data.orders as Order[];
        setOrders(nextOrders);
        listCacheRef.current = { q: trimmed, orders: nextOrders, ts: Date.now() };
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل جلب الأرشيف");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const silent = hasFetchedOnce.current;
    void fetchArchived(debouncedQuery, { silent }).finally(() => {
      hasFetchedOnce.current = true;
    });
  }, [debouncedQuery, fetchArchived]);

  const showSkeleton = loading && orders.length === 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
      <header className="nars-glass shrink-0 rounded-[2rem] p-3 shadow-md md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => toggleSidebar()}
              className="mt-0.5 rounded-2xl border border-violet-200/80 bg-white/80 p-2 text-violet-800 shadow-sm md:hidden"
              aria-label="فتح القائمة الجانبية"
            >
              <Menu size={18} />
            </button>
            <div>
              <p className="text-[10px] font-bold tracking-[0.12em] text-violet-600">NARS</p>
              <h1 className="text-base font-bold text-violet-950 md:text-lg">الأرشيف</h1>
              <Link
                href="/dashboard"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 transition hover:text-violet-800"
              >
                <ArrowRight size={14} className="rotate-180" />
                الطلبات النشطة
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchArchived(query.trim(), { silent: true, useShortLivedCache: true })}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[1.25rem] bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-violet-500 md:text-sm"
          >
            <RefreshCw size={15} className={loading && orders.length === 0 ? "animate-spin" : ""} />
            تحديث
          </button>
        </div>
      </header>

      <section className="nars-glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] shadow-lg">
        <div className="flex shrink-0 flex-col gap-3 border-b border-violet-100/90 bg-white/40 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-sm font-bold text-violet-900">تم التسليم</h2>
          <div className="relative shrink-0">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 z-10 -translate-y-1/2 text-violet-400"
              size={16}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void fetchArchived(query.trim(), { silent: true });
              }}
              placeholder="بحث…"
              className="w-full min-w-[12rem] rounded-[1.25rem] border border-violet-200/70 bg-white/80 py-2 ps-9 pe-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 md:w-64"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 md:p-4">
          <div className="overflow-x-auto rounded-[1.25rem] border border-violet-100/90 bg-white/50 shadow-inner [will-change:transform]">
            <table className="w-full min-w-[860px] border-collapse text-right text-sm">
              <thead className="bg-violet-50/95 text-violet-950">
                <tr>
                  <th className="border border-violet-100 px-3 py-2 text-xs font-bold md:px-4 md:text-sm">
                    الزبون
                  </th>
                  <th className="border border-violet-100 px-3 py-2 text-xs font-bold md:px-4 md:text-sm">
                    كود القطعة
                  </th>
                  <th className="border border-violet-100 px-3 py-2 text-xs font-bold md:px-4 md:text-sm">
                    الهاتف
                  </th>
                  <th className="border border-violet-100 px-3 py-2 text-xs font-bold md:px-4 md:text-sm">
                    المحافظة
                  </th>
                  <th className="border border-violet-100 px-3 py-2 text-xs font-bold md:px-4 md:text-sm">
                    السعر الكلي
                  </th>
                  <th className="border border-violet-100 px-3 py-2 text-xs font-bold md:px-4 md:text-sm">
                    الحالة
                  </th>
                  <th className="border border-violet-100 px-3 py-2 text-xs font-bold md:px-4 md:text-sm">
                    التاريخ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white/40 text-slate-800">
                {error ? (
                  <tr>
                    <td colSpan={7} className="border border-violet-100/80 px-4 py-8 text-center text-sm text-rose-600">
                      {error}
                    </td>
                  </tr>
                ) : showSkeleton ? (
                  <ArchiveSkeletonRows />
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-violet-100/80 px-4 py-8 text-center text-sm text-slate-500">
                      الأرشيف فارغ
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="transition hover:bg-violet-50/50">
                      <td className="border border-violet-100/80 px-3 py-2.5 text-sm font-semibold text-slate-900 md:px-4 md:py-3">
                        {order.customer_name}
                      </td>
                      <td className="border border-violet-100/80 px-3 py-2.5 text-sm font-medium text-violet-800 md:px-4 md:py-3">
                        {getPrimaryProductId(order) ?? "غير محدد"}
                      </td>
                      <td className="border border-violet-100/80 px-3 py-2.5 text-sm text-slate-700 md:px-4 md:py-3">
                        {order.phone_number}
                      </td>
                      <td className="border border-violet-100/80 px-3 py-2.5 text-sm text-slate-700 md:px-4 md:py-3">
                        {order.province}
                      </td>
                      <td className="border border-violet-100/80 px-3 py-2.5 text-sm text-slate-800 md:px-4 md:py-3">
                        {order.total_price == null ? "-" : `${money.format(order.total_price)} د.ع`}
                      </td>
                      <td className="border border-violet-100/80 px-3 py-2.5 md:px-4 md:py-3">
                        <OrderStatusBadge status={order.order_status} variant="light" />
                      </td>
                      <td className="border border-violet-100/80 px-3 py-2.5 text-xs text-slate-500 tabular-nums md:px-4 md:py-3 md:text-sm">
                        {new Date(order.created_at).toLocaleString("ar-IQ")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
