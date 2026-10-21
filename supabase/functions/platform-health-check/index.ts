import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function failureCode(code: unknown, fallback: string): string {
  return typeof code === "string" && /^[a-z0-9_]{1,80}$/i.test(code)
    ? code.toLowerCase()
    : fallback;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Authentication is required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Server authentication configuration is incomplete" }, 500);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const service = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await caller.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (userError || !userData.user) return json({ error: "Authentication is required" }, 401);

  const { data: activeAdmin, error: adminError } = await service
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (adminError) return json({ error: "Could not verify platform-admin authority" }, 500);
  if (!activeAdmin) return json({ error: "Platform-admin authority is required" }, 403);

  const checks: Array<Record<string, unknown>> = [];
  const databaseStart = performance.now();
  const database = await service.from("schools").select("id", { head: true, count: "exact" });
  checks.push({
    service_name: "database",
    status: database.error ? "unavailable" : "healthy",
    duration_ms: Math.max(0, Math.round(performance.now() - databaseStart)),
    failure_code: database.error ? failureCode(database.error.code, "database_query_failed") : null,
  });

  const operationsStart = performance.now();
  const [cases, incidents] = await Promise.all([
    service.from("platform_cases").select("id", { head: true, count: "exact" }),
    service.from("platform_incidents").select("id", { head: true, count: "exact" }),
  ]);
  const operationsError = cases.error ?? incidents.error;
  checks.push({
    service_name: "operator_tables",
    status: operationsError ? "unavailable" : "healthy",
    duration_ms: Math.max(0, Math.round(performance.now() - operationsStart)),
    failure_code: operationsError
      ? failureCode(operationsError.code, "operator_table_probe_failed")
      : null,
  });

  const { data: recorded, error: recordError } = await service.rpc(
    "record_platform_health_checks",
    { p_checks: checks },
  );
  if (recordError || !recorded) {
    return json({ error: "Health checks ran but could not be recorded", error_code: "health_record_failed" }, 500);
  }

  return json({
    source: "on_demand",
    incident_detection: "two consecutive failed on-demand checks; operator resolution required",
    checks: recorded,
  });
});
