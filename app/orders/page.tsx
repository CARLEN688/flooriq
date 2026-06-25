"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback } from "react";
import { listOrders, setOrderStatus, Order } from "../../lib/quoteApi";
import { supabase } from "../../lib/supabaseClient";
import { Square, Package, LogOut } from "lucide-react";

const FLOW: string[] = ["pending", "ordered", "installing", "complete", "cancelled"];
const META: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "Pending",    color: "#5B6B7B", bg: "#EEF2F6" },
  ordered:    { label: "Ordered",    color: "#1F6FEB", bg: "#EAF2FF" },
  installing: { label: "Installing", color: "#B7791F", bg: "#FEF3DA" },
  complete:   { label: "Complete",   color: "#1E8E3E", bg: "#E7F6EC" },
  cancelled:  { label: "Cancelled",  color: "#C0392B", bg: "#FDEDEC" },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setOrders(await listOrders()); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function advance(o: Order, status: string) {
    try { await setOrderStatus(o.id, status); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "ui-sans-serif, system-ui" }}>
      <div style={{ background: "#0B1B2B", color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <Square size={20} color="#5BC0BE" fill="#5BC0BE" />
        <div style={{ fontWeight: 700 }}>FloorIQ</div>
        <div style={{ color: "#7C93A8", fontSize: 13 }}>Orders</div>
        <a href="/takeoff" style={navlink}>← Takeoff</a>
        <a href="/quotes" style={navlink}>Quotes</a>
        <a href="/jobs" style={navlink}>Jobs</a>
        <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/login"))}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #2A3F55", color: "#9DB2C6", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, cursor: "pointer" }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
      {err && <div style={{ background: "#FDEDEC", color: "#C0392B", padding: "7px 20px", fontSize: 13 }}>{err}</div>}

      <div style={{ maxWidth: 820, margin: "0 auto", padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, color: "#0B1B2B" }}>
          <Package size={18} /> Orders
        </h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
          Won quotes convert into orders here (from the Quotes pipeline). Move each through fulfilment.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {loading && <div style={{ color: "#94A3B8", fontSize: 13.5 }}>Loading…</div>}
          {!loading && orders.length === 0 && (
            <div style={{ background: "#fff", border: "1px dashed #D7E0E8", borderRadius: 12, padding: 28, textAlign: "center", color: "#94A3B8", fontSize: 13.5 }}>
              No orders yet. Win a quote, then convert it from the Quotes pipeline.
            </div>
          )}
          {orders.map((o) => {
            const m = META[o.status] ?? META.pending;
            return (
              <div key={o.id} style={{ background: "#fff", border: "1px solid #E6EBF0", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{o.order_number}</div>
                  <div style={{ fontSize: 11.5, color: "#94A3B8" }}>{new Date(o.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>${o.total.toFixed(2)}</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: m.color, background: m.bg, padding: "4px 11px", borderRadius: 20 }}>{m.label}</span>
                <select value={o.status} onChange={(e) => advance(o, e.target.value)}
                  style={{ padding: "6px 8px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13 }}>
                  {FLOW.map((s) => <option key={s} value={s}>{META[s].label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
const navlink: React.CSSProperties = { marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" };
