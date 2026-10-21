import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSupabaseBackupInventory } from "../_shared/supabaseBackupInventory.ts";

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

type BackupRecord = {
  status: "records_found" | "none_found" | "unknown";
  backup_count: number | null;
  latest_backup_at: string | null;
  latest_backup_status: string | null;
  error_code: string | null;
};

async function recordCheck(
  service: ReturnType<typeof createClient>,
  record: BackupRecord,
): Promise<boolean> {
  const { error } = await service.rpc("record_platform_backup_check", {
    p_status: record.status,
    p_backup_count: record.backup_count,
    p_latest_backup_at: record.latest_backup_at,
    p_latest_backup_status: record.latest_backup_status,
    p_error_code: record.error_code,
  });
  return !error;
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

  const accessToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
  const configuredRef = Deno.env.get("SUPABASE_PROJECT_REF");
  const projectRef = configuredRef ?? new URL(supabaseUrl).hostname.split(".")[0];
  if (!accessToken || !/^[a-z0-9]{20}$/.test(projectRef)) {
    const recorded = await recordCheck(service, {
      status: "unknown",
      backup_count: null,
      latest_backup_at: null,
      latest_backup_status: null,
      error_code: "management_api_unconfigured",
    });
    if (!recorded) return json({ error: "Backup status could not be recorded", error_code: "backup_record_failed" }, 500);
    return json({
      error: "Supabase Management API access is not configured",
      error_code: "management_api_unconfigured",
      restore_test: "not_verified",
    }, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response: Response;
  try {
    response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/backups`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
  } catch {
    clearTimeout(timeout);
    const recorded = await recordCheck(service, {
      status: "unknown",
      backup_count: null,
      latest_backup_at: null,
      latest_backup_status: null,
      error_code: "provider_unavailable",
    });
    if (!recorded) return json({ error: "Backup status could not be recorded", error_code: "backup_record_failed" }, 500);
    return json({
      error: "Supabase backup status could not be reached",
      error_code: "provider_unavailable",
      restore_test: "not_verified",
    }, 503);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorCode = response.status >= 500 ? "provider_unavailable" : "provider_rejected";
    const recorded = await recordCheck(service, {
      status: "unknown",
      backup_count: null,
      latest_backup_at: null,
      latest_backup_status: null,
      error_code: errorCode,
    });
    if (!recorded) return json({ error: "Backup status could not be recorded", error_code: "backup_record_failed" }, 500);
    return json({
      error: "Supabase did not provide backup status",
      error_code: errorCode,
      restore_test: "not_verified",
    }, response.status >= 500 ? 503 : 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const inventory = parseSupabaseBackupInventory(payload);
  if (!inventory) {
    const recorded = await recordCheck(service, {
      status: "unknown",
      backup_count: null,
      latest_backup_at: null,
      latest_backup_status: null,
      error_code: "provider_response_invalid",
    });
    if (!recorded) return json({ error: "Backup status could not be recorded", error_code: "backup_record_failed" }, 500);
    return json({
      error: "Supabase returned an unsupported backup-status response",
      error_code: "provider_response_invalid",
      restore_test: "not_verified",
    }, 502);
  }

  const recorded = await recordCheck(service, {
    status: inventory.status,
    backup_count: inventory.backupCount,
    latest_backup_at: inventory.latestBackupAt,
    latest_backup_status: inventory.latestBackupStatus,
    error_code: null,
  });
  if (!recorded) return json({ error: "Backup status could not be recorded", error_code: "backup_record_failed" }, 500);

  return json({
    provider: "supabase",
    status: inventory.status,
    backup_count: inventory.backupCount,
    latest_backup_at: inventory.latestBackupAt,
    latest_backup_status: inventory.latestBackupStatus,
    restore_test: "not_verified",
  });
});
