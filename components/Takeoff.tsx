import React, { useRef, useState, useEffect, useCallback } from "react";
import { Upload, Ruler, Pencil, Sparkles, Trash2, Check, X, Plus, Square, FileText, LogOut, Loader2 } from "lucide-react";
import { generateQuote, detectRooms } from "../lib/quoteApi";
import { supabase } from "../lib/supabaseClient";

type Pt = { x: number; y: number };
type Room = { id: string; label: string; pts: Pt[]; productId: string; ai?: boolean };
type Product = { id: string; name: string; category: "lvp" | "tile" | "carpet"; pattern: string; color: string };

/**
 * FloorIQ — Blueprint Takeoff
 * Upload a plan → calibrate scale → draw rooms (or AI-suggest) → assign products
 * from a color-coded palette → push areas to the quote-calc edge function.
 *
 * Drop-in for the FloorIQ Next.js app. Wire SUPABASE_FN_URL + a user JWT to send
 * the takeoff straight to /functions/v1/quote-calc.
 */

// ---- palette: products map to categories + a colour, MeasureSquare-style ----
const PRODUCTS: Product[] = [
  { id: "LVP-OAK-7",    name: "Heritage Oak 7\" LVP",      category: "lvp",    pattern: "standard", color: "#E4B363" },
  { id: "LVP-OAK-DIAG", name: "Heritage Oak — Diagonal",   category: "lvp",    pattern: "diagonal", color: "#C8862E" },
  { id: "TILE-PORC-12", name: "Carrara Porcelain 12x24",   category: "tile",   pattern: "standard", color: "#5BC0BE" },
  { id: "TILE-HERR",    name: "Porcelain — Herringbone",   category: "tile",   pattern: "herringbone", color: "#3A8E8C" },
  { id: "CPT-PLUSH",    name: "Beachgrass Plush Carpet",   category: "carpet", pattern: "standard", color: "#8FB339" },
  { id: "CPT-STAIR",    name: "Plush Carpet — Stairs",     category: "carpet", pattern: "stairs",   color: "#5E7B1E" },
];

const shoelace = (pts: Pt[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
};
const centroid = (pts: Pt[]): Pt => {
  const x = pts.reduce((s: number, p: Pt) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s: number, p: Pt) => s + p.y, 0) / pts.length;
  return { x, y };
};
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

// ---- PDF → image ----
// Render the first page of a PDF to an offscreen canvas and hand back both a
// PNG blob (so the AI-suggest path keeps receiving a real image) and a data URL
// (used as the <img> source feeding the canvas flow). 100% client-side via
// pdf.js — no server route.
// TODO: multi-page support — let the user pick which page to take off. For v1
// we always render page 1.
const PDF_TARGET_WIDTH = 2000;   // aim for ~2000px wide for crisp zooming
const PDF_MAX_DIM = 4000;        // hard cap so giant blueprints don't OOM the browser

async function renderPdfFirstPage(file: File): Promise<{ dataUrl: string; blob: Blob }> {
  const pdfjs = await import("pdfjs-dist");
  // Worker is served from public/ (copied from the installed pdfjs-dist by
  // scripts/copy-pdf-worker.mjs on prebuild/postinstall). Self-hosting keeps the
  // worker version-locked to the API and avoids the `new URL(...import.meta.url)`
  // bundling pattern, which breaks `next build` (SWC can't parse the worker's
  // top-level import.meta).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  if (pdf.numPages < 1) throw new Error("This PDF has no pages.");

  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  let scale = PDF_TARGET_WIDTH / base.width;
  let viewport = page.getViewport({ scale });
  // clamp so neither dimension blows past the cap (tall site plans, etc.)
  const longest = Math.max(viewport.width, viewport.height);
  if (longest > PDF_MAX_DIM) {
    scale *= PDF_MAX_DIM / longest;
    viewport = page.getViewport({ scale });
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a drawing context for the PDF.");
  ctx.fillStyle = "#fff"; // flatten any transparency to a white sheet
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Failed to rasterize the PDF page."))), "image/png")
  );
  return { dataUrl: canvas.toDataURL("image/png"), blob };
}

export default function FloorIQTakeoff({ jobId }: { jobId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  // mode: 'idle' | 'scale' | 'draw'
  const [mode, setMode] = useState("idle");
  const [scalePts, setScalePts] = useState<Pt[]>([]);      // two points for the ruler
  const [refFeet, setRefFeet] = useState(10);        // known length of the reference
  const [ftPerPx, setFtPerPx] = useState<number | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);            // {id,label,pts,productId}
  const [draftPts, setDraftPts] = useState<Pt[]>([]);      // polygon being drawn
  const [activeProduct, setActiveProduct] = useState(PRODUCTS[0].id);
  const [taxPct, setTaxPct] = useState(5);
  const [busyAI, setBusyAI] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);   // rendering a PDF page

  // ---- shared: mount a loaded <img> into the takeoff flow ----
  const adoptImage = (im: HTMLImageElement, file: File) => {
    setImgFile(file);
    setImg(im);
    setImgDims({ w: im.width, h: im.height });
    setRooms([]); setDraftPts([]); setScalePts([]); setFtPerPx(null);
    setMode("scale");
  };

  // ---- upload: images load directly; PDFs get rasterized via pdf.js first ----
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setError(null);

    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (isPdf) {
      setPdfBusy(true);
      try {
        const { dataUrl, blob } = await renderPdfFirstPage(file);
        // Hand the AI-suggest path a real PNG instead of the raw PDF bytes.
        const pngFile = new File([blob], file.name.replace(/\.pdf$/i, "") + ".png", { type: "image/png" });
        const im = new Image();
        im.onload = () => { adoptImage(im, pngFile); setPdfBusy(false); };
        im.onerror = () => { setError("Rendered the PDF but could not load the image."); setPdfBusy(false); };
        im.src = dataUrl;
      } catch (err: any) {
        setError(err?.message ? `Couldn't open that PDF: ${err.message}` : "Couldn't open that PDF. Is it a valid file?");
        setPdfBusy(false);
      }
      return;
    }

    // images: original path
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => adoptImage(im, file);
    im.onerror = () => setError("Couldn't load that image file.");
    im.src = url;
  };

  // ---- canvas drawing ----
  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (img) ctx.drawImage(img, 0, 0, c.width, c.height);

    // committed rooms
    rooms.forEach((r: Room) => {
      const prod = PRODUCTS.find((p: Product) => p.id === r.productId);
      const col = prod?.color ?? "#888";
      ctx.beginPath();
      r.pts.forEach((p: Pt, i: number) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = col + "66";
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.fill(); ctx.stroke();
      if (ftPerPx) {
        const ct = centroid(r.pts);
        const sf = (shoelace(r.pts) * ftPerPx * ftPerPx);
        ctx.fillStyle = "#0B1B2B";
        ctx.font = "600 13px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(r.label, ct.x, ct.y - 6);
        ctx.fillText(`${sf.toFixed(0)} sf`, ct.x, ct.y + 12);
      }
    });

    // draft polygon
    if (draftPts.length) {
      ctx.beginPath();
      draftPts.forEach((p: Pt, i: number) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = "#1F6FEB";
      ctx.lineWidth = 2;
      ctx.stroke();
      draftPts.forEach((p: Pt) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#1F6FEB"; ctx.fill();
      });
    }

    // scale ruler
    if (scalePts.length) {
      ctx.beginPath();
      scalePts.forEach((p: Pt, i: number) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = "#E4572E"; ctx.lineWidth = 3; ctx.stroke();
      scalePts.forEach((p: Pt) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#E4572E"; ctx.fill();
      });
    }
  }, [img, rooms, draftPts, scalePts, ftPerPx]);

  useEffect(() => { redraw(); }, [redraw]);

  const canvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Pt => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!img) return;
    const pt = canvasPoint(e);
    if (mode === "scale") {
      const next = [...scalePts, pt].slice(-2);
      setScalePts(next);
      if (next.length === 2) {
        const px = dist(next[0], next[1]);
        setFtPerPx(px > 0 ? refFeet / px : null);
      }
    } else if (mode === "draw") {
      // close polygon if clicking near the first point
      if (draftPts.length >= 3 && dist(pt, draftPts[0]) < 12) {
        commitRoom();
      } else {
        setDraftPts([...draftPts, pt]);
      }
    }
  };

  const commitRoom = () => {
    if (draftPts.length < 3) return;
    const n = rooms.length + 1;
    setRooms([...rooms, { id: crypto.randomUUID(), label: `Room ${n}`, pts: draftPts, productId: activeProduct }]);
    setDraftPts([]);
  };

  const recomputeScale = (feet: number) => {
    setRefFeet(feet);
    if (scalePts.length === 2) {
      const px = dist(scalePts[0], scalePts[1]);
      setFtPerPx(px > 0 ? feet / px : null);
    }
  };

  // ---- AI suggest (stub wired for the vision endpoint) ----
  // In production this POSTs the image to a Supabase edge function that runs a
  // vision model and returns candidate room polygons (pixel coords). Here we
  // generate plausible rectangles so the flow is testable without a key.
  const aiSuggest = async () => {
    if (!img || !imgFile) return;
    setBusyAI(true); setError(null);
    try {
      // read the uploaded file as base64 (strip the data: prefix)
      const base64: string = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(",")[1] ?? "");
        fr.onerror = () => rej(new Error("Could not read image"));
        fr.readAsDataURL(imgFile);
      });
      const detected = await detectRooms(base64, imgFile.type || "image/jpeg", imgDims.w, imgDims.h);
      if (detected.length === 0) {
        setError("No rooms detected. Try drawing them manually.");
      } else {
        const newRooms: Room[] = detected.map((d, i) => ({
          id: crypto.randomUUID(),
          label: d.label || `Room ${i + 1}`,
          productId: PRODUCTS[i % PRODUCTS.length].id,
          pts: d.points,
          ai: true,
        }));
        setRooms((r) => [...r, ...newRooms]);
      }
    } catch (e: any) {
      setError(e.message ?? "AI detection failed");
    } finally {
      setBusyAI(false);
    }
  };

  // ---- build the quote-calc payload ----
  const lines = rooms.map((r) => {
    const prod = PRODUCTS.find((p: Product) => p.id === r.productId);
    const sf = ftPerPx ? shoelace(r.pts) * ftPerPx * ftPerPx : 0;
    return {
      category: prod?.category ?? "lvp",
      product_id: r.productId,
      room_label: r.label,
      net_area: +sf.toFixed(2),
      pattern: prod?.pattern ?? "standard",
    };
  });
  const totalSf = lines.reduce((s, l) => s + l.net_area, 0);

  const payloadPreview = JSON.stringify(
    { job_id: "<job-uuid>", tax_pct: taxPct, lines }, null, 2
  );

  const C = {
    bg: "#0B1B2B", panel: "#11263B", ink: "#0B1B2B", line: "#1E3A52",
    accent: "#1F6FEB", soft: "#7C93A8", paper: "#F4F6F8",
  };

  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui", background: C.paper, minHeight: "100vh", color: C.ink }}>
      {/* top bar */}
      <div style={{ background: C.bg, color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <Square size={20} color="#5BC0BE" fill="#5BC0BE" />
        <div style={{ fontWeight: 700, letterSpacing: 0.3 }}>FloorIQ</div>
        <div style={{ color: "#7C93A8", fontSize: 13 }}>Blueprint Takeoff</div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: ftPerPx ? "#5BC0BE" : "#E4572E" }}>
          {ftPerPx ? `Scale set · ${(1 / ftPerPx).toFixed(1)} px/ft` : "Scale not set"}
        </div>
        <a href="/jobs" style={{ marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>Jobs</a>
        <a href="/orders" style={{ marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>Orders</a>
        <a href="/rules" style={{ marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>Rules</a>
        <a href="/quotes" style={{ marginLeft: 14, color: "#9DB2C6", fontSize: 13, textDecoration: "none" }}>Quotes →</a>
        <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/login"))}
          style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #2A3F55", color: "#9DB2C6", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, cursor: "pointer" }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 320px", gap: 0, height: "calc(100vh - 50px)" }}>
        {/* LEFT: tools + palette */}
        <div style={{ background: "#fff", borderRight: `1px solid #E2E8F0`, padding: 16, overflowY: "auto" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", padding: "10px 12px", background: C.bg, color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            <Upload size={16} /> Upload plan
            <input type="file" accept="image/*,application/pdf" onChange={onUpload} style={{ display: "none" }} />
          </label>

          <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, color: C.soft, textTransform: "uppercase", letterSpacing: 0.6 }}>Tools</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <ToolBtn icon={<Ruler size={16} />} label="Set scale" active={mode === "scale"} onClick={() => { setMode("scale"); setScalePts([]); }} disabled={!img} />
            <ToolBtn icon={<Pencil size={16} />} label="Draw room" active={mode === "draw"} onClick={() => setMode("draw")} disabled={!img || !ftPerPx} />
            <ToolBtn icon={busyAI ? <Sparkles size={16} className="spin" /> : <Sparkles size={16} />} label={busyAI ? "Detecting…" : "AI suggest rooms"} onClick={aiSuggest} disabled={!img || !ftPerPx || busyAI} />
          </div>

          {mode === "scale" && (
            <div style={{ marginTop: 14, padding: 12, background: "#FFF4EF", border: "1px solid #F3C9B8", borderRadius: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Click two points on a known dimension.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                length
                <input type="number" value={refFeet} min={1} onChange={(e) => recomputeScale(+e.target.value)}
                  style={{ width: 64, padding: "4px 6px", border: "1px solid #ddd", borderRadius: 6 }} /> ft
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, color: C.soft, textTransform: "uppercase", letterSpacing: 0.6 }}>Product palette</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {PRODUCTS.map((p) => (
              <button key={p.id} onClick={() => setActiveProduct(p.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  border: activeProduct === p.id ? `2px solid ${C.accent}` : "1px solid #E2E8F0", background: activeProduct === p.id ? "#F0F6FF" : "#fff" }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: C.soft, fontSize: 11 }}>{p.category} · {p.pattern}</div>
                </span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: C.soft }}>
            Pick a product, then draw or click a room to assign it.
          </div>
        </div>

        {/* CENTER: canvas */}
        <div ref={wrapRef} style={{ background: "#1A2A3A", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", padding: 16 }}>
          {pdfBusy && !img ? (
            <div style={{ color: "#7C93A8", textAlign: "center" }}>
              <Loader2 size={40} className="spin" style={{ opacity: 0.7 }} />
              <div style={{ marginTop: 10 }}>Rendering page 1 of PDF…</div>
            </div>
          ) : !img ? (
            <div style={{ color: "#7C93A8", textAlign: "center" }}>
              <FileText size={40} style={{ opacity: 0.5 }} />
              <div style={{ marginTop: 10 }}>Upload a blueprint to begin.</div>
              {error && <div style={{ marginTop: 10, color: "#E4572E", fontSize: 13, maxWidth: 320 }}>{error}</div>}
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                width={imgDims.w}
                height={imgDims.h}
                onClick={onCanvasClick}
                style={{ maxWidth: "100%", maxHeight: "100%", background: "#fff", cursor: mode === "idle" ? "default" : "crosshair", boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}
              />
              {pdfBusy && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, background: "rgba(11,27,43,0.55)", color: "#fff", fontSize: 14 }}>
                  <Loader2 size={28} className="spin" /> Rendering page 1 of PDF…
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: rooms + quote */}
        <div style={{ background: "#fff", borderLeft: "1px solid #E2E8F0", padding: 16, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.soft, textTransform: "uppercase", letterSpacing: 0.6 }}>Rooms ({rooms.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {rooms.length === 0 && <div style={{ fontSize: 13, color: C.soft }}>No rooms yet. Draw one or run AI suggest.</div>}
            {rooms.map((r) => {
              const prod = PRODUCTS.find((p: Product) => p.id === r.productId);
              const sf = ftPerPx ? shoelace(r.pts) * ftPerPx * ftPerPx : 0;
              return (
                <div key={r.id} style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: prod?.color }} />
                    <input value={r.label}
                      onChange={(e) => setRooms(rooms.map((x) => x.id === r.id ? { ...x, label: e.target.value } : x))}
                      style={{ border: "none", fontWeight: 600, fontSize: 14, flex: 1, outline: "none" }} />
                    {r.ai && <span style={{ fontSize: 10, color: "#1F6FEB", background: "#EAF2FF", padding: "2px 6px", borderRadius: 10 }}>AI</span>}
                    <button onClick={() => setRooms(rooms.filter((x) => x.id !== r.id))} style={{ border: "none", background: "none", cursor: "pointer", color: "#C0392B" }}><Trash2 size={15} /></button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 13, color: C.soft }}>
                    <select value={r.productId} onChange={(e) => setRooms(rooms.map((x) => x.id === r.id ? { ...x, productId: e.target.value } : x))}
                      style={{ fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 6, padding: "2px 4px" }}>
                      {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span style={{ fontWeight: 700, color: C.ink }}>{sf.toFixed(0)} sf</span>
                  </div>
                </div>
              );
            })}
          </div>

          {draftPts.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button onClick={commitRoom} disabled={draftPts.length < 3}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 8, background: "#1F6FEB", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: draftPts.length < 3 ? 0.5 : 1 }}>
                <Check size={15} /> Close room
              </button>
              <button onClick={() => setDraftPts([])} style={{ padding: 8, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, cursor: "pointer" }}><X size={15} /></button>
            </div>
          )}

          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: C.soft }}>Total area</span>
              <span style={{ fontWeight: 700 }}>{totalSf.toFixed(0)} sf</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 14 }}>
              <span style={{ color: C.soft }}>Tax %</span>
              <input type="number" value={taxPct} onChange={(e) => setTaxPct(+e.target.value)} style={{ width: 60, padding: "4px 6px", border: "1px solid #E2E8F0", borderRadius: 6 }} />
            </div>
            <button disabled={!ftPerPx || rooms.length === 0}
              onClick={async () => {
                setSubmitting(true); setError(null); setResult(null);
                try {
                  const r = await generateQuote(jobId, lines as any, taxPct);
                  setResult(r.quote);
                } catch (e: any) { setError(e.message ?? "Quote failed"); }
                finally { setSubmitting(false); }
              }}
              style={{ width: "100%", marginTop: 12, padding: 12, background: !ftPerPx || rooms.length === 0 ? "#9DB2C6" : "#0B1B2B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: !ftPerPx || rooms.length === 0 ? "not-allowed" : "pointer", display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
              {submitting ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} {submitting ? "Generating…" : "Generate quote"}
            </button>
            {error && <div style={{ marginTop: 10, color: "#C0392B", fontSize: 13 }}>{error}</div>}
            {result && (
              <div style={{ marginTop: 12, padding: 12, background: "#EAF7F0", border: "1px solid #BFE3CF", borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#0B1B2B" }}>Quote v{result.version} created</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}><span>Subtotal</span><span>${result.subtotal.toFixed(2)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Tax ({result.tax_pct}%)</span><span>${result.tax_amount.toFixed(2)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, marginTop: 4 }}><span>Total</span><span>${result.total.toFixed(2)}</span></div>
                <a href="/quotes" style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: "#1F6FEB", textDecoration: "none", fontWeight: 600 }}>View in pipeline →</a>
              </div>
            )}
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 12, color: C.soft, cursor: "pointer" }}>Preview payload → quote-calc</summary>
              <pre style={{ fontSize: 10.5, background: "#0B1B2B", color: "#C8E1FF", padding: 10, borderRadius: 8, overflowX: "auto", marginTop: 6 }}>{payloadPreview}</pre>
            </details>
          </div>
        </div>
      </div>

      <style>{`.spin{animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function ToolBtn({ icon, label, active, onClick, disabled }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, fontSize: 14, fontWeight: 600,
        border: active ? "2px solid #1F6FEB" : "1px solid #E2E8F0",
        background: active ? "#F0F6FF" : "#fff",
        color: disabled ? "#B0BEC9" : "#0B1B2B",
        cursor: disabled ? "not-allowed" : "pointer" }}>
      {icon} {label}
    </button>
  );
}
