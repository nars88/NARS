"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FileText, Package, Save, Store } from "lucide-react";
import { toast } from "sonner";
import { DashboardChrome } from "@/components/DashboardChrome";
import { createClient } from "@/lib/supabase/client";

interface NarsSettings {
  brand_name: string;
  contact_phone: string;
  social_links: string;
  logo_url: string | null;
  invoice_note: string;
  baghdad_fee: number | null;
  provinces_fee: number | null;
}

const SETTINGS_SQL = `create table if not exists public.settings (
  id text primary key,
  brand_name text,
  phone text,
  social_links text,
  logo_url text,
  paper_size text,
  footer_note text,
  show_social_on_invoice boolean default true,
  shipping_baghdad numeric,
  shipping_provinces numeric,
  theme_mode text,
  accent_color text
);`;

const SETTINGS_POLICY_SQL = `alter table public.settings enable row level security;

create policy if not exists "settings_select_auth"
on public.settings
for select
to authenticated
using (true);

create policy if not exists "settings_insert_auth"
on public.settings
for insert
to authenticated
with check (true);

create policy if not exists "settings_update_auth"
on public.settings
for update
to authenticated
using (true)
with check (true);`;

const DEFAULT_SETTINGS: NarsSettings = {
  brand_name: "NARS",
  contact_phone: "",
  social_links: "",
  logo_url: null,
  invoice_note: "",
  baghdad_fee: null,
  provinces_fee: null,
};

function isMissingSettingsTableError(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string; details?: string } | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  if (e.status === 404) return true;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  return msg.includes("settings") && (msg.includes("not found") || msg.includes("does not exist"));
}

function isPermissionError(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string; details?: string } | null;
  if (!e) return false;
  if (e.code === "42501") return true;
  if (e.status === 401 || e.status === 403) return true;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  return (
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("not allowed")
  );
}

function SettingsPageInner() {
  const supabase = useMemo(() => createClient(), []);

  const [values, setValues] = useState<NarsSettings>(DEFAULT_SETTINGS);
  const [baghdadInput, setBaghdadInput] = useState("");
  const [provincesInput, setProvincesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [needsDbSetup, setNeedsDbSetup] = useState(false);
  const [needsPolicySetup, setNeedsPolicySetup] = useState(false);

  const setValue = <K extends keyof NarsSettings>(key: K, value: NarsSettings[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    try {
      for (const k of ["nars_paper_size", "paper_size", "paperSize", "nars-paper-size", "NARS_PAPER_SIZE"]) {
        window.localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const parseFeeInput = (raw: string): number | null => {
    const v = raw.trim();
    if (!v) return null;
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  };

  useEffect(() => {
    let canceled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setNeedsDbSetup(false);
      setNeedsPolicySetup(false);
      try {
        const { data, error: dbError } = await supabase
          .from("settings")
          .select("*")
          .eq("id", "nars")
          .maybeSingle();
        if (dbError) throw dbError;

        if (!data) {
          setValues(DEFAULT_SETTINGS);
          setBaghdadInput("");
          setProvincesInput("");
        } else {
          const row = data as any;
          const next: NarsSettings = {
            brand_name: row.brand_name ?? "NARS",
            contact_phone: row.phone ?? "",
            social_links: row.social_links ?? "",
            logo_url: row.logo_url ?? null,
            invoice_note: row.footer_note ?? "",
            baghdad_fee: typeof row.shipping_baghdad === "number" ? row.shipping_baghdad : null,
            provinces_fee:
              typeof row.shipping_provinces === "number" ? row.shipping_provinces : null,
          };
          if (!canceled) {
            setValues(next);
            setBaghdadInput(next.baghdad_fee == null ? "" : String(next.baghdad_fee));
            setProvincesInput(next.provinces_fee == null ? "" : String(next.provinces_fee));
          }
        }
      } catch (e) {
        if (!canceled) {
          if (isMissingSettingsTableError(e)) {
            setNeedsDbSetup(true);
            setError("جدول settings غير موجود. نفّذ SQL أدناه مرة واحدة.");
          } else if (isPermissionError(e)) {
            setNeedsPolicySetup(true);
            setError("لا توجد صلاحية للوصول إلى settings (RLS). نفّذ سياسات الصلاحية أدناه.");
          } else {
            setError("تعذّر تحميل الإعدادات من Supabase.");
          }
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    void load();
    return () => {
      canceled = true;
    };
  }, [supabase]);

  const save = async () => {
    if (needsDbSetup) {
      setError("لا يمكن الحفظ قبل إنشاء جدول settings. نفّذ SQL أدناه أولًا.");
      setSavedMessage(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const shippingBaghdad = parseFeeInput(baghdadInput);
      const shippingProvinces = parseFeeInput(provincesInput);
      const payload = {
        id: "nars",
        brand_name: values.brand_name,
        phone: values.contact_phone,
        social_links: values.social_links,
        logo_url: values.logo_url,
        paper_size: "thermal_80",
        footer_note: values.invoice_note,
        show_social_on_invoice: true,
        shipping_baghdad: shippingBaghdad,
        shipping_provinces: shippingProvinces,
        theme_mode: "light",
        accent_color: "#8b5cf6",
      };
      const { error: dbError } = await supabase.from("settings").upsert(payload, { onConflict: "id" });
      if (dbError) throw dbError;
      setValues((prev) => ({
        ...prev,
        baghdad_fee: shippingBaghdad,
        provinces_fee: shippingProvinces,
      }));
      setSavedMessage("تم حفظ التعديلات بنجاح.");
      toast.success("تم حفظ الإعدادات بنجاح! 💾");
    } catch (e) {
      if (isMissingSettingsTableError(e)) {
        setNeedsDbSetup(true);
        setError("لا يمكن الحفظ: جدول settings غير موجود.");
      } else if (isPermissionError(e)) {
        setNeedsPolicySetup(true);
        setError("لا يمكن الحفظ: صلاحيات جدول settings غير مفعلة للمستخدم الحالي.");
      } else {
        setError("فشل حفظ الإعدادات.");
      }
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "rounded-xl border border-violet-200/80 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-violet-500";

  const sectionShell =
    "rounded-[1.35rem] border border-violet-200/80 bg-gradient-to-b from-white to-violet-50/35 p-4 shadow-md ring-1 ring-violet-100/50 backdrop-blur-sm md:p-5";

  const fieldLabelClass = "text-[11px] font-medium leading-snug text-slate-600";

  const sectionHead = (icon: React.ReactNode, title: string, hint: string, titleId: string) => (
    <div className="mb-4 flex items-start gap-3 border-b border-violet-200/70 pb-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-600/25 [&>svg]:size-[18px]">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <h2
          id={titleId}
          className="text-base font-black leading-snug tracking-tight text-violet-950 md:text-[1.05rem]"
        >
          {title}
        </h2>
        <p className="mt-1 text-[11px] font-normal leading-relaxed text-slate-600">{hint}</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
      <header className="nars-glass shrink-0 rounded-[1.5rem] px-4 py-3 shadow-md md:rounded-[2rem] md:px-5 md:py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-lg font-black leading-tight tracking-tight text-violet-950 md:text-xl">
              إعدادات النظام
            </h1>
            <p className="mt-1 text-[11px] font-normal leading-relaxed text-slate-600 md:text-xs">
              جميع الخيارات في صفحة واحدة — احفظ بعد أي تعديل.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading || needsDbSetup}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-violet-600 px-3 py-2 text-[11px] font-bold text-white shadow-md transition hover:bg-violet-500 disabled:opacity-60 md:px-4 md:py-2.5 md:text-xs"
          >
            <Save size={15} className="md:size-4" />
            {saving ? "جاري الحفظ…" : "حفظ التعديلات"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pe-0.5">
        {loading ? (
          <p className="py-8 text-center text-sm font-medium text-slate-500">جاري التحميل…</p>
        ) : (
          <div className="flex flex-col gap-4 pb-3">
            <section className={sectionShell} aria-labelledby="settings-brand-title">
              {sectionHead(
                <Store aria-hidden />,
                "معلومات البراند",
                "الاسم ووسائل التواصل كما تظهر في اللوحة ووصل التسليم.",
                "settings-brand-title"
              )}
              <div className="grid gap-3 md:grid-cols-2 md:gap-x-4 md:gap-y-3">
                <div className="flex flex-col gap-1">
                  <label className={fieldLabelClass}>اسم البراند</label>
                  <input value={values.brand_name} onChange={(e) => setValue("brand_name", e.target.value)} className={inputClass} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={fieldLabelClass}>رقم الهاتف للوصول</label>
                  <input
                    dir="ltr"
                    value={values.contact_phone}
                    onChange={(e) => setValue("contact_phone", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className={fieldLabelClass}>روابط التواصل</label>
                  <textarea rows={2} value={values.social_links} onChange={(e) => setValue("social_links", e.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            <section className={sectionShell} aria-labelledby="settings-print-title">
              {sectionHead(
                <FileText aria-hidden />,
                "الطباعة والوصل",
                "نص أسفل الوصل كما يظهر في وصل التسليم.",
                "settings-print-title"
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className={fieldLabelClass}>ملاحظة أسفل الوصل</label>
                  <textarea rows={3} value={values.invoice_note} onChange={(e) => setValue("invoice_note", e.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            <section className={sectionShell} aria-labelledby="settings-ship-title">
              {sectionHead(
                <Package aria-hidden />,
                "أسعار الشحن",
                "قيم افتراضية بالدينار العراقي لبغداد وللمحافظات.",
                "settings-ship-title"
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className={fieldLabelClass}>بغداد</label>
                  <input type="number" dir="ltr" value={baghdadInput} onChange={(e) => setBaghdadInput(e.target.value)} className={inputClass} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={fieldLabelClass}>المحافظات</label>
                  <input type="number" dir="ltr" value={provincesInput} onChange={(e) => setProvincesInput(e.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            {error ? <p className="text-xs font-semibold text-rose-600">{error}</p> : null}
            {needsDbSetup ? (
              <div className="rounded-[1.25rem] border-2 border-amber-300/80 bg-amber-50/50 p-3 shadow-sm">
                <p className="text-xs font-bold text-amber-900">نفّذ SQL التالي مرة واحدة (جدول settings):</p>
                <pre dir="ltr" className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950/90 p-3 text-[11px] leading-relaxed text-amber-100">
                  {SETTINGS_SQL}
                </pre>
              </div>
            ) : null}
            {needsPolicySetup ? (
              <div className="rounded-[1.25rem] border-2 border-amber-300/80 bg-amber-50/50 p-3 shadow-sm">
                <p className="text-xs font-bold text-amber-900">سياسات RLS في Supabase SQL Editor:</p>
                <pre dir="ltr" className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950/90 p-3 text-[11px] leading-relaxed text-amber-100">
                  {SETTINGS_POLICY_SQL}
                </pre>
              </div>
            ) : null}
            {savedMessage ? <p className="text-xs font-semibold text-emerald-600">{savedMessage}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardChrome>
      <SettingsPageInner />
    </DashboardChrome>
  );
}

