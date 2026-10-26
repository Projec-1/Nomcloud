export type ApplicantEmailResult =
  | { state: "accepted"; providerMessageId: string }
  | {
    state: "failed" | "unknown";
    errorCode:
      | "provider_unconfigured"
      | "provider_rejected"
      | "provider_unavailable"
      | "provider_response_invalid";
  };

export async function sendApplicantEmail(
  options: {
    apiKey?: string;
    from?: string;
    to: string;
    subject: string;
    body: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<ApplicantEmailResult> {
  if (!options.apiKey || !options.from) {
    return { state: "failed", errorCode: "provider_unconfigured" };
  }

  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.from,
        to: [options.to],
        subject: options.subject,
        text: options.body,
      }),
    });

    if (response.status >= 500) {
      return { state: "unknown", errorCode: "provider_unavailable" };
    }
    if (!response.ok) return { state: "failed", errorCode: "provider_rejected" };
    const result = await response.json().catch(() => null) as
      | { id?: unknown }
      | null;
    if (!result || typeof result.id !== "string" || !result.id.trim()) {
      return { state: "unknown", errorCode: "provider_response_invalid" };
    }
    return {
      state: "accepted",
      providerMessageId: result.id,
    };
  } catch {
    return { state: "unknown", errorCode: "provider_unavailable" };
  }
}
