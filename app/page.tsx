import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** الصفحة الجذر توجّه للتطبيق الفعلي (وليس قالب create-next-app). */
export default async function Home() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/dashboard" : "/login");
  } catch {
    redirect("/login");
  }
}
