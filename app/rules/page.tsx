"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback } from "react";
import {
  listPricingRules, listWasteRules, updatePricingRule, updateWasteRule, addWasteRule,
  getMyProfile, PricingRule, WasteRule,
} from "../../lib/quoteApi";
import { supabase } from "../../lib/supabaseClient";
import { Square, Check, Plus, LogOut } from "lucide-react";

const CATS: Array<{ key: "lvp" | "tile" | "carpet"; label: string; color: string }> = [
  { key: "lvp", label: "LVP / Plank", color: "#E4B363" },
  { key: "tile", label: "Tile", color: "#5BC0BE" },
  { key: "carpet", label: "Carpet", color: "#8FB339" },
];

export default function RulesPage() {
  const [pricing, setPricing] = useState<PricingRule[]>([]);
  const [waste, setWaste] = useState<WasteRule[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [p, w, prof] = await Promise.all([listPricingRules(), listWasteRules(), getMyProfile()]);
      setPricing(p); setWaste(w); setStoreId(prof?.store_id ?? null);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function flash(msg: string) { setSaved(msg); setTimeout(() => setSaved(null), 1600); }

  async function savePricing(r: PricingRule) {
    try {
      await updatePricingRule(r.id, {
        base_material_cost: r.base_material_cost,
        labour_rate: r.labour_rate,
        default_margin_pct: r.default_margin_pct,
      });
      flash("Pricing saved");
    } catch (e: any) { setErr(e.message); }
  }
  async function saveWaste(r: WasteRule) {
    try { await updateWasteRule(r.id, { waste_pct: r.waste_pct }); flash("Waste saved"); }
    catch (e: any) { setErr(e.message); }
  }

  const setP = (id: string, k: keyof PricingRule, v: number) =>
    setPricing(pricing.map(r => r.id === id ? { ...r, [k]: v } : r));
  const setW = (id: string, v: number) =>
    setWaste(waste.map(r => r.id === id ? { ...r, waste_pct: v } : r));

  // add-waste form state
  const [newCat, setNewCat] = useState<"lvp" | "tile" | "carpet">("lvp");
  const [newPattern, setNewPattern] = useState("");
  const [newPct, setNewPct] = useState(10);
  async function addWaste() {
    if (!storeId || !newPattern.trim()) { setErr("Enter a pattern name."); return; }
    try {
      const r = await addWasteRule(storeId, newCat, newPattern.trim().toLowerCase(), newPct);
      setWaste([...waste, r]); setNewPattern(""); flash("Pattern added");
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "ui-sans-serif, system-ui" }}>
      <div style={{ background: "#0B1B2B", color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <Square size={20} color="#5BC0BE" fill="#5BC0BE" />
        <div style={{ fontWeight: 700 }}>FloorIQ</div>
        <div style={{ color: "#7C93A8", fontSize: 13 }}>Pricing &amp; waste rules</div>
        <a href="/takeoff" style={{ marginLeft: "auto", color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>← Takeoff</a>
        <a href="/quotes" style={{ marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>Quotes</a>
        <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/login"))}
          style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #2A3F55", color: "#9DB2C6", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, cursor: "pointer" }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {saved && <div style={{ background: "#E7F6EC", color: "#1E8E3E", padding: "7px 20px", fontSize: 13 }}>{saved}</div>}
      {err && <div style={{ background: "#FDEDEC", color: "#C0392B", padding: "7px 20px", fontSize: 13 }}>{err}</div>}

      <div style={{ maxWidth: 920, margin: "0 auto", padding: 22 }}>
        <p style={{ fontSize: 13.5, color: "#64748B", marginTop: 0 }}>
          These drive every quote. Edit a value and click save — changes apply to new quotes immediately, no redeploy.
        </p>

        {/* PRICING */}
        <h2 style={h2}>Pricing</h2>
        <div style={card}>
          <div style={{ ...rowGrid, fontWeight: 700, fontSize: 12, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4 }}>
            <span>Category</span><span>Material $/sf</span><span>Labour $/sf</span><span>Margin %</span><span></span>
          </div>
          {loading && <div style={{ padding: 12, color: "#94A3B8" }}>Loading…</div>}
          {pricing.map((r) => {
            const cat = CATS.find(c => c.key === r.category)!;
            return (
              <div key={r.id} style={rowGrid}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: cat.color }} />{cat.label}
                </span>
                <NumInput value={r.base_material_cost} step={0.05} onChange={(v) => setP(r.id, "base_material_cost", v)} />
                <NumInput value={r.labour_rate} step={0.05} onChange={(v) => setP(r.id, "labour_rate", v)} />
                <NumInput value={r.default_margin_pct} step={0.5} onChange={(v) => setP(r.id, "default_margin_pct", v)} />
                <button onClick={() => savePricing(r)} style={saveBtn}><Check size={14} /> Save</button>
              </div>
            );
          })}
        </div>

        {/* WASTE */}
        <h2 style={h2}>Waste %</h2>
        <div style={card}>
          <div style={{ ...wasteGrid, fontWeight: 700, fontSize: 12, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4 }}>
            <span>Category</span><span>Pattern</span><span>Waste %</span><span></span>
          </div>
          {waste.map((r) => {
            const cat = CATS.find(c => c.key === r.category)!;
            return (
              <div key={r.id} style={wasteGrid}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: cat.color }} />{cat.label}
                </span>
                <span style={{ color: "#475569" }}>{r.pattern}</span>
                <NumInput value={r.waste_pct} step={0.5} onChange={(v) => setW(r.id, v)} />
                <button onClick={() => saveWaste(r)} style={saveBtn}><Check size={14} /> Save</button>
              </div>
            );
          })}

          {/* add new pattern */}
          <div style={{ ...wasteGrid, borderTop: "1px dashed #E2E8F0", paddingTop: 12, marginTop: 6 }}>
            <select value={newCat} onChange={(e) => setNewCat(e.target.value as any)} style={selStyle}>
              {CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <input placeholder="pattern (e.g. chevron)" value={newPattern} onChange={(e) => setNewPattern(e.target.value)} style={inpStyle} />
            <NumInput value={newPct} step={0.5} onChange={setNewPct} />
            <button onClick={addWaste} style={{ ...saveBtn, background: "#1F6FEB", color: "#fff", border: "none" }}><Plus size={14} /> Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumInput({ value, onChange, step }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input type="number" step={step ?? 1} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={inpStyle} />
  );
}

const h2: React.CSSProperties = { fontSize: 16, fontWeight: 800, marginTop: 26, marginBottom: 10, color: "#0B1B2B" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E6EBF0", borderRadius: 12, padding: 14 };
const rowGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 0.9fr", gap: 10, alignItems: "center", padding: "8px 0" };
const wasteGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 0.9fr", gap: 10, alignItems: "center", padding: "8px 0" };
const inpStyle: React.CSSProperties = { width: "100%", padding: "7px 9px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 13.5, boxSizing: "border-box" };
const selStyle: React.CSSProperties = { ...inpStyle };
const saveBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 10px", border: "1px solid #E2E8F0", background: "#fff", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" };
