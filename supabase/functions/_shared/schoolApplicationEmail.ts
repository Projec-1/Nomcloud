export type ApplicantEmailResult =
  | { sent: true; providerMessageId?: string }
  | {
    sent: false;
    errorCode:
      | "provider_unconfigured"
      | "provider_rejected"
      | "provider_unavailable";
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
    return { sent: false, errorCode: "provider_unconfigured" };
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

    if (!response.ok) return { sent: false, errorCode: "provider_rejected" };
    const result = await response.json().catch(() => ({})) as { id?: unknown };
    return {
      sent: true,
      ...(typeof result.id === "string"
        ? { providerMessageId: result.id }
        : {}),
    };
  } catch {
    return { sent: false, errorCode: "provider_unavailable" };
  }
}
