"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Takeoff from "../../components/Takeoff";

// Loads (or creates) a job for the signed-in user's store, then mounts the
// takeoff workspace bound to that job_id.
export default function TakeoffPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading your workspace…");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      // Find the user's profile/store.
      const { data: profile } = await supabase
        .from("user_profiles").select("store_id").eq("id", user.id).single();

      if (!profile?.store_id) {
        window.location.href = "/onboarding";
        return;
      }

      // Reuse the most recent open job, or create one.
      const { data: jobs } = await supabase
        .from("jobs").select("id").eq("status", "quoting")
        .order("created_at", { ascending: false }).limit(1);

      if (jobs && jobs.length) { setJobId(jobs[0].id); return; }

      const { data: job, error } = await supabase
        .from("jobs")
        .insert({ store_id: profile.store_id, title: "New takeoff", status: "quoting", created_by: user.id })
        .select("id").single();

      if (error) { setStatus("Could not create a job: " + error.message); return; }
      setJobId(job.id);
    })();
  }, []);

  if (!jobId) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0B1B2B", color: "#9DB2C6", padding: 24, textAlign: "center" }}>
        <div>{status}</div>
      </div>
    );
  }
  return <Takeoff jobId={jobId} />;
}
