import { sendApplicantEmail } from "./schoolApplicationEmail.ts";

function assertEquals<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

Deno.test("applicant email reports an unconfigured provider as failed", async () => {
  const result = await sendApplicantEmail({
    to: "applicant@example.test",
    subject: "Info",
    body: "Please reply.",
  });
  assertEquals(result.state, "failed", "state");
  if (result.state !== "accepted") {
    assertEquals(result.errorCode, "provider_unconfigured", "error code");
  }
});

Deno.test("applicant email reports explicit provider rejection as failed", async () => {
  const result = await sendApplicantEmail(
    {
      apiKey: "test",
      from: "noreply@example.test",
      to: "applicant@example.test",
      subject: "Info",
      body: "Please reply.",
    },
    async () => new Response("{}", { status: 400 }),
  );
  assertEquals(result.state, "failed", "state");
  if (result.state !== "accepted") {
    assertEquals(result.errorCode, "provider_rejected", "error code");
  }
});

Deno.test("applicant email reports provider server errors as unknown", async () => {
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
  assertEquals(result.state, "unknown", "state");
  if (result.state !== "accepted") {
    assertEquals(result.errorCode, "provider_unavailable", "error code");
  }
});

Deno.test("applicant email reports provider acceptance, not delivery", async () => {
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
  assertEquals(result.state, "accepted", "state");
  if (result.state === "accepted") {
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

Deno.test("applicant email reports an uncorrelatable provider response as unknown", async () => {
  const result = await sendApplicantEmail(
    {
      apiKey: "test",
      from: "noreply@example.test",
      to: "applicant@example.test",
      subject: "Info",
      body: "Please reply.",
    },
    async () => new Response("{}", { status: 200 }),
  );
  assertEquals(result.state, "unknown", "state");
  if (result.state !== "accepted") {
    assertEquals(result.errorCode, "provider_response_invalid", "error code");
  }
});

Deno.test("applicant email reports network failures as unknown without provider details", async () => {
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
  assertEquals(result.state, "unknown", "state");
  if (result.state !== "accepted") {
    assertEquals(result.errorCode, "provider_unavailable", "error code");
  }
});
