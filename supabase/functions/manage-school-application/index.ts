import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseWorkflowRequest } from "../_shared/schoolApplicationContract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Authentication is required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(
      { error: "Server authentication configuration is incomplete" },
      500,
    );
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await callerClient.auth.getUser(
    authorization.slice(7),
  );
  if (userError || !userData.user) {
    return json({ error: "Authentication is required" }, 401);
  }

  const { data: activeAdmin, error: adminError } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (adminError) {
    return json({ error: "Could not verify platform-admin authority" }, 500);
  }
  if (!activeAdmin) {
    return json({ error: "Platform-admin authority is required" }, 403);
  }

  let rawInput: unknown;
  try {
    rawInput = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const input = parseWorkflowRequest(rawInput);
  if (!input) {
    return json({
      error: "Request does not match the school application action contract",
    }, 400);
  }

  const isEmailAction = input.action === "request_information" ||
    input.action === "reject" || input.action === "send_email" ||
    input.action === "send_template";
  if (isEmailAction) {
    // Fail closed until provider acceptance and webhook receipts are verified server-side.
    return json({
      error: "Applicant email delivery is disabled until provider verification is configured.",
      error_code: "email_delivery_disabled",
    }, 503);
  }

  const results = [];
  for (const applicationId of input.application_ids) {
    const { data: workflow, error: workflowError } = await callerClient.rpc(
      "manage_school_application",
      {
        p_application_id: applicationId,
        p_action: input.action,
        p_payload: input.payload,
      },
    );
    if (workflowError) {
      results.push({
        application_id: applicationId,
        action: input.action,
        ok: false,
        error: workflowError.message,
        error_code: workflowError.code,
      });
      continue;
    }

    results.push({ ...workflow, ok: true });
  }

  const succeeded = results.filter((result) => result.ok).length;
  return json({
    results,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
  });
});
