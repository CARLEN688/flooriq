"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { Square } from "lucide-react";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const fn = mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
      const { error } = await fn;
      if (error) throw error;
      router.push("/takeoff");
    } catch (e: any) {
      setErr(e.message ?? "Auth failed");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0B1B2B" }}>
      <div style={{ width: 360, background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <Square size={22} color="#5BC0BE" fill="#5BC0BE" />
          <div style={{ fontWeight: 800, fontSize: 20, color: "#0B1B2B" }}>FloorIQ</div>
        </div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
          {mode === "signin" ? "Sign in to your store workspace." : "Create your account."}
        </div>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          style={inp} />
        <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
          style={{ ...inp, marginTop: 10 }} />
        {err && <div style={{ color: "#C0392B", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        <button onClick={submit} disabled={busy}
          style={{ width: "100%", marginTop: 16, padding: 12, background: "#0B1B2B", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, cursor: "pointer" }}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#1F6FEB", fontSize: 13, cursor: "pointer" }}>
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #E2E8F0", borderRadius: 9, fontSize: 14, boxSizing: "border-box" };
