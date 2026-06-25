"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback } from "react";
import { listQuotes, setQuoteStatus, getQuoteLines, convertQuoteToOrder, QuoteRow, QuoteStatus } from "../../lib/quoteApi";
import { supabase } from "../../lib/supabaseClient";
import { Square, FileDown, Send, Check, X, RotateCcw, ChevronRight, LogOut, Package } from "lucide-react";

const STATUS_META: Record<QuoteStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "#5B6B7B", bg: "#EEF2F6" },
  sent:  { label: "Sent",  color: "#1F6FEB", bg: "#EAF2FF" },
  won:   { label: "Won",   color: "#1E8E3E", bg: "#E7F6EC" },
  lost:  { label: "Lost",  color: "#C0392B", bg: "#FDEDEC" },
};
const COLUMNS: QuoteStatus[] = ["draft", "sent", "won", "lost"];

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openQuote, setOpenQuote] = useState<QuoteRow | null>(null);
  const [lines, setLines] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setQuotes(await listQuotes()); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [converting, setConverting] = useState<string | null>(null);
  const [convertedMsg, setConvertedMsg] = useState<string | null>(null);

  async function convert(q: QuoteRow) {
    setConverting(q.id); setErr(null); setConvertedMsg(null);
    try {
      const o = await convertQuoteToOrder(q.id);
      setConvertedMsg(`Order ${o.order_number} created.`);
    } catch (e: any) { setErr(e.message); }
    finally { setConverting(null); }
  }

  async function move(q: QuoteRow, to: QuoteStatus) {
    try { await setQuoteStatus(q.id, to); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  async function openDetail(q: QuoteRow) {
    setOpenQuote(q);
    setLines(await getQuoteLines(q.id));
  }

  function actionsFor(q: QuoteRow) {
    switch (q.status) {
      case "draft": return [{ to: "sent" as const, label: "Send", icon: <Send size={14} /> }];
      case "sent":  return [
        { to: "won" as const, label: "Won", icon: <Check size={14} /> },
        { to: "lost" as const, label: "Lost", icon: <X size={14} /> },
        { to: "draft" as const, label: "Revise", icon: <RotateCcw size={14} /> },
      ];
      case "won":
      case "lost": return [{ to: "sent" as const, label: "Reopen", icon: <RotateCcw size={14} /> }];
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "ui-sans-serif, system-ui" }}>
      <div style={{ background: "#0B1B2B", color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <Square size={20} color="#5BC0BE" fill="#5BC0BE" />
        <div style={{ fontWeight: 700 }}>FloorIQ</div>
        <div style={{ color: "#7C93A8", fontSize: 13 }}>Quote pipeline</div>
        <a href="/takeoff" style={{ marginLeft: "auto", color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>← Takeoff</a>
        <a href="/jobs" style={{ marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>Jobs</a>
        <a href="/orders" style={{ marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>Orders</a>
        <a href="/rules" style={{ marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>Rules</a>
        <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/login"))}
          style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #2A3F55", color: "#9DB2C6", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, cursor: "pointer" }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {err && <div style={{ background: "#FDEDEC", color: "#C0392B", padding: "8px 20px", fontSize: 13 }}>{err}</div>}
      {convertedMsg && <div style={{ background: "#E7F6EC", color: "#1E8E3E", padding: "8px 20px", fontSize: 13 }}>{convertedMsg} <a href="/orders" style={{ color: "#1E8E3E", fontWeight: 700 }}>View orders →</a></div>}

      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {COLUMNS.map((col) => {
          const items = quotes.filter((q) => q.status === col);
          const m = STATUS_META[col];
          return (
            <div key={col} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6EBF0", minHeight: 200 }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #EEF2F6", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: m.color }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{m.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#94A3B8" }}>{items.length}</span>
              </div>
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {loading && <div style={{ fontSize: 13, color: "#94A3B8" }}>Loading…</div>}
                {!loading && items.length === 0 && <div style={{ fontSize: 12.5, color: "#B6C2CE" }}>Empty</div>}
                {items.map((q) => (
                  <div key={q.id} style={{ border: "1px solid #ECF0F4", borderRadius: 9, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <button onClick={() => openDetail(q)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 600, fontSize: 13.5 }}>
                        Quote v{q.version} <ChevronRight size={13} />
                      </button>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>${q.total.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 2 }}>{new Date(q.created_at).toLocaleDateString()}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {actionsFor(q)!.map((a) => (
                        <button key={a.to} onClick={() => move(q, a.to)}
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 8px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", cursor: "pointer" }}>
                          {a.icon}{a.label}
                        </button>
                      ))}
                      {q.status === "won" && (
                        <button onClick={() => convert(q)} disabled={converting === q.id}
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 8px", borderRadius: 7, border: "none", background: "#1E8E3E", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                          <Package size={13} />{converting === q.id ? "Converting…" : "Convert to order"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {openQuote && (
        <QuoteDetail quote={openQuote} lines={lines} onClose={() => setOpenQuote(null)} />
      )}
    </div>
  );
}

function QuoteDetail({ quote, lines, onClose }: { quote: QuoteRow; lines: any[]; onClose: () => void }) {
  const m = STATUS_META[quote.status];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,27,43,.55)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} id="quote-print"
        style={{ width: 640, maxHeight: "85vh", overflowY: "auto", background: "#fff", borderRadius: 14, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Square size={20} color="#5BC0BE" fill="#5BC0BE" />
          <div style={{ fontWeight: 800, fontSize: 18 }}>FloorIQ Quote</div>
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: m.color, background: m.bg, padding: "3px 10px", borderRadius: 20 }}>{m.label}</span>
        </div>
        <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>Version {quote.version} · {new Date(quote.created_at).toLocaleDateString()}</div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18, fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0B1B2B", color: "#fff", textAlign: "left" }}>
              <th style={th}>Room</th><th style={th}>Cat</th><th style={thR}>Net sf</th>
              <th style={thR}>Waste</th><th style={thR}>Gross sf</th><th style={thR}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ background: i % 2 ? "#F7FAFC" : "#fff" }}>
                <td style={td}>{l.room_label ?? "—"}</td>
                <td style={td}>{l.category}</td>
                <td style={tdR}>{Number(l.net_area).toFixed(0)}</td>
                <td style={tdR}>{Number(l.waste_pct).toFixed(0)}%</td>
                <td style={tdR}>{Number(l.gross_area).toFixed(0)}</td>
                <td style={tdR}>${Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, marginLeft: "auto", width: 240 }}>
          <Row label="Subtotal" val={`$${quote.subtotal.toFixed(2)}`} />
          <Row label={`Tax (${quote.tax_pct}%)`} val={`$${quote.tax_amount.toFixed(2)}`} />
          <Row label="Total" val={`$${quote.total.toFixed(2)}`} strong />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }} className="no-print">
          <button onClick={() => window.print()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "#0B1B2B", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, cursor: "pointer" }}>
            <FileDown size={15} /> Download PDF
          </button>
          <button onClick={onClose} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 9, cursor: "pointer" }}>Close</button>
        </div>
      </div>
      <style>{`@media print {
        body * { visibility: hidden; }
        #quote-print, #quote-print * { visibility: visible; }
        #quote-print { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; }
        .no-print { display: none !important; }
      }`}</style>
    </div>
  );
}

function Row({ label, val, strong }: { label: string; val: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: strong ? 16 : 13.5, fontWeight: strong ? 800 : 500, borderTop: strong ? "2px solid #0B1B2B" : "none", marginTop: strong ? 4 : 0, paddingTop: strong ? 8 : 4 }}>
      <span style={{ color: strong ? "#0B1B2B" : "#64748B" }}>{label}</span><span>{val}</span>
    </div>
  );
}
const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11.5, fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "7px 10px", borderBottom: "1px solid #EEF2F6" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
