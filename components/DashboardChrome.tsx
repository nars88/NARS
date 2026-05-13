"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Archive,
  FileSpreadsheet,
  X,
  Loader2,
} from "lucide-react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { getPrimaryProductId, getPrimaryProductSize, type Order } from "@/app/dashboard/dashboard-shared";

type SidebarCtx = { toggleSidebar: () => void; setSidebarOpen: (open: boolean) => void };

const SidebarToggleContext = createContext<SidebarCtx | null>(null);

const IRAQ_GOVERNORATES = [
  "all",
  "بغداد",
  "البصرة",
  "نينوى",
  "أربيل",
  "النجف",
  "كربلاء",
  "ذي قار",
  "بابل",
  "الأنبار",
  "ميسان",
  "كركوك",
  "صلاح الدين",
  "المثنى",
  "واسط",
  "السليمانية",
  "دهوك",
  "القادسية",
  "ديالى",
] as const;

const GOVERNORATE_AR_TO_EN: Record<string, string> = {
  all: "All",
  بغداد: "Baghdad",
  البصرة: "Basra",
  نينوى: "Nineveh",
  أربيل: "Erbil",
  النجف: "Najaf",
  كربلاء: "Karbala",
  "ذي قار": "Dhi_Qar",
  بابل: "Babil",
  الأنبار: "Anbar",
  ميسان: "Maysan",
  كركوك: "Kirkuk",
  "صلاح الدين": "Saladin",
  المثنى: "Muthanna",
  واسط: "Wasit",
  السليمانية: "Sulaymaniyah",
  دهوك: "Duhok",
  القادسية: "Qadisiyyah",
  ديالى: "Diyala",
};

export function useDashboardSidebar(): SidebarCtx {
  const ctx = useContext(SidebarToggleContext);
  if (!ctx) {
    throw new Error("useDashboardSidebar must be used inside DashboardChrome");
  }
  return ctx;
}

function NavLink({
  href,
  label,
  icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`nars-nav-link group flex w-full items-center gap-2 rounded-xl py-2 px-3 text-right text-base font-semibold leading-snug transition-all duration-200 ${
        active
          ? "bg-violet-600 text-white shadow-md shadow-violet-600/25 ring-1 ring-violet-500/40 hover:-translate-y-0.5 hover:brightness-105"
          : "text-slate-900 hover:bg-violet-50/90 hover:text-violet-950 hover:shadow-sm"
      }`}
    >
      <span
        className={`nars-nav-link-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 [&>svg]:size-[18px] ${
          active ? "bg-white/20 text-white" : "bg-violet-100 text-violet-700"
        } ${active ? "group-hover:bg-white/25" : "group-hover:bg-violet-200 group-hover:text-violet-800"}`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function DashboardChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportGovernorate, setExportGovernorate] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const supabase = useMemo(() => createClient(), []);
  const reportDateLabel = useMemo(
    () => new Date().toLocaleDateString("ar-IQ", { year: "numeric", month: "2-digit", day: "2-digit" }),
    []
  );
  const reportDateFilePart = useMemo(
    () => new Date().toISOString().slice(0, 10),
    []
  );

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

  const sidebarValue = useMemo(
    () => ({ toggleSidebar, setSidebarOpen }),
    [toggleSidebar]
  );

  const isDashboard = pathname === "/dashboard";
  const isArchive =
    pathname === "/dashboard/archive" || pathname.startsWith("/dashboard/archive/");
  const isSettings = pathname === "/settings" || pathname.startsWith("/settings/");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    const detectDevice = () => {
      if (typeof window === "undefined") return;
      const w = window.innerWidth;
      const isTablet = w >= 768 && w <= 1366;
      const isDesktop = w > 1366;
      void isTablet;
      document.documentElement.setAttribute("data-nars-device", isDesktop ? "desktop" : "tablet");
      setSidebarOpen(isDesktop);
    };
    detectDevice();
    window.addEventListener("resize", detectDevice);
    return () => window.removeEventListener("resize", detectDevice);
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);

  const handleExportOrders = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportProgress(12);
    try {
      const response = await fetch("/api/orders?active_only=true", { cache: "no-store" });
      setExportProgress(45);
      const data = (await response.json()) as { orders?: Order[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "فشل جلب البيانات للتصدير");
      const orders = data.orders ?? [];
      const selectedGovernorateEn = GOVERNORATE_AR_TO_EN[exportGovernorate] ?? "All";
      const filtered =
        selectedGovernorateEn === "All"
          ? orders
          : orders.filter(
              (o) =>
                (o.province ?? "").trim().toLowerCase() === selectedGovernorateEn.trim().toLowerCase()
            );
      if (filtered.length === 0) {
        toast.error("لا توجد طلبات للتصدير حسب المحافظة المختارة.");
        return;
      }
      const rows = filtered.map((o) => ({
        "اسم الزبون": o.customer_name,
        "رقم الهاتف": String(o.phone_number ?? ""),
        "المحافظة": o.province,
        "كود القطعة": getPrimaryProductId(o) ?? "—",
        القياس: getPrimaryProductSize(o) ?? "—",
        الحالة: o.order_status,
        السعر: o.total_price ?? "",
        التاريخ: new Date(o.created_at).toLocaleString("ar-IQ"),
      }));
      const headers = ["اسم الزبون", "رقم الهاتف", "المحافظة", "كود القطعة", "القياس", "الحالة", "السعر", "التاريخ"] as const;
      const ws = XLSX.utils.json_to_sheet(rows, { header: [...headers] });
      const phoneColIndex = headers.indexOf("رقم الهاتف");
      for (let r = 0; r < rows.length; r += 1) {
        const addr = XLSX.utils.encode_cell({ c: phoneColIndex, r: r + 1 });
        const cell = ws[addr];
        if (!cell) continue;
        cell.t = "s";
        cell.v = String(rows[r]["رقم الهاتف"] ?? "");
        (cell as { z?: string }).z = "@";
      }
      const colWidths = headers.map((h) => {
        const maxCell = rows.reduce((max, row) => {
          const value = row[h] == null ? "" : String(row[h]);
          return Math.max(max, value.length);
        }, h.length);
        return { wch: Math.min(50, Math.max(12, maxCell + 2)) };
      });
      ws["!cols"] = colWidths;
      headers.forEach((_, c) => {
        const addr = XLSX.utils.encode_cell({ c, r: 0 });
        const cell = ws[addr];
        if (!cell) return;
        (cell as { s?: unknown }).s = {
          font: { bold: true, sz: 13 },
          alignment: { horizontal: "center", vertical: "center" },
        };
      });
      ws["!rows"] = [{ hpt: 24 }];
      setExportProgress(72);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Manifest");
      setExportProgress(92);
      XLSX.writeFile(
        wb,
        `NARS_Orders_${selectedGovernorateEn}_${reportDateFilePart}.xlsx`
      );
      setExportProgress(100);
      toast.success("تم تحميل ملف الإكسل بنجاح ✅");
      setExportOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل التصدير");
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }, [exportGovernorate, reportDateFilePart, exporting]);

  const sidebarInner = (
    <div className="nars-sidebar-inner flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="nars-sidebar-brand mb-3 shrink-0 border-b border-violet-200/70 pb-3">
        <p className="nars-sidebar-logo text-[1.35rem] font-black leading-none tracking-wide text-violet-950">
          NARS
        </p>
        <p className="nars-sidebar-sub mt-1 text-[11px] font-bold text-violet-800">
          لوحة الطلبات
        </p>
      </div>

      <nav className="nars-sidebar-nav flex shrink-0 flex-col gap-2">
        <NavLink
          href="/dashboard"
          label="لوحة التحكم"
          icon={<LayoutDashboard size={18} strokeWidth={2.25} />}
          active={isDashboard && !isArchive && !isSettings}
          onNavigate={() => setSidebarOpen(false)}
        />
        <NavLink
          href="/dashboard/archive"
          label="الأرشيف"
          icon={<Archive size={18} strokeWidth={2.25} />}
          active={isArchive}
          onNavigate={() => setSidebarOpen(false)}
        />
        <NavLink
          href="/settings"
          label="الإعدادات"
          icon={<Settings size={18} strokeWidth={2.25} />}
          active={isSettings}
          onNavigate={() => setSidebarOpen(false)}
        />
        <button
          type="button"
          onClick={() => {
            setExportOpen(true);
            setSidebarOpen(false);
          }}
          className="nars-nav-export group flex w-full items-center gap-2 rounded-xl py-2 px-3 text-right text-base font-semibold leading-snug text-slate-900 transition-all duration-200 hover:bg-violet-50/90 hover:text-violet-950 hover:shadow-sm"
        >
          <span className="nars-nav-link-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 transition-colors duration-200 group-hover:bg-violet-200 group-hover:text-violet-800 [&>svg]:size-[18px]">
            <FileSpreadsheet size={18} strokeWidth={2.25} />
          </span>
          <span>تصدير البيانات</span>
        </button>
      </nav>

      <div className="min-h-0 flex-1 shrink" aria-hidden />

      <div className="nars-sidebar-profile mt-2 shrink-0 rounded-[1.5rem] border border-violet-200/80 bg-gradient-to-b from-white to-violet-50/90 px-3 py-3 shadow-inner">
        <div className="nars-sidebar-profile-inner flex flex-col items-center gap-2">
          <div className="nars-sidebar-avatar flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-violet-800 text-lg font-black text-white shadow-lg ring-2 ring-white">
            {(userEmail?.[0] ?? "أ").toUpperCase()}
          </div>
          <div className="w-full text-center">
            <p className="text-sm font-bold text-slate-950">مسؤول النظام</p>
            <p className="mt-1 break-all text-xs font-semibold leading-snug text-slate-800">
              {userEmail ? (
                <>
                  <span className="mb-0.5 block text-[11px] font-bold text-slate-700">البريد الإلكتروني</span>
                  <span dir="ltr" className="inline-block max-w-full text-[11px] text-violet-950">
                    {userEmail}
                  </span>
                </>
              ) : (
                <span className="text-slate-600">…</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="nars-sidebar-logout mt-1.5 shrink-0 pt-0.5">
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[1.25rem] border border-rose-300/90 bg-white px-3 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition-all duration-200 hover:bg-rose-50 hover:shadow-md"
        >
          <LogOut size={20} />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <SidebarToggleContext.Provider value={sidebarValue}>
      <div className="flex h-screen max-h-screen min-h-0 w-full max-w-[100vw] flex-1 flex-col overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,#e9d5ff55,transparent),linear-gradient(180deg,#fdf4ff_0%,#fae8ff_100%)] print:hidden">
        <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-row gap-2 overflow-hidden px-2 py-2 md:gap-3 md:px-3 md:py-3 min-[1367px]:max-w-[min(1920px,calc(100%-1rem))] min-[1367px]:gap-4 min-[1367px]:px-4 min-[1367px]:py-3">
          <div id="tablet-layout" className="shrink-0">
            <aside
              className={`nars-glass fixed inset-y-2 right-2 z-30 flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[200px] max-w-[200px] flex-col overflow-hidden rounded-[1.6rem] p-2.5 text-slate-900 shadow-xl transition ${
                sidebarOpen ? "translate-x-0" : "translate-x-[110%]"
              }`}
            >
              {sidebarInner}
            </aside>
            {sidebarOpen ? (
              <button
                type="button"
                aria-label="إغلاق القائمة"
                className="fixed inset-0 z-20 bg-slate-900/25 backdrop-blur-[2px]"
                onClick={() => setSidebarOpen(false)}
              />
            ) : null}
          </div>

          <div id="desktop-layout" className="flex h-full min-h-0 shrink-0">
            <aside className="nars-glass z-20 flex h-full min-h-0 w-[200px] max-w-[200px] shrink-0 flex-col overflow-hidden rounded-[1.6rem] p-2.5 text-slate-900 shadow-xl">
              {sidebarInner}
            </aside>
          </div>

          <main className="mx-auto flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden px-0 md:px-0.5 min-[1367px]:max-w-none">
            {children}
          </main>
        </div>
      </div>
      {exportOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]">
          <section className="nars-glass w-full max-w-md rounded-[1.8rem] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-violet-950">تصدير البيانات</h3>
              <button
                type="button"
                aria-label="إغلاق نافذة التصدير"
                onClick={() => setExportOpen(false)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/80 text-slate-700 transition hover:bg-violet-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">اختر المحافظة</label>
              <select
                value={exportGovernorate}
                onChange={(e) => setExportGovernorate(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-violet-200/90 bg-white px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:border-violet-500"
              >
                {IRAQ_GOVERNORATES.map((g) => (
                  <option key={g} value={g}>
                    {g === "all" ? "الكل" : g}
                  </option>
                ))}
              </select>
              <p className="text-[11px] font-semibold text-slate-600">
                تاريخ التقرير: {reportDateLabel}
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={exporting}
                onClick={() => setExportOpen(false)}
                className="min-h-12 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-violet-50 disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleExportOrders()}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {exporting ? <Loader2 size={18} className="animate-spin" /> : null}
                {exporting ? "جاري تجهيز الملف..." : "تحميل ملف الإكسل"}
              </button>
            </div>
            {exporting ? (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                  <span>جاري إنشاء ملف الإكسل</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-violet-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-300 ease-out"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </SidebarToggleContext.Provider>
  );
}
