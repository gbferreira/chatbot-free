import express from "express";
import * as Chat from "./src/Chat";
import * as LLMa from "./src/LLMa";
import { startWhatsAppListener } from "./src/services/WhatsApp";

const app = express();
const port = Number(process.env.PORT ?? 4000);
let whatsappReady = false;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "chatbot",
    whatsappReady,
  });
});

app.post("/llm/chat", async (req, res) => {
  const prompt = String(req.body?.prompt ?? req.body?.message ?? "").trim();
  if (!prompt) {
    return res.status(400).json({ ok: false, error: "prompt is required" });
  }

  const result = await LLMa.ask(prompt);
  if (!result.ok || !result.value) {
    return res.status(502).json({ ok: false, error: "failed to generate LLM response" });
  }

  return res.json({
    ok: true,
    response: result.value,
  });
});

async function bootstrap(): Promise<void> {
  await LLMa.startLLMaServer();

  app.listen(port, () => {
    console.log(`Chatbot API listening on http://localhost:${port}`);
  });

  await startWhatsAppListener({
    onIncomingMessage: async ({ number, text }) => {
      return Chat.handleIncomingMessage(number, text);
    },
  });

  whatsappReady = true;
  console.log("WhatsApp listener started.");
}

void bootstrap();
