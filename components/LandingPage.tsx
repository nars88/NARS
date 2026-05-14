"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  motion,
  useInView,
  type HTMLMotionProps,
} from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Phone,
  Printer,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const CONTACT_EMAIL = "nargesaali88@gmail.com";
const CONTACT_PHONE = "07738151383";

const cardRadius = "rounded-[32px]";

const floatShadow =
  "shadow-[0_32px_64px_-16px_rgba(91,33,182,0.14),0_20px_48px_-20px_rgba(236,72,153,0.12),0_8px_16px_-8px_rgba(15,23,42,0.06)]";

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1];

function Blob({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full blur-[100px] ${className ?? ""}`}
      style={style}
    />
  );
}

function RevealSection({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  return (
    <motion.section
      ref={ref}
      id={id}
      className={className}
      initial={{ opacity: 0, y: 56 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 56 }}
      transition={{ duration: 0.75, ease: easeOutExpo }}
    >
      {children}
    </motion.section>
  );
}

function Floating({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -12, 0] }}
      transition={{
        duration: 4.2 + delay * 0.4,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}

function PlaceholderSphere({
  size = "h-24 w-24",
  gradient,
  icon: Icon,
}: {
  size?: string;
  gradient: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={`relative ${size} shrink-0 rounded-full ${gradient} ${floatShadow} flex items-center justify-center`}
      style={{
        boxShadow:
          "inset 0 -12px 24px rgba(0,0,0,0.08), inset 0 8px 20px rgba(255,255,255,0.45), 0 24px 48px -12px rgba(91,33,182,0.2)",
      }}
    >
      <div className="absolute inset-[18%] rounded-full bg-white/35 blur-md" />
      <Icon className="relative z-[1] h-[42%] w-[42%] text-white drop-shadow-md" />
    </div>
  );
}

function MotionCard(
  props: HTMLMotionProps<"div"> & { children: React.ReactNode }
) {
  const { children, className, ...rest } = props;
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -4 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className={`${cardRadius} border border-violet-100/80 bg-white/90 ${floatShadow} backdrop-blur-sm ${className ?? ""}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function LandingPage() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("scroll-smooth");
    return () => root.classList.remove("scroll-smooth");
  }, []);

  return (
    <div
      dir="rtl"
      className="relative min-h-screen overflow-x-hidden bg-white font-sans text-slate-900 antialiased"
    >
      <Blob className="right-[-8%] top-[-12%] h-[min(52vw,520px)] w-[min(52vw,520px)] bg-[#e9d5ff]/70" />
      <Blob className="left-[-10%] top-[28%] h-[min(48vw,480px)] w-[min(48vw,480px)] bg-[#fce7f3]/75" />
      <Blob className="bottom-[-18%] right-[12%] h-[min(56vw,560px)] w-[min(56vw,560px)] bg-[#ddd6fe]/55" />

      <header className="sticky top-0 z-20 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4 md:flex-nowrap md:gap-x-6 md:px-8">
          {/* RTL: أول عنصر = يمين = الشعار */}
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={`flex h-11 w-11 items-center justify-center ${cardRadius} bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg font-bold text-white ${floatShadow}`}
            >
              N
            </div>
            <span className="text-xl font-semibold tracking-tight text-slate-900">
              NARS
            </span>
          </div>
          <nav className="order-3 flex w-full basis-full items-center justify-center gap-5 border-t border-gray-100 pt-3 text-sm sm:order-none sm:w-auto sm:flex-1 sm:basis-auto sm:border-t-0 sm:pt-0 sm:gap-6 md:gap-7">
            <a
              href="#how"
              onClick={(e) => {
                e.preventDefault();
                scrollToId("how");
              }}
              className="font-medium text-violet-700 transition-colors hover:text-violet-800"
            >
              كيف يعمل
            </a>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                scrollToId("features");
              }}
              className="font-medium text-violet-700 transition-colors hover:text-violet-800"
            >
              المزايا
            </a>
            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault();
                scrollToId("contact");
              }}
              className="font-medium text-violet-700 transition-colors hover:text-violet-800"
            >
              تواصل معنا
            </a>
          </nav>
          <Link
            href="/login"
            className="shrink-0 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/20 transition-transform hover:scale-[1.03]"
          >
            تسجيل الدخول
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-8">
        {/* Hero */}
        <section className="grid items-center gap-14 py-10 lg:grid-cols-2 lg:gap-10 lg:py-6">
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: easeOutExpo }}
            className="order-2 text-center lg:order-1 lg:text-right"
          >
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50/80 px-4 py-1.5 text-sm font-medium text-violet-800">
              <Sparkles className="h-4 w-4" />
              منصة ذكية لإدارة الطلبات
            </p>
            <h1 className="text-balance text-4xl font-bold leading-[1.15] tracking-tight text-slate-900 md:text-5xl lg:text-[2.75rem] xl:text-5xl">
              ذكاء أعمالك يبدأ من هنا
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-slate-600 lg:mx-0">
              حوّل فوضى الرسائل إلى بيانات منظمة في لحظات. NARS هو المساعد الذكي
              الذي يحتاجه متجرك للنمو.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/login"
                  className={`inline-flex items-center justify-center rounded-full bg-gradient-to-l from-violet-600 via-violet-600 to-fuchsia-500 px-8 py-3.5 text-base font-semibold text-white ${floatShadow} transition-shadow hover:shadow-[0_28px_56px_-12px_rgba(109,40,217,0.35)]`}
                >
                  ابدأ الآن
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <a
                  href="#how"
                  className={`inline-flex items-center justify-center rounded-full border-2 border-slate-200 bg-white/80 px-8 py-3.5 text-base font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition-colors hover:border-violet-200 hover:bg-violet-50/50`}
                >
                  شاهد الديمو
                </a>
              </motion.div>
            </div>
          </motion.div>

          <div className="relative order-1 flex min-h-[420px] items-center justify-center perspective-[1400px] lg:order-2 lg:min-h-[480px]">
            <Floating delay={0} className="relative w-full max-w-[min(100%,420px)]">
              <motion.div
                className="relative [transform-style:preserve-3d]"
                style={{ transformStyle: "preserve-3d" }}
                initial={{ opacity: 0, rotateY: -18 }}
                animate={{ opacity: 1, rotateY: -10 }}
                transition={{ duration: 0.9, ease: easeOutExpo }}
              >
                <div
                  className={`relative ${cardRadius} border border-white/80 bg-gradient-to-br from-white via-violet-50/30 to-fuchsia-50/40 p-5 ${floatShadow}`}
                  style={{
                    transform: "rotateY(-8deg) rotateX(4deg)",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div className="mb-4 flex items-center justify-between border-b border-violet-100/80 pb-3">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="h-5 w-5 text-violet-600" />
                      <span className="text-sm font-semibold text-slate-800">
                        لوحة الطلبات
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-2xl bg-white/90 px-3 py-2.5 shadow-sm ring-1 ring-violet-100/60"
                      >
                        <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 w-[58%] max-w-[140px] rounded-full bg-slate-200/90" />
                          <div className="h-2 w-[42%] max-w-[90px] rounded-full bg-slate-100" />
                        </div>
                        <div className="h-6 w-14 shrink-0 rounded-full bg-emerald-100/80" />
                      </div>
                    ))}
                  </div>
                  <div className="pointer-events-none absolute -left-6 bottom-16 h-28 w-28 rounded-full bg-gradient-to-tr from-fuchsia-400/30 to-violet-400/20 blur-2xl" />
                </div>
              </motion.div>
            </Floating>

            <motion.div
              className={`absolute -left-2 top-[8%] z-20 ${cardRadius} border border-white/90 bg-white/95 px-4 py-3 ${floatShadow} backdrop-blur-md md:left-0`}
              animate={{ y: [0, -10, 0] }}
              transition={{
                duration: 3.8,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.3,
              }}
              whileHover={{ scale: 1.05 }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">الحالة</p>
                  <p className="text-sm font-bold text-slate-900">
                    Order Confirmed ✓
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              className={`absolute -right-1 bottom-[14%] z-20 ${cardRadius} border border-white/90 bg-white/95 px-4 py-3 ${floatShadow} backdrop-blur-md md:right-0`}
              animate={{ y: [0, -8, 0] }}
              transition={{
                duration: 4.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.6,
              }}
              whileHover={{ scale: 1.05 }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">السعر</p>
                  <p className="text-sm font-bold text-slate-900">
                    Price: 50,000 IQD
                  </p>
                </div>
              </div>
            </motion.div>

            <div
              aria-hidden
              className="pointer-events-none absolute right-[6%] top-[4%] h-16 w-16 rounded-2xl bg-gradient-to-br from-pink-300 to-rose-200 opacity-80 shadow-lg"
              style={{ transform: "rotate(-12deg) translateZ(20px)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-[6%] left-[10%] h-12 w-12 rounded-full bg-gradient-to-br from-violet-400 to-indigo-300 opacity-70 blur-[0.5px] shadow-md"
            />
          </div>
        </section>

        {/* How it works */}
        <RevealSection id="how" className="py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 md:text-4xl">
              كيف يعمل؟
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              ثلاث خطوات بسيطة من الرسالة إلى الطلب الجاهز للطباعة.
            </p>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "١",
                title: "استقبال الرسائل",
                desc: "اربط قنواتك واستقبل الطلبات في مكان واحد منظم.",
                icon: MessageSquare,
                sphere:
                  "bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700",
              },
              {
                step: "٢",
                title: "التحليل الذكي",
                desc: "يفهم NARS نص الرسالة ويستخرج البيانات بدقة.",
                icon: Sparkles,
                sphere:
                  "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-700",
              },
              {
                step: "٣",
                title: "الطباعة والمتابعة",
                desc: "طباعة فورية ومتابعة حالة الطلب حتى التسليم.",
                icon: Printer,
                sphere:
                  "bg-gradient-to-br from-pink-400 via-rose-500 to-orange-400",
              },
            ].map((item, i) => (
              <MotionCard
                key={item.step}
                className="flex flex-col items-center p-8 text-center"
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.12, duration: 0.55, ease: easeOutExpo }}
              >
                <span className="mb-5 text-xs font-bold uppercase tracking-widest text-violet-500">
                  خطوة {item.step}
                </span>
                <PlaceholderSphere
                  size="h-28 w-28"
                  gradient={item.sphere}
                  icon={item.icon}
                />
                <h3 className="mt-6 text-xl font-bold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {item.desc}
                </p>
              </MotionCard>
            ))}
          </div>
        </RevealSection>

        {/* Features */}
        <RevealSection id="features" className="py-16">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 md:text-4xl">
              مزايا تعزز أداء متجرك
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              تحليل بالذكاء الاصطناعي، طباعة لحظية، وإحصائيات حية في واجهة واحدة.
            </p>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "تحليل بالذكاء الاصطناعي",
                subtitle: "AI Analysis",
                desc: "استخراج أسماء العملاء والعناوين والمنتجات من أي رسالة نصية.",
                icon: Sparkles,
                accent: "from-violet-500 to-purple-600",
              },
              {
                title: "طباعة فورية",
                subtitle: "Instant Printing",
                desc: "جهّز الطلبات واطبعها بسرعة دون إعادة إدخال يدوي.",
                icon: Printer,
                accent: "from-fuchsia-500 to-pink-600",
              },
              {
                title: "إحصائيات حية",
                subtitle: "Live Stats",
                desc: "تابع الطلبات اليومية والإيرادات ومعدلات التجهيز لحظة بلحظة.",
                icon: BarChart3,
                accent: "from-indigo-500 to-violet-600",
              },
            ].map((f, i) => (
              <MotionCard
                key={f.title}
                className="p-8"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, duration: 0.55, ease: easeOutExpo }}
              >
                <div
                  className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${f.accent} text-white ${floatShadow}`}
                >
                  <f.icon className="h-7 w-7" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-500/90">
                  {f.subtitle}
                </p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {f.desc}
                </p>
              </MotionCard>
            ))}
          </div>
        </RevealSection>

        <RevealSection className="py-16">
          <MotionCard className="flex flex-col items-center gap-6 bg-gradient-to-bl from-violet-50/90 via-white to-fuchsia-50/80 p-10 text-center md:flex-row md:text-right">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">
                جاهز لتجربة NARS؟
              </h2>
              <p className="mt-3 text-slate-600">
                ابدأ اليوم وحوّل رسائل عملائك إلى طلبات جاهزة للتنفيذ.
              </p>
            </div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/login"
                className={`inline-flex items-center justify-center rounded-full bg-slate-900 px-10 py-4 text-base font-semibold text-white ${floatShadow}`}
              >
                ابدأ الآن
              </Link>
            </motion.div>
          </MotionCard>
        </RevealSection>

        <RevealSection id="contact" className="py-16 pb-8">
          <div
            className={`mx-auto max-w-3xl ${cardRadius} border border-violet-100/70 bg-gradient-to-b from-white via-white to-violet-50/25 px-8 py-12 shadow-[0_28px_56px_-18px_rgba(91,33,182,0.1),0_12px_32px_-12px_rgba(15,23,42,0.06)] md:px-14 md:py-14`}
          >
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                تواصل معنا
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-slate-600 md:text-lg">
                نحن هنا للإجابة على استفساراتكم ومساعدتكم في تطوير أعمالكم.
              </p>
            </div>
            <div className="mx-auto mt-12 flex max-w-lg flex-col gap-5 sm:max-w-2xl sm:flex-row sm:justify-center sm:gap-6">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className={`group flex min-w-0 flex-1 items-center gap-4 rounded-[24px] border border-violet-100/90 bg-white/90 px-5 py-4 transition duration-300 hover:border-violet-200 hover:shadow-[0_16px_40px_-12px_rgba(109,40,217,0.12)]`}
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-100/90 text-violet-600 ring-1 ring-violet-200/50">
                  <Mail className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-start">
                  <span className="block text-xs font-medium text-slate-500">البريد الإلكتروني</span>
                  <span className="mt-1 block break-all text-sm font-semibold text-slate-900 transition-colors group-hover:text-violet-800">
                    {CONTACT_EMAIL}
                  </span>
                </span>
              </a>
              <a
                href={`tel:${CONTACT_PHONE}`}
                className={`group flex min-w-0 flex-1 items-center gap-4 rounded-[24px] border border-emerald-100/90 bg-white/90 px-5 py-4 transition duration-300 hover:border-teal-200 hover:shadow-[0_16px_40px_-12px_rgba(20,184,166,0.12)]`}
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100/80">
                  <Phone className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-start">
                  <span className="block text-xs font-medium text-slate-500">الهاتف</span>
                  <span className="mt-1 block text-lg font-semibold tracking-wide text-slate-900 transition-colors group-hover:text-teal-700" dir="ltr">
                    {CONTACT_PHONE}
                  </span>
                </span>
              </a>
            </div>
          </div>
        </RevealSection>
      </main>

      <footer className="relative z-10 border-t border-violet-100/80 bg-white/60 py-10 text-center text-sm text-slate-500 backdrop-blur-sm">
        <p>© {new Date().getFullYear()} NARS — إدارة الطلبات الذكية</p>
      </footer>
    </div>
  );
}
