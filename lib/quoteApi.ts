"use client";
import { supabase } from "./supabaseClient";

export interface TakeoffLine {
  category: "lvp" | "tile" | "carpet";
  product_id?: string | null;
  room_label?: string | null;
  net_area: number;
  pattern?: string | null;
  unit_cost_override?: number | null;
  margin_pct_override?: number | null;
}

export interface QuoteResult {
  ok: boolean;
  quote: {
    id: string; job_id: string; version: number; status: string;
    subtotal: number; tax_pct: number; tax_amount: number; total: number;
  };
  lines: any[];
}

// Calls the deployed quote-calc edge function with the signed-in user's JWT.
export async function generateQuote(
  jobId: string,
  lines: TakeoffLine[],
  taxPct = 5,
  notes?: string
): Promise<QuoteResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/quote-calc`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ job_id: jobId, tax_pct: taxPct, notes, lines }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Quote failed (${res.status})`);
  return body as QuoteResult;
}

// --- Onboarding ---
export async function createStoreAndJoin(name: string, region?: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_store_and_join", {
    store_name: name, store_region: region ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_profiles").select("id, store_id, role, full_name").eq("id", user.id).single();
  return data;
}

// --- Pipeline ---
export type QuoteStatus = "draft" | "sent" | "won" | "lost";

export async function setQuoteStatus(quoteId: string, status: QuoteStatus) {
  const { data, error } = await supabase.rpc("set_quote_status", {
    quote_id: quoteId, new_status: status,
  });
  if (error) throw new Error(error.message);
  return data;
}

export interface QuoteRow {
  id: string; job_id: string; version: number; status: QuoteStatus;
  subtotal: number; tax_pct: number; tax_amount: number; total: number;
  notes: string | null; created_at: string;
}

export async function listQuotes(): Promise<QuoteRow[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("id, job_id, version, status, subtotal, tax_pct, tax_amount, total, notes, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QuoteRow[];
}

export async function getQuoteLines(quoteId: string) {
  const { data, error } = await supabase
    .from("quote_lines")
    .select("room_label, category, net_area, waste_pct, gross_area, unit_cost, labour_rate, margin_pct, line_total")
    .eq("quote_id", quoteId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// --- Rules editing (pricing + waste) ---
export interface PricingRule {
  id: string; category: "lvp" | "tile" | "carpet";
  base_material_cost: number; labour_rate: number; default_margin_pct: number;
}
export interface WasteRule {
  id: string; category: "lvp" | "tile" | "carpet"; pattern: string; waste_pct: number;
}

export async function listPricingRules(): Promise<PricingRule[]> {
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("id, category, base_material_cost, labour_rate, default_margin_pct")
    .eq("active", true)
    .order("category");
  if (error) throw new Error(error.message);
  return (data ?? []) as PricingRule[];
}

export async function listWasteRules(): Promise<WasteRule[]> {
  const { data, error } = await supabase
    .from("waste_rules")
    .select("id, category, pattern, waste_pct")
    .eq("active", true)
    .order("category");
  if (error) throw new Error(error.message);
  return (data ?? []) as WasteRule[];
}

export async function updatePricingRule(id: string, patch: Partial<Omit<PricingRule, "id" | "category">>) {
  const { error } = await supabase.from("pricing_rules").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateWasteRule(id: string, patch: { waste_pct: number }) {
  const { error } = await supabase.from("waste_rules").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addWasteRule(storeId: string, category: WasteRule["category"], pattern: string, waste_pct: number) {
  const { data, error } = await supabase
    .from("waste_rules")
    .insert({ store_id: storeId, category, pattern, waste_pct, active: true })
    .select("id, category, pattern, waste_pct").single();
  if (error) throw new Error(error.message);
  return data as WasteRule;
}

// --- AI room detection (vision) ---
export interface DetectedRoom { label: string; points: { x: number; y: number }[]; }

export async function detectRooms(
  imageBase64: string, mediaType: string, width: number, height: number
): Promise<DetectedRoom[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/room-detect`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ image_base64: imageBase64, media_type: mediaType, image_width: width, image_height: height }),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.code === "no_api_key"
      ? "AI detection isn't configured yet (add the ANTHROPIC_API_KEY secret). Drawing rooms manually still works."
      : (body?.error ?? `Detection failed (${res.status})`);
    throw new Error(msg);
  }
  return (body.rooms ?? []) as DetectedRoom[];
}

// --- Customers ---
export interface Customer {
  id: string; name: string; type: "builder" | "retail";
  contact_email: string | null; contact_phone: string | null;
}
export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers").select("id, name, type, contact_email, contact_phone")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Customer[];
}
export async function addCustomer(storeId: string, c: Omit<Customer, "id">) {
  const { data, error } = await supabase.from("customers")
    .insert({ store_id: storeId, ...c }).select("id, name, type, contact_email, contact_phone").single();
  if (error) throw new Error(error.message);
  return data as Customer;
}

// --- Jobs ---
export interface Job {
  id: string; title: string | null; address: string | null;
  status: string; customer_id: string | null; created_at: string;
}
export async function listJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs").select("id, title, address, status, customer_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Job[];
}
export async function addJob(storeId: string, j: { title: string; address?: string; customer_id?: string | null }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("jobs")
    .insert({ store_id: storeId, title: j.title, address: j.address ?? null, customer_id: j.customer_id ?? null, status: "quoting", created_by: user?.id })
    .select("id, title, address, status, customer_id, created_at").single();
  if (error) throw new Error(error.message);
  return data as Job;
}

// --- Orders ---
export interface Order {
  id: string; order_number: string; status: string; total: number;
  job_id: string; quote_id: string; created_at: string;
}
export async function convertQuoteToOrder(quoteId: string): Promise<Order> {
  const { data, error } = await supabase.rpc("convert_quote_to_order", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return data as Order;
}
export async function listOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders").select("id, order_number, status, total, job_id, quote_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}
export async function setOrderStatus(orderId: string, status: string) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);
}

// ===== Phase 2 ops =====

// --- Crews & installs ---
export interface Crew { id: string; name: string; capacity_sqft_per_day: number; }
export interface Install {
  id: string; order_id: string | null; crew_id: string | null;
  title: string | null; address: string | null; scheduled_date: string | null;
  est_sqft: number; status: string;
}
export async function listCrews(): Promise<Crew[]> {
  const { data, error } = await supabase.from("crews").select("id, name, capacity_sqft_per_day").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Crew[];
}
export async function addCrew(storeId: string, name: string, capacity: number) {
  const { data, error } = await supabase.from("crews")
    .insert({ store_id: storeId, name, capacity_sqft_per_day: capacity }).select("id, name, capacity_sqft_per_day").single();
  if (error) throw new Error(error.message);
  return data as Crew;
}
export async function listInstalls(): Promise<Install[]> {
  const { data, error } = await supabase.from("installs")
    .select("id, order_id, crew_id, title, address, scheduled_date, est_sqft, status")
    .order("scheduled_date", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Install[];
}
export async function scheduleInstall(installId: string, crewId: string, date: string) {
  const { data, error } = await supabase.rpc("schedule_install", { p_install_id: installId, p_crew_id: crewId, p_date: date });
  if (error) throw new Error(error.message);
  return data as Install;
}
export async function setInstallStatus(installId: string, status: string) {
  const { error } = await supabase.from("installs").update({ status }).eq("id", installId);
  if (error) throw new Error(error.message);
}

// --- Inventory & suppliers ---
export interface InventoryRow {
  id: string; product_id: string; on_hand_sqft: number; reorder_point_sqft: number;
  product?: { name: string; category: string };
}
export async function listInventory(): Promise<InventoryRow[]> {
  const { data, error } = await supabase.from("inventory")
    .select("id, product_id, on_hand_sqft, reorder_point_sqft, product:products(name, category)")
    .order("on_hand_sqft");
  if (error) throw new Error(error.message);
  return (data ?? []) as any as InventoryRow[];
}
export async function updateInventory(id: string, patch: { on_hand_sqft?: number; reorder_point_sqft?: number }) {
  const { error } = await supabase.from("inventory").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// --- Purchase orders ---
export interface PORow { id: string; po_number: string; status: string; total: number; supplier_id: string | null; created_at: string; }
export async function listPurchaseOrders(): Promise<PORow[]> {
  const { data, error } = await supabase.from("purchase_orders")
    .select("id, po_number, status, total, supplier_id, created_at").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PORow[];
}
export async function getPOLines(poId: string) {
  const { data, error } = await supabase.from("purchase_order_lines")
    .select("qty_sqft, unit_cost, line_total, product:products(name, category)").eq("po_id", poId);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function createPOFromLowStock(): Promise<PORow> {
  const { data, error } = await supabase.rpc("create_po_from_low_stock");
  if (error) throw new Error(error.message);
  return data as PORow;
}
export async function setPOStatus(poId: string, status: string) {
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", poId);
  if (error) throw new Error(error.message);
}

// --- AI spec assistant ---
export interface SpecSource { n: number; id: string; name: string; category: string; similarity: number; }
async function callSpec(payload: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/spec-assistant`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.code === "no_api_key"
      ? "The AI assistant isn't configured yet (add the OpenAI key as a Supabase secret)."
      : (body?.error ?? `Request failed (${res.status})`);
    throw new Error(msg);
  }
  return body;
}
export async function askSpec(question: string): Promise<{ answer: string; sources: SpecSource[] }> {
  return callSpec({ action: "ask", question });
}
export async function syncCatalogEmbeddings(): Promise<{ embedded: number; total: number }> {
  return callSpec({ action: "embed_all" });
}
