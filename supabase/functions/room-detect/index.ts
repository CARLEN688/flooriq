// FloorIQ room-detect edge function
// Takes a blueprint image (and, if known, the drawing scale) and asks Claude
// (vision, with deliberate reasoning) to trace each floored area as a polygon
// that follows the interior wall faces. Returns candidate rooms in PIXEL
// coordinates so the canvas can render them directly for the estimator to
// confirm/adjust. The model proposes; the human disposes (areas are recomputed
// client-side from the confirmed polygons).
//
// Requires the ANTHROPIC_API_KEY secret:
//   Supabase dashboard -> Project Settings -> Edge Functions -> Secrets
//   (or: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...)
//
// POST body:
// {
//   "image_base64": "<data without the data: prefix>",
//   "media_type": "image/png" | "image/jpeg",
//   "image_width": 2000,    // natural px width the coords should map to
//   "image_height": 1400,
//   "ft_per_px": 0.0452     // optional: feet per pixel (from the Set-scale tool)
// }
//
// Response: { ok, rooms: [{ label, points: [{x,y}, ...] }] }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface DetectReq {
  image_base64: string;
  media_type?: string;
  image_width: number;
  image_height: number;
  ft_per_px?: number | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({
      error: "AI room detection isn't configured. Add the ANTHROPIC_API_KEY secret to enable it.",
      code: "no_api_key",
    }, 501);
  }

  let body: DetectReq;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  if (!body.image_base64 || !body.image_width || !body.image_height) {
    return json({ error: "image_base64, image_width and image_height are required" }, 400);
  }

  // Anthropic vision accepts png/jpeg/gif/webp; normalise common aliases.
  let mediaType = (body.media_type || "image/png").toLowerCase();
  if (mediaType === "image/jpg") mediaType = "image/jpeg";
  if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mediaType)) {
    mediaType = "image/png";
  }
  const W = Math.round(body.image_width);
  const H = Math.round(body.image_height);

  // If the estimator has set the scale, give the model pixels-per-foot so it can
  // turn the plan's printed room dimensions into accurate pixel sizes.
  const pxPerFt = body.ft_per_px && body.ft_per_px > 0 ? 1 / body.ft_per_px : null;
  const scaleLine = pxPerFt
    ? `The drawing scale is approximately ${pxPerFt.toFixed(2)} pixels per foot. Many rooms have ` +
      "their dimensions printed on the plan (e.g. \"12'10\\\"x12'\", \"10'4\\\"x9'6\\\"\"). Use those " +
      "printed dimensions together with this scale to size each room's polygon accurately in pixels. "
    : "Many rooms have their dimensions printed on the plan; use them to keep proportions accurate. ";

  const system =
    "You are an expert flooring-takeoff estimator analyzing an architectural floor plan image. " +
    "Your job is to trace each distinct floored area as a polygon whose vertices follow the INTERIOR " +
    "faces of that room's walls, so the enclosed area matches the real room as closely as possible.\n\n" +
    "Rules:\n" +
    "- Identify every enclosed interior space that receives flooring: bedrooms, living, dining, kitchen, " +
    "bathrooms, halls, closets, laundry, pantries, mechanical rooms, entries, stairs landings, etc. Read the " +
    "printed room name for the label. Skip the title block, the legend/notes, exterior dimension strings, the " +
    "north arrow, and anything outside the building footprint.\n" +
    "- Trace TIGHT to the walls. For a rectangular room return its 4 corners at the inside wall faces. For an " +
    "L-shaped or irregular room add the extra corners needed (typically 6-12 points) so the outline hugs the " +
    "walls. Never return a loose bounding box that bleeds across a wall into the next room.\n" +
    "- Adjacent rooms share a wall, so their polygons must NOT overlap. Put each room's boundary at the inside " +
    "face of the dividing wall, leaving the wall thickness between two neighboring rooms.\n" +
    "- Follow the actual drawn wall lines, not the dimension/annotation lines. Doorway openings can be treated " +
    "as part of the wall line (close across them).\n" +
    scaleLine +
    `- Coordinates are pixels for an image that is exactly ${W} wide and ${H} tall, origin at the top-left, ` +
    `x increasing right, y increasing down. Keep every point within 0..${W} (x) and 0..${H} (y).\n\n` +
    "Think step by step about where each wall sits, then output. Respond with ONLY a JSON object — no prose, " +
    "no explanation, no markdown code fences — of the exact form: " +
    '{"rooms":[{"label":"Bedroom","points":[{"x":0,"y":0},{"x":100,"y":0},{"x":100,"y":80},{"x":0,"y":80}]}]}. ' +
    'If you cannot identify any rooms confidently, return {"rooms":[]}.';

  const payload = {
    model: "claude-opus-4-8",
    max_tokens: 16000,
    // Deliberate reasoning meaningfully improves spatial accuracy on dense plans.
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: body.image_base64 },
          },
          { type: "text", text: "Trace the rooms in this floor plan and return the JSON." },
        ],
      },
    ],
  };

  let aiResp: Response;
  try {
    aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: "Vision request failed", detail: String(e) }, 502);
  }

  if (!aiResp.ok) {
    const t = await aiResp.text();
    // Surface Anthropic's actual message so the UI shows the real cause.
    return json({ error: `Vision API error (${aiResp.status}): ${t.slice(0, 300)}`, code: "vision_error" }, 502);
  }

  const data = await aiResp.json();

  if (data?.stop_reason === "refusal") {
    return json({ error: "The model declined to analyze this image. Try drawing rooms manually." }, 502);
  }

  // The answer is JSON in one or more text blocks (thinking blocks are separate).
  // Join all text, then defensively strip prose/fences before parsing.
  const textBlocks = Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text ?? "")
    : [];
  let raw = textBlocks.join("\n").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) raw = fence[1].trim();
  if (!raw.startsWith("{")) {
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  }

  let parsed: { rooms?: Array<{ label?: string; points?: Array<{ x: number; y: number }> }> };
  try { parsed = JSON.parse(raw); }
  catch { return json({ error: "Model returned non-JSON", raw: String(raw).slice(0, 500) }, 502); }

  // Sanitize: clamp points into bounds, drop degenerate polygons.
  const rooms = (parsed.rooms ?? [])
    .map((r) => ({
      label: (r.label ?? "Room").toString().slice(0, 40),
      points: (r.points ?? [])
        .filter((p) => typeof p?.x === "number" && typeof p?.y === "number")
        .map((p) => ({
          x: Math.min(Math.max(Math.round(p.x), 0), W),
          y: Math.min(Math.max(Math.round(p.y), 0), H),
        })),
    }))
    .filter((r) => r.points.length >= 3);

  return json({ ok: true, rooms });
});
