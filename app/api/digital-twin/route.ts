import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenRouterChoice = {
  message?: {
    content?: string;
  };
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
};

const model = "openai/gpt-oss-120b:free";

const digitalTwinSystemPrompt = `You are the Digital Twin of Itamar Konfi.

Your purpose:
- Answer questions about Itamar's professional background, leadership, and career journey.
- Stay factual and grounded in the known profile details.
- If asked about unknown details, say you do not have that information yet and suggest what to ask next.

Known profile facts:
- Name: Itamar Konfi
- Title: AI Delivery Manager | AI Platform | Customer Orientation
- Location: Israel
- Experience: 20+ years in release, delivery, infrastructure, and technology leadership.
- Current role: AI Delivery Manager at BigArch (Dec 2025 - Present).
- Previous role: Product Owner at BigArch (Apr 2023 - Dec 2025).
- Israel Defense Forces roles:
  - Customer Success | Program Manager (Dec 2019 - Feb 2023)
  - Cyber Product Manager (Jan 2017 - Nov 2019)
  - Deputy CIO / Information Technology Manager (Jan 2013 - Dec 2016)
  - Network, Security, Domain Infrastructure & DevOps Manager (Jan 2011 - Dec 2012)
- Highlights:
  - Led establishment of large-scale NVIDIA-based AI environments with vendor alignment (NVIDIA, DDN).
  - Managed cloud/platform environments supporting about 1,000 developers.
  - Led modernization at scale with 10,000+ machines and 2,000+ end users.
  - Owned KPI and health metric definitions for platform reliability.
  - Managed large budgets and strategic technology contracts.
- Core strengths:
  - AI platform delivery
  - Cross-functional coordination
  - Vendor management
  - Stakeholder communication

Tone and style:
- Professional, concise, and confident.
- First person voice as Itamar's digital representative.
- Keep answers practical and specific.`;

async function readRootEnvKey(): Promise<string | null> {
  try {
    const rootEnvPath = path.resolve(process.cwd(), "..", ".env");
    const content = await fs.readFile(rootEnvPath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (
        key === "openrouter_api_key" ||
        key === "OPENROUTER_API_KEY" ||
        key === "OPENROUTER_API_KEYIS"
      ) {
        return value || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function getOpenRouterApiKey(): Promise<string | null> {
  return (
    process.env.openrouter_api_key ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEYIS ||
    (await readRootEnvKey())
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      history?: IncomingMessage[];
    };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    const apiKey = await getOpenRouterApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenRouter API key is missing." },
        { status: 500 },
      );
    }

    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const messages = [
      { role: "system", content: digitalTwinSystemPrompt },
      ...history.map((entry) => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content,
      })),
      { role: "user", content: message },
    ];

    const openRouterResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Itamar Digital Twin",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.4,
        }),
      },
    );

    if (!openRouterResponse.ok) {
      const errorBody = await openRouterResponse.text();
      const accountRestrictionDetected =
        openRouterResponse.status === 403 &&
        (errorBody.includes("run out of credit") ||
          errorBody.includes("ERR_NGROK_4026"));

      if (accountRestrictionDetected) {
        return NextResponse.json(
          {
            error:
              "OpenRouter account restriction detected. Please check billing/credits and allowed domain policy in your OpenRouter settings, then try again.",
          },
          { status: 502 },
        );
      }

      return NextResponse.json(
        {
          error: `OpenRouter request failed (${openRouterResponse.status}). ${errorBody}`,
        },
        { status: 502 },
      );
    }

    const responseJson = (await openRouterResponse.json()) as OpenRouterResponse;
    const reply = responseJson.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "No response text returned by model." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error while processing chat." },
      { status: 500 },
    );
  }
}
