import environments from "../common/environments";
import * as gemini from "./llm-models/Gemini/gemini";
import * as llma from "./llm-models/LLMA/LLMa";

/** LLM provider selection. Use env LLM_PROVIDER to override. */
export enum LLMProvider {
  OPENAI = "openai",
  OLLAMA = "ollama",
  LLMA = "llma",
  LOCAL = "local",
  GEMINI = "gemini",
}

/** Environment variable keys for LLM configuration. */
export enum LLMEnvKey {
  PROVIDER = "LLM_PROVIDER",
  API_KEY = "OPENAI_API_KEY",
  BASE_URL = "LLM_BASE_URL",
  MODEL = "LLM_MODEL",
  GEMINI_API_KEY = "GEMINI_API_KEY",
}

/** Default configuration per provider. Env vars override these. */
export const LLM_PROVIDER_CONFIG: Record<
  LLMProvider,
  { baseUrl: string; defaultModel: string; requiresApiKey: boolean }
> = {
  [LLMProvider.OPENAI]: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    requiresApiKey: true,
  },
  [LLMProvider.OLLAMA]: {
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    requiresApiKey: false,
  },
  [LLMProvider.LLMA]: {
    baseUrl: "http://localhost:11435",
    defaultModel: "llama-local",
    requiresApiKey: false,
  },
  [LLMProvider.LOCAL]: {
    baseUrl: "http://localhost:11435",
    defaultModel: "llama-local",
    requiresApiKey: false,
  },
  [LLMProvider.GEMINI]: {
    baseUrl: "",
    defaultModel: "gemini-2.0-flash",
    requiresApiKey: true,
  },
};

export type AskResult =
  | { ok: true; value: string }
  | { ok: false; value?: string };

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

function parseProvider(raw?: string): LLMProvider {
  if (!raw) return LLMProvider.LLMA;
  const v = raw.toLowerCase();
  if (v === LLMProvider.LOCAL) return LLMProvider.LLMA;
  if (Object.values(LLMProvider).includes(v as LLMProvider)) return v as LLMProvider;
  return LLMProvider.LLMA;
}

function resolveConfig(): LLMConfig {
  const raw = environments as { llm?: { provider?: string; apiKey?: string; baseUrl?: string; model?: string } };
  const envProvider = raw.llm?.provider ?? process.env[LLMEnvKey.PROVIDER];
  const provider = parseProvider(envProvider);

  const defaults = LLM_PROVIDER_CONFIG[provider];
  const baseUrl = raw.llm?.baseUrl || process.env[LLMEnvKey.BASE_URL] || defaults.baseUrl;
  const model = raw.llm?.model || process.env[LLMEnvKey.MODEL] || defaults.defaultModel;
  const apiKey = provider === LLMProvider.GEMINI
    ? (raw.llm?.apiKey ?? process.env[LLMEnvKey.GEMINI_API_KEY] ?? "")
    : (raw.llm?.apiKey ?? process.env[LLMEnvKey.API_KEY] ?? "");

  return { provider, apiKey, baseUrl, model };
}

export async function ask(prompt: string, config?: Partial<LLMConfig>): Promise<AskResult> {
  const base = resolveConfig();
  const cfg = config ? { ...base, ...config } : base;

  if (cfg.provider === LLMProvider.GEMINI) {
    return gemini.ask(prompt, cfg.apiKey, cfg.model);
  }

  if (cfg.provider === LLMProvider.LLMA || cfg.provider === LLMProvider.LOCAL) {
    return llma.ask(prompt, cfg.baseUrl);
  }

  const { apiKey, baseUrl, model } = cfg;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[LLM] API error:", res.status, text);
      return { ok: false };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (content) {
      return { ok: true, value: content };
    }
    return { ok: false };
  } catch (err) {
    console.error("[LLM] Request failed:", err);
    return { ok: false };
  }
}
