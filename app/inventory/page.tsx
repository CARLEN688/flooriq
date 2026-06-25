"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback } from "react";
import {
  listInventory, updateInventory, listPurchaseOrders, getPOLines,
  createPOFromLowStock, setPOStatus, InventoryRow, PORow,
} from "../../lib/quoteApi";
import Nav from "../../components/Nav";
import { Boxes, FileText, Check, AlertTriangle } from "lucide-react";

const PO_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "#5B6B7B", bg: "#EEF2F6" },
  submitted: { label: "Submitted", color: "#1F6FEB", bg: "#EAF2FF" },
  received: { label: "Received", color: "#1E8E3E", bg: "#E7F6EC" },
  cancelled: { label: "Cancelled", color: "#C0392B", bg: "#FDEDEC" },
};

export default function InventoryPage() {
  const [inv, setInv] = useState<InventoryRow[]>([]);
  const [pos, setPos] = useState<PORow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [openPO, setOpenPO] = useState<{ po: PORow; lines: any[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const [i, p] = await Promise.all([listInventory(), listPurchaseOrders()]); setInv(i); setPos(p); }
    catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 2200); }

  const setRow = (id: string, k: "on_hand_sqft" | "reorder_point_sqft", v: number) =>
    setInv(inv.map(r => r.id === id ? { ...r, [k]: v } : r));
  async function save(r: InventoryRow) {
    try { await updateInventory(r.id, { on_hand_sqft: r.on_hand_sqft, reorder_point_sqft: r.reorder_point_sqft }); flash("Inventory saved"); }
    catch (e: any) { setErr(e.message); }
  }
  async function genPO() {
    setErr(null);
    try { const po = await createPOFromLowStock(); flash(`Created ${po.po_number} ($${po.total.toFixed(2)})`); await load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function viewPO(po: PORow) { setOpenPO({ po, lines: await getPOLines(po.id) }); }
  async function advancePO(po: PORow, status: string) {
    try { await setPOStatus(po.id, status); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  const lowCount = inv.filter(r => r.on_hand_sqft <= r.reorder_point_sqft).length;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "ui-sans-serif, system-ui" }}>
      <Nav active="/inventory" />
      {err && <div style={{ background: "#FDEDEC", color: "#C0392B", padding: "7px 20px", fontSize: 13 }}>{err}</div>}
      {msg && <div style={{ background: "#E7F6EC", color: "#1E8E3E", padding: "7px 20px", fontSize: 13 }}>{msg}</div>}

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={h2}><Boxes size={18} /> Inventory</h2>
          {lowCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "#B7791F", background: "#FEF3DA", padding: "4px 10px", borderRadius: 20 }}>
              <AlertTriangle size={13} /> {lowCount} low
            </span>
          )}
          <button onClick={genPO} disabled={lowCount === 0}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", background: lowCount === 0 ? "#9DB2C6" : "#0B1B2B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: lowCount === 0 ? "not-allowed" : "pointer" }}>
            <FileText size={15} /> Generate PO from low stock
          </button>
        </div>

        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ ...invGrid, fontWeight: 700, fontSize: 12, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4 }}>
            <span>Product</span><span>On hand (sf)</span><span>Reorder at (sf)</span><span></span><span></span>
          </div>
          {loading && <div style={muted}>Loading…</div>}
          {inv.map(r => {
            const low = r.on_hand_sqft <= r.reorder_point_sqft;
            return (
              <div key={r.id} style={invGrid}>
                <span style={{ fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
                  {r.product?.name ?? "—"}
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{r.product?.category}</span>
                </span>
                <input type="number" value={r.on_hand_sqft} onChange={e => setRow(r.id, "on_hand_sqft", +e.target.value)} style={ctrl} />
                <input type="number" value={r.reorder_point_sqft} onChange={e => setRow(r.id, "reorder_point_sqft", +e.target.value)} style={ctrl} />
                <span>{low ? <span style={{ fontSize: 11.5, fontWeight: 700, color: "#B7791F", background: "#FEF3DA", padding: "3px 9px", borderRadius: 20 }}>Low</span> : <span style={{ fontSize: 11.5, color: "#1E8E3E", fontWeight: 600 }}>OK</span>}</span>
                <button onClick={() => save(r)} style={saveBtn}><Check size={14} /> Save</button>
              </div>
            );
          })}
        </div>

        <h2 style={{ ...h2, marginTop: 26 }}><FileText size={17} /> Purchase orders</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {pos.length === 0 && <div style={{ ...card, color: "#94A3B8", fontSize: 13.5, textAlign: "center" }}>No purchase orders yet.</div>}
          {pos.map(po => {
            const m = PO_STATUS[po.status] ?? PO_STATUS.draft;
            return (
              <div key={po.id} style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
                <button onClick={() => viewPO(po)} style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 800, fontSize: 14.5, textDecoration: "underline" }}>{po.po_number}</button>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>{new Date(po.created_at).toLocaleDateString()}</span>
                <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 15 }}>${po.total.toFixed(2)}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: m.color, background: m.bg, padding: "4px 10px", borderRadius: 20 }}>{m.label}</span>
                <select value={po.status} onChange={e => advancePO(po, e.target.value)} style={ctrl}>
                  {Object.keys(PO_STATUS).map(s => <option key={s} value={s}>{PO_STATUS[s].label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {openPO && (
        <div onClick={() => setOpenPO(null)} style={{ position: "fixed", inset: 0, background: "rgba(11,27,43,.55)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, background: "#fff", borderRadius: 14, padding: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{openPO.po.po_number}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, fontSize: 13 }}>
              <thead><tr style={{ background: "#0B1B2B", color: "#fff", textAlign: "left" }}>
                <th style={th}>Product</th><th style={thR}>Qty sf</th><th style={thR}>Unit</th><th style={thR}>Total</th>
              </tr></thead>
              <tbody>
                {openPO.lines.map((l, i) => (
                  <tr key={i} style={{ background: i % 2 ? "#F7FAFC" : "#fff" }}>
                    <td style={td}>{l.product?.name ?? "—"}</td>
                    <td style={tdR}>{Number(l.qty_sqft).toFixed(0)}</td>
                    <td style={tdR}>${Number(l.unit_cost).toFixed(2)}</td>
                    <td style={tdR}>${Number(l.line_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontWeight: 800, fontSize: 16 }}>
              <span>Total</span><span>${openPO.po.total.toFixed(2)}</span>
            </div>
            <button onClick={() => setOpenPO(null)} style={{ marginTop: 18, padding: "9px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 9, cursor: "pointer" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
const h2: React.CSSProperties = { fontSize: 15.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 7, color: "#0B1B2B" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E6EBF0", borderRadius: 12, padding: 14 };
const invGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 0.7fr 0.9fr", gap: 10, alignItems: "center", padding: "8px 0" };
const ctrl: React.CSSProperties = { padding: "7px 9px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 13, width: "100%", boxSizing: "border-box" };
const saveBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 10px", border: "1px solid #E2E8F0", background: "#fff", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const muted: React.CSSProperties = { fontSize: 12.5, color: "#B6C2CE" };
const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11.5, fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "7px 10px", borderBottom: "1px solid #EEF2F6" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
