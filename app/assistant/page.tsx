"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { askSpec, syncCatalogEmbeddings, SpecSource } from "../../lib/quoteApi";
import Nav from "../../components/Nav";
import { Sparkles, RefreshCw, Send, FileText } from "lucide-react";

interface Msg { role: "user" | "assistant"; text: string; sources?: SpecSource[]; }

export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function ask() {
    const question = q.trim();
    if (!question) return;
    setMsgs(m => [...m, { role: "user", text: question }]);
    setQ(""); setBusy(true); setErr(null);
    try {
      const r = await askSpec(question);
      setMsgs(m => [...m, { role: "assistant", text: r.answer, sources: r.sources }]);
    } catch (e: any) {
      setErr(e.message);
    } finally { setBusy(false); }
  }

  async function sync() {
    setSyncing(true); setErr(null); setNote(null);
    try {
      const r = await syncCatalogEmbeddings();
      setNote(`Catalog synced — ${r.embedded} product(s) embedded (of ${r.total}).`);
    } catch (e: any) { setErr(e.message); }
    finally { setSyncing(false); }
  }

  const examples = [
    "What's the wear layer on the Heritage Oak LVP?",
    "Which products are good for a bathroom?",
    "What's the warranty on the plush carpet?",
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "ui-sans-serif, system-ui", display: "flex", flexDirection: "column" }}>
      <Nav active="/assistant" />
      {err && <div style={{ background: "#FDEDEC", color: "#C0392B", padding: "7px 20px", fontSize: 13 }}>{err}</div>}
      {note && <div style={{ background: "#E7F6EC", color: "#1E8E3E", padding: "7px 20px", fontSize: 13 }}>{note}</div>}

      <div style={{ maxWidth: 760, width: "100%", margin: "0 auto", padding: 22, flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, color: "#0B1B2B", margin: 0 }}>
            <Sparkles size={18} color="#5BC0BE" /> Product spec assistant
          </h2>
          <button onClick={sync} disabled={syncing}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <RefreshCw size={14} className={syncing ? "spin" : ""} /> {syncing ? "Syncing…" : "Sync catalog"}
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>
          Ask about any product in your catalog. Answers come only from your own product data, with sources cited.
          Run <b>Sync catalog</b> once (and after adding products) to index them.
        </p>

        <div style={{ flex: 1, background: "#fff", border: "1px solid #E6EBF0", borderRadius: 12, padding: 16, marginTop: 8, overflowY: "auto", minHeight: 300, display: "flex", flexDirection: "column", gap: 12 }}>
          {msgs.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", color: "#94A3B8" }}>
              <Sparkles size={28} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 10, fontSize: 13.5 }}>Ask a product question to get started.</div>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                {examples.map((ex, i) => (
                  <button key={i} onClick={() => setQ(ex)} style={{ fontSize: 12.5, color: "#1F6FEB", background: "#F0F6FF", border: "1px solid #DBEAFE", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>{ex}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "82%", padding: "10px 13px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.5,
                background: m.role === "user" ? "#0B1B2B" : "#F1F5F9", color: m.role === "user" ? "#fff" : "#0B1B2B" }}>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                {m.sources && m.sources.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #DDE5EC", display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {m.sources.map(s => (
                      <span key={s.n} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#475569", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 20, padding: "2px 8px" }}>
                        <FileText size={11} />[{s.n}] {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div style={{ color: "#94A3B8", fontSize: 13 }}>Thinking…</div>}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()}
            placeholder="Ask about a product…" style={{ flex: 1, padding: "11px 13px", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 14 }} />
          <button onClick={ask} disabled={busy || !q.trim()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "11px 16px", background: busy || !q.trim() ? "#9DB2C6" : "#0B1B2B", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: busy || !q.trim() ? "not-allowed" : "pointer" }}>
            <Send size={15} /> Ask
          </button>
        </div>
      </div>
      <style>{`.spin{animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
