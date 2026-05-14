import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";

/** Static shell at the edge — marketing page has no server data requirements */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "NARS — ذكاء أعمالك يبدأ من هنا",
  description:
    "حوّل فوضى الرسائل إلى بيانات منظمة. NARS المساعد الذكي لإدارة الطلبات والطباعة والإحصائيات.",
};

/** الصفحة الرئيسية: صفحة تسويقية عامة؛ الدخول للتطبيق من /login */
export default function Home() {
  return <LandingPage />;
}
