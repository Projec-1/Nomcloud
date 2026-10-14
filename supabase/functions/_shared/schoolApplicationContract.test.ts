import { parseWorkflowRequest } from "./schoolApplicationContract.ts";

const applicationId = "00000000-0000-4000-8000-000000000000";
const secondApplicationId = "20000000-0000-4000-8000-000000000000";
const reviewerId = "10000000-0000-4000-8000-000000000000";

function assertEquals<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

Deno.test("typed flat contract accepts reviewer, priority and due-date actions", () => {
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "assign_reviewer",
      reviewer_id: reviewerId,
      instructions: "Keep the school contact looped in.",
    })?.action,
    "assign_reviewer",
    "reviewer action",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "assign_reviewer",
      reviewer_id: reviewerId,
      instructions: "Context",
    })?.payload.instructions,
    "Context",
    "reviewer instructions",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "change_priority",
      priority: "urgent",
    })?.action,
    "change_priority",
    "priority action",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "set_due_date",
      due_at: null,
    })?.action,
    "set_due_date",
    "due date action",
  );
});

Deno.test("typed flat contract accepts batch, archive and template actions", () => {
  const batch = parseWorkflowRequest({
    application_ids: [applicationId, secondApplicationId],
    action: "change_priority",
    priority: "high",
  });
  assertEquals(batch?.application_ids.length, 2, "batch ID count");
  assertEquals(batch?.application_ids[1], secondApplicationId, "batch order");
  assertEquals(
    parseWorkflowRequest({
      application_ids: [applicationId],
      action: "archive",
    })?.action,
    "archive",
    "archive action",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "unarchive",
    })?.action,
    "unarchive",
    "unarchive action",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "send_template",
      template: "documents_needed",
    })?.action,
    "send_template",
    "template action",
  );
});

Deno.test("typed flat contract accepts request, reject, email, note and document", () => {
  const requests = [
    {
      action: "update_document",
      document_id: "registration",
      state: "verified",
    },
    {
      action: "update_checklist",
      checklist: { contact_valid: true, school_identity_verified: false },
    },
    { action: "add_note", body: "Reviewed", mentions: [reviewerId] },
    {
      action: "request_information",
      subject: "More details",
      body: "Please send details.",
    },
    {
      action: "reject",
      reason: "Could not verify",
      subject: "Application update",
      body: "Please contact the platform.",
    },
    {
      action: "send_email",
      subject: "Follow-up",
      body: "Here is the follow-up.",
    },
    { action: "reopen" },
  ] as const;

  for (const action of requests) {
    assertEquals(
      parseWorkflowRequest({ application_id: applicationId, ...action })
        ?.action,
      action.action,
      `${action.action} accepted`,
    );
  }
});

Deno.test("typed flat contract rejects invalid and nested-only envelopes", () => {
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "approve",
    }),
    null,
    "approval stays separate",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "change_priority",
      priority: "automatic_reject",
    }),
    null,
    "unsupported priority",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "assign_reviewer",
      reviewer_id: reviewerId,
      instructions: "x".repeat(2001),
    }),
    null,
    "reviewer instruction length",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "update_document",
      document_id: "registration",
      state: "auto_reject",
    }),
    null,
    "unsupported document state",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "update_checklist",
      checklist: { auto_reject: true },
    }),
    null,
    "checklist rejects unknown keys",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "request_information",
      payload: { subject: "Nested legacy payload", body: "Not supported." },
    }),
    null,
    "nested payload rejected",
  );
  assertEquals(
    parseWorkflowRequest({
      application_id: applicationId,
      action: "reopen",
      application_ids: [applicationId],
    }),
    null,
    "exactly one id envelope",
  );
  assertEquals(
    parseWorkflowRequest({
      application_ids: [applicationId, applicationId],
      action: "archive",
    }),
    null,
    "duplicate batch IDs",
  );
  assertEquals(
    parseWorkflowRequest({
      application_ids: Array.from(
        { length: 101 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      ),
      action: "archive",
    }),
    null,
    "batch max size",
  );
});
