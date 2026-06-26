// FloorIQ room-detect edge function
// Takes a blueprint image and asks Claude (vision) to propose room polygons.
// Returns candidate rooms in PIXEL coordinates so the canvas can render them
// directly for the estimator to confirm/adjust. The model proposes; the human
// disposes (areas are recomputed client-side from the confirmed polygons).
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
//   "image_height": 1400
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

  const system =
    "You are a flooring takeoff assistant. You receive an architectural floor plan image. " +
    "Identify each distinct enclosed room or floor area. For each, return a simple closed " +
    "polygon (4-8 points is plenty; trace the room's interior walls) and a short room label " +
    "such as 'Bedroom', 'Bath', 'Kitchen', 'Hall', 'Living', 'Closet'. " +
    `Coordinates MUST be in pixels for an image that is exactly ${W} wide and ${H} tall, ` +
    "origin at the top-left, x increasing to the right, y increasing downward. " +
    "Only include actual interior rooms/areas that would get flooring — skip the title " +
    "block, dimension lines, and text outside the building footprint. " +
    "Respond with ONLY a JSON object — no prose, no explanation, no markdown code fences — " +
    'of the exact form: {"rooms":[{"label":"Bedroom","points":[{"x":0,"y":0},{"x":100,"y":0},{"x":100,"y":80},{"x":0,"y":80}]}]}. ' +
    'If you cannot identify any rooms confidently, return {"rooms":[]}.';

  const payload = {
    model: "claude-opus-4-8",
    max_tokens: 8000,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: body.image_base64 },
          },
          { type: "text", text: "Detect the rooms in this floor plan and return the JSON." },
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

  // Claude returns the answer as a JSON text block. Be defensive about stray
  // prose or markdown fences before parsing.
  const textBlock = Array.isArray(data?.content)
    ? data.content.find((b: any) => b?.type === "text")
    : null;
  let raw = (textBlock?.text ?? "{}").trim();
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
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
