"use client";
import { supabase } from "../lib/supabaseClient";
import { Square, LogOut } from "lucide-react";

const LINKS = [
  { href: "/takeoff", label: "Takeoff" },
  { href: "/jobs", label: "Jobs" },
  { href: "/quotes", label: "Quotes" },
  { href: "/orders", label: "Orders" },
  { href: "/schedule", label: "Schedule" },
  { href: "/inventory", label: "Inventory" },
  { href: "/assistant", label: "Assistant" },
  { href: "/rules", label: "Rules" },
];

export default function Nav({ active }: { active?: string }) {
  return (
    <div style={{ background: "#0B1B2B", color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 8 }}>
        <Square size={20} color="#5BC0BE" fill="#5BC0BE" />
        <div style={{ fontWeight: 700 }}>FloorIQ</div>
      </div>
      {LINKS.map((l) => (
        <a key={l.href} href={l.href}
          style={{ color: active === l.href ? "#fff" : "#9DB2C6", fontSize: 13, textDecoration: "none",
            padding: "5px 9px", borderRadius: 7, background: active === l.href ? "#1B3A55" : "transparent",
            fontWeight: active === l.href ? 700 : 400 }}>
          {l.label}
        </a>
      ))}
      <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/login"))}
        style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #2A3F55", color: "#9DB2C6", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, cursor: "pointer" }}>
        <LogOut size={14} /> Sign out
      </button>
    </div>
  );
}
