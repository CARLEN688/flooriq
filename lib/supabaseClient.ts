"use client";
import { createBrowserClient } from "@supabase/ssr";

// Single browser client for the FloorIQ app. Reads public env vars.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
