import "server-only";

export type MailMessage = {
  subject: string;
  text: string;
  html?: string;
};

export type SendMailResult = {
  id: string;
  skipped?: boolean;
};

function parseRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveConfig() {
  const provider = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = process.env.EMAIL_FROM?.trim() || "";
  const to = parseRecipients(process.env.EMAIL_TO);
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || "";
  const dryRun = (process.env.EMAIL_DRY_RUN || "").toLowerCase() === "true";
  return { provider, apiKey, from, to, replyTo, dryRun };
}

export async function sendMail(message: MailMessage): Promise<SendMailResult> {
  const cfg = resolveConfig();

  if (!cfg.from) {
    throw new Error("EMAIL_FROM is not configured.");
  }
  if (cfg.to.length === 0) {
    throw new Error("EMAIL_TO is not configured.");
  }

  if (cfg.dryRun) {
    console.log("[email:dry-run]", {
      from: cfg.from,
      to: cfg.to,
      replyTo: cfg.replyTo || undefined,
      subject: message.subject,
      text: message.text,
    });
    return { id: "dry-run", skipped: true };
  }

  if (cfg.provider !== "resend") {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${cfg.provider}`);
  }
  if (!cfg.apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const payload: Record<string, unknown> = {
    from: cfg.from,
    to: cfg.to,
    subject: message.subject,
    text: message.text,
  };
  if (message.html) {
    payload.html = message.html;
  }
  if (cfg.replyTo) {
    payload.reply_to = cfg.replyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend send failed (${response.status}): ${detail || response.statusText}`);
  }

  const data = (await response.json().catch(() => ({}))) as { id?: string };
  return { id: data.id || "unknown" };
}
