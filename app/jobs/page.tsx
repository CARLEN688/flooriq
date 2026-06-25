"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback } from "react";
import {
  listCustomers, addCustomer, listJobs, addJob, getMyProfile,
  Customer, Job,
} from "../../lib/quoteApi";
import { supabase } from "../../lib/supabaseClient";
import { Square, Plus, Building2, Hammer, LogOut } from "lucide-react";

const JOB_STATUS_COLOR: Record<string, string> = {
  inquiry: "#5B6B7B", quoting: "#1F6FEB", won: "#1E8E3E", lost: "#C0392B", archived: "#94A3B8",
};

export default function JobsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [c, j, p] = await Promise.all([listCustomers(), listJobs(), getMyProfile()]);
      setCustomers(c); setJobs(j); setStoreId(p?.store_id ?? null);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // new customer form
  const [cName, setCName] = useState(""); const [cType, setCType] = useState<"builder" | "retail">("builder");
  const [cEmail, setCEmail] = useState(""); const [cPhone, setCPhone] = useState("");
  async function createCustomer() {
    if (!storeId || !cName.trim()) { setErr("Enter a customer name."); return; }
    try {
      const c = await addCustomer(storeId, { name: cName.trim(), type: cType, contact_email: cEmail.trim() || null, contact_phone: cPhone.trim() || null });
      setCustomers([...customers, c].sort((a, b) => a.name.localeCompare(b.name)));
      setCName(""); setCEmail(""); setCPhone("");
    } catch (e: any) { setErr(e.message); }
  }

  // new job form
  const [jTitle, setJTitle] = useState(""); const [jAddr, setJAddr] = useState(""); const [jCust, setJCust] = useState("");
  async function createJob() {
    if (!storeId || !jTitle.trim()) { setErr("Enter a job title."); return; }
    try {
      const j = await addJob(storeId, { title: jTitle.trim(), address: jAddr.trim() || undefined, customer_id: jCust || null });
      setJobs([j, ...jobs]); setJTitle(""); setJAddr(""); setJCust("");
    } catch (e: any) { setErr(e.message); }
  }

  const custName = (id: string | null) => customers.find(c => c.id === id)?.name ?? "—";

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "ui-sans-serif, system-ui" }}>
      <Nav />
      {err && <div style={{ background: "#FDEDEC", color: "#C0392B", padding: "7px 20px", fontSize: 13 }}>{err}</div>}

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 22, display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 18 }}>
        {/* CUSTOMERS */}
        <div>
          <h2 style={h2}><Building2 size={17} /> Customers</h2>
          <div style={card}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input placeholder="Name (e.g. Bram Homes)" value={cName} onChange={e => setCName(e.target.value)} style={inp} />
              <div style={{ display: "flex", gap: 8 }}>
                <select value={cType} onChange={e => setCType(e.target.value as any)} style={{ ...inp, flex: 1 }}>
                  <option value="builder">Builder</option><option value="retail">Retail</option>
                </select>
                <input placeholder="Email" value={cEmail} onChange={e => setCEmail(e.target.value)} style={{ ...inp, flex: 1.5 }} />
              </div>
              <input placeholder="Phone" value={cPhone} onChange={e => setCPhone(e.target.value)} style={inp} />
              <button onClick={createCustomer} style={addBtn}><Plus size={15} /> Add customer</button>
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {loading && <div style={muted}>Loading…</div>}
              {!loading && customers.length === 0 && <div style={muted}>No customers yet.</div>}
              {customers.map(c => (
                <div key={c.id} style={listRow}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: "#94A3B8" }}>{c.contact_email || c.contact_phone || "no contact"}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.type === "builder" ? "#1F6FEB" : "#7C3AED", background: c.type === "builder" ? "#EAF2FF" : "#F3EEFF", padding: "2px 8px", borderRadius: 10 }}>{c.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* JOBS */}
        <div>
          <h2 style={h2}><Hammer size={17} /> Jobs</h2>
          <div style={card}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input placeholder="Job title (e.g. Lot 14 — Main Floor)" value={jTitle} onChange={e => setJTitle(e.target.value)} style={inp} />
              <input placeholder="Address" value={jAddr} onChange={e => setJAddr(e.target.value)} style={inp} />
              <select value={jCust} onChange={e => setJCust(e.target.value)} style={inp}>
                <option value="">— No customer —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={createJob} style={addBtn}><Plus size={15} /> Add job</button>
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {loading && <div style={muted}>Loading…</div>}
              {!loading && jobs.length === 0 && <div style={muted}>No jobs yet.</div>}
              {jobs.map(j => (
                <div key={j.id} style={listRow}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{j.title || "Untitled job"}</div>
                    <div style={{ fontSize: 11.5, color: "#94A3B8" }}>{custName(j.customer_id)}{j.address ? ` · ${j.address}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: JOB_STATUS_COLOR[j.status] ?? "#64748B", textTransform: "capitalize" }}>{j.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <div style={{ background: "#0B1B2B", color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
      <Square size={20} color="#5BC0BE" fill="#5BC0BE" />
      <div style={{ fontWeight: 700 }}>FloorIQ</div>
      <div style={{ color: "#7C93A8", fontSize: 13 }}>Customers &amp; jobs</div>
      <a href="/takeoff" style={navlink}>← Takeoff</a>
      <a href="/quotes" style={navlink}>Quotes</a>
      <a href="/orders" style={navlink}>Orders</a>
      <a href="/rules" style={navlink}>Rules</a>
      <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/login"))}
        style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #2A3F55", color: "#9DB2C6", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, cursor: "pointer" }}>
        <LogOut size={14} /> Sign out
      </button>
    </div>
  );
}

const navlink: React.CSSProperties = { marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" };
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 7, color: "#0B1B2B", marginBottom: 10 };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E6EBF0", borderRadius: 12, padding: 14 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13.5, boxSizing: "border-box" };
const addBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", background: "#0B1B2B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginTop: 2 };
const listRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "1px solid #ECF0F4", borderRadius: 8 };
const muted: React.CSSProperties = { fontSize: 12.5, color: "#B6C2CE" };
