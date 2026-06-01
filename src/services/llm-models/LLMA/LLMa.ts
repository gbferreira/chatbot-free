import type { AskResult } from "../../LLM";

export async function ask(prompt: string, baseUrl: string): Promise<AskResult> {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  try {
    const res = await fetch(`${normalizedBaseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[LLMa] API error:", res.status, text);
      return { ok: false };
    }

    const json = (await res.json()) as { response?: string };
    const content = json.response?.trim();

    if (!content) return { ok: false };
    return { ok: true, value: content };
  } catch (err) {
    console.error("[LLMa] Request failed:", err);
    return { ok: false };
  }
}
