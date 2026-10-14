import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseWorkflowRequest } from "../_shared/schoolApplicationContract.ts";
import { sendApplicantEmail } from "../_shared/schoolApplicationEmail.ts";

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

const emailTemplates = {
  rejection: {
    subject: "An update on your school application",
    body:
      "We have reviewed your school application. Please see the decision details below.",
  },
  documents_needed: {
    subject: "More information needed for your school application",
    body:
      "Please provide the requested information so we can continue reviewing your school application.",
  },
  onboarding_instructions: {
    subject: "Next steps for your school on Nom Cloud",
    body:
      "Your school is ready to get started. Follow the steps in your administrator invitation to complete setup.",
  },
} as const;

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
  const results = [];

  for (const applicationId of input.application_ids) {
    const workflowPayload = input.action === "send_template"
      ? {
        template: input.payload.template,
        ...emailTemplates[
          input.payload.template as keyof typeof emailTemplates
        ],
      }
      : input.payload;
    let recipient: string | undefined;
    if (isEmailAction) {
      const { data: application, error: applicationError } = await adminClient
        .from("school_applications")
        .select("email")
        .eq("id", applicationId)
        .maybeSingle();
      if (applicationError) {
        results.push({
          application_id: applicationId,
          action: input.action,
          ok: false,
          error: "Could not load the application for communication.",
          error_code: "application_lookup_failed",
        });
        continue;
      }
      if (!application) {
        results.push({
          application_id: applicationId,
          action: input.action,
          ok: false,
          error: "Application not found.",
          error_code: "application_not_found",
        });
        continue;
      }
      recipient = application.email;
    }

    const { data: workflow, error: workflowError } = await callerClient.rpc(
      "manage_school_application",
      {
        p_application_id: applicationId,
        p_action: input.action,
        p_payload: workflowPayload,
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

    if (!isEmailAction) {
      results.push({ ...workflow, ok: true });
      continue;
    }

    const communicationId = workflow?.communication_id;
    if (typeof communicationId !== "string") {
      results.push({
        application_id: applicationId,
        action: input.action,
        ok: false,
        error: "Workflow was updated but no communication record was created.",
        error_code: "communication_record_missing",
        action_persisted: true,
      });
      continue;
    }

    if (!recipient) {
      results.push({
        application_id: applicationId,
        action: input.action,
        ok: false,
        status: workflow.status,
        updated_at: workflow.updated_at,
        communication_id: communicationId,
        error:
          "Workflow was saved but no recipient was available; email was not sent.",
        error_code: "recipient_unavailable",
        action_persisted: true,
        delivery: { state: "queued", error_code: "recipient_unavailable" },
      });
      continue;
    }

    const email = await sendApplicantEmail({
      apiKey: Deno.env.get("RESEND_API_KEY"),
      from: Deno.env.get("SCHOOL_APPLICATION_EMAIL_FROM"),
      to: recipient,
      subject: String(workflowPayload.subject),
      body: String(workflowPayload.body),
    });
    const { error: deliveryError } = await callerClient.rpc(
      "record_school_application_email_delivery",
      {
        p_communication_id: communicationId,
        p_delivery_state: email.sent ? "sent" : "failed",
        p_provider_message_id: email.sent
          ? email.providerMessageId ?? null
          : null,
        p_error_code: email.sent ? null : email.errorCode,
      },
    );

    if (!email.sent) {
      results.push({
        application_id: applicationId,
        action: input.action,
        ok: false,
        status: workflow.status,
        updated_at: workflow.updated_at,
        communication_id: communicationId,
        error: "Applicant email was not sent.",
        error_code: email.errorCode,
        action_persisted: true,
        delivery: {
          state: deliveryError ? "queued" : "failed",
          error_code: deliveryError
            ? "delivery_state_unavailable"
            : email.errorCode,
        },
      });
    } else if (deliveryError) {
      results.push({
        application_id: applicationId,
        action: input.action,
        ok: false,
        status: workflow.status,
        updated_at: workflow.updated_at,
        communication_id: communicationId,
        error:
          "Provider accepted the email, but delivery history was not finalized.",
        error_code: "delivery_state_unavailable",
        action_persisted: true,
        delivery: { state: "queued", error_code: "delivery_state_unavailable" },
      });
    } else {
      results.push({
        ...workflow,
        ok: true,
        action_persisted: true,
        delivery: {
          state: "sent",
          ...(email.providerMessageId
            ? { provider_message_id: email.providerMessageId }
            : {}),
        },
      });
    }
  }

  const succeeded = results.filter((result) => result.ok).length;
  return json({
    results,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
  });
});
