"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback } from "react";
import { listInstalls, listCrews, scheduleInstall, setInstallStatus, addCrew, getMyProfile, Install, Crew } from "../../lib/quoteApi";
import Nav from "../../components/Nav";
import { CalendarDays, Plus, Users } from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  unscheduled: { label: "Unscheduled", color: "#5B6B7B", bg: "#EEF2F6" },
  scheduled:   { label: "Scheduled",   color: "#1F6FEB", bg: "#EAF2FF" },
  in_progress: { label: "In progress", color: "#B7791F", bg: "#FEF3DA" },
  done:        { label: "Done",        color: "#1E8E3E", bg: "#E7F6EC" },
};

export default function SchedulePage() {
  const [installs, setInstalls] = useState<Install[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [i, c, p] = await Promise.all([listInstalls(), listCrews(), getMyProfile()]);
      setInstalls(i); setCrews(c); setStoreId(p?.store_id ?? null);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function schedule(inst: Install, crewId: string, date: string) {
    if (!crewId || !date) { setErr("Pick a crew and date."); return; }
    try { await scheduleInstall(inst.id, crewId, date); await load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function advance(inst: Install, status: string) {
    try { await setInstallStatus(inst.id, status); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  const [crewName, setCrewName] = useState(""); const [crewCap, setCrewCap] = useState(400);
  async function createCrew() {
    if (!storeId || !crewName.trim()) { setErr("Enter a crew name."); return; }
    try { const c = await addCrew(storeId, crewName.trim(), crewCap); setCrews([...crews, c]); setCrewName(""); }
    catch (e: any) { setErr(e.message); }
  }
  const crewName_ = (id: string | null) => crews.find(c => c.id === id)?.name ?? "—";

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "ui-sans-serif, system-ui" }}>
      <Nav active="/schedule" />
      {err && <div style={{ background: "#FDEDEC", color: "#C0392B", padding: "7px 20px", fontSize: 13 }}>{err}</div>}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 22, display: "grid", gridTemplateColumns: "1fr 280px", gap: 18 }}>
        <div>
          <h2 style={h2}><CalendarDays size={18} /> Installs</h2>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>Installs are auto-created when an order is made. Assign a crew and date, then move through fulfilment.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {loading && <div style={muted}>Loading…</div>}
            {!loading && installs.length === 0 && (
              <div style={{ background: "#fff", border: "1px dashed #D7E0E8", borderRadius: 12, padding: 26, textAlign: "center", color: "#94A3B8", fontSize: 13.5 }}>
                No installs yet. Convert a won quote to an order to create one.
              </div>
            )}
            {installs.map((inst) => {
              const m = STATUS_META[inst.status] ?? STATUS_META.unscheduled;
              return (
                <div key={inst.id} style={{ background: "#fff", border: "1px solid #E6EBF0", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{inst.title || "Install"}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8" }}>{Number(inst.est_sqft).toFixed(0)} sf · crew: {crewName_(inst.crew_id)}{inst.scheduled_date ? ` · ${inst.scheduled_date}` : ""}</div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: m.color, background: m.bg, padding: "4px 10px", borderRadius: 20 }}>{m.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <select id={`crew-${inst.id}`} defaultValue={inst.crew_id ?? ""} style={ctrl}>
                      <option value="">Select crew…</option>
                      {crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input id={`date-${inst.id}`} type="date" defaultValue={inst.scheduled_date ?? ""} style={ctrl} />
                    <button onClick={() => {
                      const crew = (document.getElementById(`crew-${inst.id}`) as HTMLSelectElement).value;
                      const date = (document.getElementById(`date-${inst.id}`) as HTMLInputElement).value;
                      schedule(inst, crew, date);
                    }} style={primaryBtn}>Schedule</button>
                    {inst.status === "scheduled" && <button onClick={() => advance(inst, "in_progress")} style={ghostBtn}>Start</button>}
                    {inst.status === "in_progress" && <button onClick={() => advance(inst, "done")} style={ghostBtn}>Mark done</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 style={h2}><Users size={17} /> Crews</h2>
          <div style={card}>
            {crews.map(c => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F1F5F9", fontSize: 13.5 }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span style={{ color: "#94A3B8" }}>{c.capacity_sqft_per_day} sf/day</span>
              </div>
            ))}
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <input placeholder="Crew name" value={crewName} onChange={e => setCrewName(e.target.value)} style={ctrl} />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" value={crewCap} onChange={e => setCrewCap(+e.target.value)} style={{ ...ctrl, width: 90 }} />
                <span style={{ fontSize: 12, color: "#64748B" }}>sf/day</span>
                <button onClick={createCrew} style={{ ...primaryBtn, marginLeft: "auto" }}><Plus size={14} /> Add</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
const h2: React.CSSProperties = { fontSize: 15.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 7, color: "#0B1B2B" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E6EBF0", borderRadius: 12, padding: 14 };
const ctrl: React.CSSProperties = { padding: "7px 9px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 13 };
const primaryBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#0B1B2B", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "7px 12px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 13, cursor: "pointer" };
const muted: React.CSSProperties = { fontSize: 12.5, color: "#B6C2CE" };
