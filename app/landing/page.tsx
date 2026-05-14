import { permanentRedirect } from "next/navigation";

/** العنوان القديم /landing يوجّه إلى الصفحة الرئيسية */
export default function LandingRedirect() {
  permanentRedirect("/");
}
