"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message || "Login failed");
        setLoading(false);
        return;
      }

      const nextPath =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard");
      router.refresh();
    } catch {
      setError("Failed to connect. Check your network and Supabase settings.");
      setLoading(false);
    }
  };

  return (
    <div dir="ltr" className={styles.page}>
      <main className={styles.card}>
        <section className={styles.leftColumn} />

        <section className={styles.rightColumn}>
          <h1 className={styles.title}>Get Started</h1>

          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.fieldGroup}>
              <label htmlFor="email" className={styles.label}>
                Email
              </label>
              <div className={styles.inputRow}>
                <Mail size={22} className={styles.icon} />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="example@email.com"
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <div className={styles.inputRow}>
                <Lock size={22} className={styles.icon} />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className={styles.input}
                />
              </div>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}

            <button type="submit" disabled={loading} className={styles.button}>
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
