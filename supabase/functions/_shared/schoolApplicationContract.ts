export type WorkflowAction =
  | "assign_reviewer"
  | "send_template"
  | "change_priority"
  | "archive"
  | "unarchive"
  | "request_information"
  | "reject"
  | "reopen"
  | "update_document"
  | "update_checklist"
  | "add_note"
  | "send_email"
  | "set_review_flags"
  | "start_onboarding"
  | "update_onboarding"
  | "set_due_date";

export type WorkflowApplicationStatus =
  | "pending"
  | "awaiting_information"
  | "approved"
  | "rejected"
  | "onboarding"
  | "withdrawn";

type WorkflowTarget =
  | { application_id: string; application_ids?: never }
  | { application_id?: never; application_ids: string[] };

type WorkflowRequestFields<A extends WorkflowAction> = WorkflowTarget & {
  action: A;
};

export type WorkflowRequest =
  | (WorkflowRequestFields<"assign_reviewer"> & {
    reviewer_id: string | null;
    instructions?: string;
  })
  | (WorkflowRequestFields<"send_template"> & {
    template: "rejection" | "documents_needed" | "onboarding_instructions";
  })
  | (WorkflowRequestFields<"change_priority"> & {
    priority: "low" | "normal" | "high" | "urgent";
  })
  | (WorkflowRequestFields<
    "archive" | "unarchive" | "reopen" | "start_onboarding"
  >)
  | (WorkflowRequestFields<"request_information" | "send_email"> & {
    subject: string;
    body: string;
  })
  | (WorkflowRequestFields<"reject"> & {
    reason: string;
    subject: string;
    body: string;
  })
  | (WorkflowRequestFields<"update_document"> & {
    document_id: string;
    state:
      | "pending"
      | "verified"
      | "missing"
      | "replacement_requested"
      | "rejected";
    note?: string | null;
  })
  | (WorkflowRequestFields<"update_checklist"> & {
    checklist: Partial<{
      required_fields_complete: boolean;
      contact_valid: boolean;
      school_identity_verified: boolean;
    }>;
  })
  | (WorkflowRequestFields<"add_note"> & { body: string; mentions?: string[] })
  | (WorkflowRequestFields<"set_review_flags"> & {
    flags: {
      duplicate_suspected?: boolean;
      contact_mismatch_suspected?: boolean;
    };
  })
  | (WorkflowRequestFields<"update_onboarding"> & {
    checklist: Record<string, unknown>;
  })
  | (WorkflowRequestFields<"set_due_date"> & { due_at: string | null });

export interface WorkflowCommand {
  application_ids: string[];
  action: WorkflowAction;
  payload: Record<string, unknown>;
}

export interface WorkflowResult {
  application_id: string;
  action: WorkflowAction;
  ok: boolean;
  status?: WorkflowApplicationStatus;
  updated_at?: string;
  error?: string;
  error_code?: string;
  communication_id?: string;
  action_persisted?: boolean;
  delivery?:
    | { state: "sent"; provider_message_id?: string }
    | { state: "failed" | "queued"; error_code: string };
}

export interface WorkflowResponse {
  results: WorkflowResult[];
  total: number;
  succeeded: number;
  failed: number;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

const isText = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.trim().length > 0 &&
  value.trim().length <= maxLength;

const isOptionalText = (value: unknown, maxLength: number) =>
  value === undefined || value === null ||
  (typeof value === "string" && value.length <= maxLength);

const isEmptyPayload = (value: Record<string, unknown>) =>
  Object.keys(value).length === 0;

export function parseWorkflowRequest(value: unknown): WorkflowCommand | null {
  if (
    !isRecord(value) ||
    (("application_id" in value) === ("application_ids" in value))
  ) return null;
  const ids = "application_ids" in value
    ? value.application_ids
    : [value.application_id];
  if (
    !Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
    ids.some((id) => typeof id !== "string" || !uuidPattern.test(id)) ||
    new Set(ids).size !== ids.length
  ) return null;

  const action = value.action;
  const payload = { ...value };
  delete payload.action;
  delete payload.application_id;
  delete payload.application_ids;
  const base = { application_ids: ids as string[], action };

  switch (action) {
    case "assign_reviewer":
      if (
        !hasOnlyKeys(payload, ["reviewer_id", "instructions"]) ||
        (payload.reviewer_id !== null &&
          (typeof payload.reviewer_id !== "string" ||
            !uuidPattern.test(payload.reviewer_id))) ||
        (payload.instructions !== undefined &&
          (typeof payload.instructions !== "string" ||
            payload.instructions.length > 2000))
      ) return null;
      return { ...base, action, payload };
    case "change_priority":
      if (
        !hasOnlyKeys(payload, ["priority"]) ||
        !["low", "normal", "high", "urgent"].includes(String(payload.priority))
      ) return null;
      return { ...base, action, payload };
    case "set_due_date":
      if (
        !hasOnlyKeys(payload, ["due_at"]) || !("due_at" in payload) ||
        (payload.due_at !== null &&
          (typeof payload.due_at !== "string" ||
            !Number.isFinite(Date.parse(payload.due_at))))
      ) return null;
      return { ...base, action, payload };
    case "update_document":
      if (
        !hasOnlyKeys(payload, ["document_id", "state", "note"]) ||
        !isText(payload.document_id, 200) ||
        !["pending", "verified", "missing", "replacement_requested", "rejected"]
          .includes(String(payload.state)) ||
        !isOptionalText(payload.note, 2000)
      ) return null;
      return { ...base, action, payload };
    case "update_checklist":
      if (
        !hasOnlyKeys(payload, ["checklist"]) || !isRecord(payload.checklist) ||
        Object.keys(payload.checklist).length === 0 ||
        Object.keys(payload.checklist).some((key) =>
          ![
            "required_fields_complete",
            "contact_valid",
            "school_identity_verified",
          ].includes(key)
        ) ||
        Object.values(payload.checklist).some((checked) =>
          typeof checked !== "boolean"
        )
      ) return null;
      return { ...base, action, payload };
    case "add_note":
      if (
        !hasOnlyKeys(payload, ["body", "mentions"]) ||
        !isText(payload.body, 10000) ||
        (payload.mentions !== undefined &&
          (!Array.isArray(payload.mentions) ||
            payload.mentions.some((id) =>
              typeof id !== "string" || !uuidPattern.test(id)
            )))
      ) return null;
      return { ...base, action, payload };
    case "request_information":
    case "send_email":
      if (
        !hasOnlyKeys(payload, ["subject", "body"]) ||
        !isText(payload.subject, 200) || !isText(payload.body, 10000)
      ) return null;
      return { ...base, action, payload };
    case "reject":
      if (
        !hasOnlyKeys(payload, ["reason", "subject", "body"]) ||
        !isText(payload.reason, 2000) || !isText(payload.subject, 200) ||
        !isText(payload.body, 10000)
      ) return null;
      return { ...base, action, payload };
    case "send_template":
      if (
        !hasOnlyKeys(payload, ["template"]) ||
        !["rejection", "documents_needed", "onboarding_instructions"].includes(
          String(payload.template),
        )
      ) return null;
      return { ...base, action, payload };
    case "set_review_flags":
      if (
        !hasOnlyKeys(payload, ["flags"]) || !isRecord(payload.flags) ||
        Object.keys(payload.flags).some((key) =>
          !["duplicate_suspected", "contact_mismatch_suspected"].includes(key)
        ) ||
        Object.values(payload.flags).some((flag) => typeof flag !== "boolean")
      ) return null;
      return { ...base, action, payload };
    case "update_onboarding":
      if (
        !hasOnlyKeys(payload, ["checklist"]) || !isRecord(payload.checklist)
      ) return null;
      return { ...base, action, payload };
    case "archive":
    case "unarchive":
    case "reopen":
    case "start_onboarding":
      return isEmptyPayload(payload) ? { ...base, action, payload } : null;
    default:
      return null;
  }
}
