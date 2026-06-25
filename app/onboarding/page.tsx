"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createStoreAndJoin, getMyProfile } from "../../lib/quoteApi";
import { Square } from "lucide-react";

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("Alberta");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // If the user already has a store, skip onboarding.
  useEffect(() => {
    getMyProfile().then((p) => { if (p?.store_id) router.replace("/takeoff"); });
  }, [router]);

  async function create() {
    if (!name.trim()) { setErr("Enter a store name."); return; }
    setBusy(true); setErr(null);
    try {
      await createStoreAndJoin(name.trim(), region.trim() || undefined);
      router.push("/takeoff");
    } catch (e: any) { setErr(e.message ?? "Failed to create store"); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0B1B2B" }}>
      <div style={{ width: 420, background: "#fff", borderRadius: 14, padding: 30, boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Square size={22} color="#5BC0BE" fill="#5BC0BE" />
          <div style={{ fontWeight: 800, fontSize: 20 }}>Set up your store</div>
        </div>
        <p style={{ fontSize: 13.5, color: "#64748B", marginTop: 0, lineHeight: 1.5 }}>
          Create your store to start quoting. You'll be the admin, and default
          pricing &amp; waste rules are added automatically — edit them anytime.
        </p>
        <label style={lbl}>Store name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wolf Creek Building Supplies" style={inp} />
        <label style={lbl}>Region</label>
        <input value={region} onChange={e => setRegion(e.target.value)} style={inp} />
        {err && <div style={{ color: "#C0392B", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        <button onClick={create} disabled={busy}
          style={{ width: "100%", marginTop: 18, padding: 12, background: "#0B1B2B", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Creating…" : "Create store"}
        </button>
      </div>
    </div>
  );
}
const lbl: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 600, color: "#334155", marginTop: 14, marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #E2E8F0", borderRadius: 9, fontSize: 14, boxSizing: "border-box" };
