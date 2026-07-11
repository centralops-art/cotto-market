export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<{ error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { error: "RESEND_API_KEY isn't configured yet." };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Cotto <onboarding@resend.dev>", to: [input.to], subject: input.subject, text: input.text }),
  });
  if (!res.ok) {
    return { error: `Resend API error (${res.status}): ${await res.text()}` };
  }
  return {};
}
