import { sendApplicantEmail } from "./schoolApplicationEmail.ts";

function assertEquals<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

Deno.test("applicant email is not reported sent when the provider is unconfigured", async () => {
  const result = await sendApplicantEmail({
    to: "applicant@example.test",
    subject: "Info",
    body: "Please reply.",
  });
  assertEquals(result.sent, false, "sent");
  if (!result.sent) {
    assertEquals(result.errorCode, "provider_unconfigured", "error code");
  }
});

Deno.test("applicant email rejects non-success provider responses", async () => {
  const result = await sendApplicantEmail(
    {
      apiKey: "test",
      from: "noreply@example.test",
      to: "applicant@example.test",
      subject: "Info",
      body: "Please reply.",
    },
    async () => new Response("{}", { status: 503 }),
  );
  assertEquals(result.sent, false, "sent");
  if (!result.sent) {
    assertEquals(result.errorCode, "provider_rejected", "error code");
  }
});

Deno.test("applicant email reports provider acceptance and message id", async () => {
  let requestBody = "";
  const result = await sendApplicantEmail(
    {
      apiKey: "test",
      from: "noreply@example.test",
      to: "applicant@example.test",
      subject: "Info",
      body: "Please reply.",
    },
    async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: "provider-message-id" }), {
        status: 200,
      });
    },
  );
  assertEquals(result.sent, true, "sent");
  if (result.sent) {
    assertEquals(
      result.providerMessageId,
      "provider-message-id",
      "provider id",
    );
  }
  assertEquals(
    requestBody.includes("Please reply."),
    true,
    "email body submitted",
  );
});

Deno.test("applicant email reports network failures without provider details", async () => {
  const result = await sendApplicantEmail(
    {
      apiKey: "test",
      from: "noreply@example.test",
      to: "applicant@example.test",
      subject: "Info",
      body: "Please reply.",
    },
    async () => {
      throw new Error("private provider response");
    },
  );
  assertEquals(result.sent, false, "sent");
  if (!result.sent) {
    assertEquals(result.errorCode, "provider_unavailable", "error code");
  }
});
