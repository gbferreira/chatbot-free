import { GoogleGenAI } from "@google/genai";
import type { AskResult } from "../../services/LLM";

export async function ask(prompt: string, apiKey: string, model = "gemini-2.0-flash"): Promise<AskResult> {
  try {
    const ai = new GoogleGenAI({ apiKey: apiKey || undefined });
    const res = await ai.models.generateContent({ model, contents: prompt });
    const text = res.text?.trim();
    return text ? { ok: true, value: text } : { ok: false };
  } catch (err) {
    console.error("[LLM:Gemini] ", err);
    return { ok: false };
  }
}
