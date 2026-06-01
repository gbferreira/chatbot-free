import express, { type Express } from "express";
import { existsSync } from "fs";
import { resolve } from "path";

export type AskResult =
  | { ok: true; value: string }
  | { ok: false; value?: string };

interface LLMaServerOptions {
  port?: number;
  modelPath?: string;
  gpuLayers?: number;
  contextSize?: number;
  cpuThreads?: number;
}

interface SessionLike {
  prompt: (prompt: string) => Promise<string>;
}

interface LlamaLike {
  loadModel: (args: { modelPath: string; gpuLayers: number }) => Promise<{
    createContext: (args: { contextSize: number }) => Promise<{
      getSequence: () => unknown;
    }>;
  }>;
}

let startPromise: Promise<void> | null = null;
let llmaSession: SessionLike | null = null;

function getLLMaPort(): number {
  return Number(process.env.LLMA_PORT ?? 11435);
}

function getLLMaBaseUrl(): string {
  return process.env.LLMA_BASE_URL ?? `http://localhost:${getLLMaPort()}`;
}

function resolveModelPath(optionPath?: string): { selected: string | null; checked: string[] } {
  const candidates = [
    optionPath,
    process.env.MODEL_PATH,
    resolve(process.cwd(), "models", "llama.gguf"),
  ].filter((p): p is string => Boolean(p));

  const selected = candidates.find((candidate) => existsSync(candidate)) ?? null;
  return { selected, checked: candidates };
}

async function loadSession(
  modelPath: string,
  gpuLayers: number,
  contextSize: number,
  cpuThreads: number
): Promise<SessionLike> {
  // Keep native dynamic import to avoid CJS require() on ESM module with top-level await.
  const importNodeLlama = Function(
    "return import('node-llama-cpp')"
  ) as () => Promise<unknown>;
  const llamaModule = await importNodeLlama();
  const getLlama = (llamaModule as {
    getLlama: (options?: { gpu?: false | "auto" | "metal" | "cuda" | "vulkan" }) => Promise<unknown>;
  }).getLlama;
  const LlamaChatSession = (llamaModule as { LlamaChatSession: new (args: unknown) => SessionLike })
    .LlamaChatSession;

  const shouldUseGpu = String(process.env.LLMA_USE_GPU ?? "false").toLowerCase() === "true";
  const llama = await getLlama({ gpu: shouldUseGpu ? "auto" : false }) as LlamaLike;

  const model = await llama.loadModel({
    modelPath,
    gpuLayers,
  });

  const contextOptions: { contextSize: number; threads?: number } = { contextSize };
  if (cpuThreads > 0) {
    contextOptions.threads = cpuThreads;
  }
  console.log(`[LLMa] Creating context: size=${contextSize}, threads=${cpuThreads > 0 ? cpuThreads : "auto"}`);

  const context = await model.createContext(contextOptions);

  return new LlamaChatSession({
    contextSequence: context.getSequence(),
  });
}

function createLLMaApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      loaded: Boolean(llmaSession),
    });
  });

  app.post("/chat", async (req, res) => {
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }
    if (!llmaSession) {
      return res.status(503).json({ error: "LLMa session is not ready yet" });
    }

    try {
      const response = await llmaSession.prompt(prompt);
      return res.json({ prompt, response });
    } catch (error) {
      console.error("[LLMa] Error generating response:", error);
      return res.status(500).json({ error: "Erro ao gerar resposta" });
    }
  });

  return app;
}

export async function startLLMaServer(options: LLMaServerOptions = {}): Promise<void> {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const port = options.port ?? getLLMaPort();
    const { selected: modelPath, checked } = resolveModelPath(options.modelPath);
    const gpuLayers = options.gpuLayers ?? Number(process.env.LLMA_GPU_LAYERS ?? 0);
    const contextSize = options.contextSize ?? Number(process.env.LLMA_CONTEXT_SIZE ?? 4096);
    const cpuThreads = options.cpuThreads ?? Number(process.env.LLMA_CPU_THREADS ?? 0);

    if (!modelPath) {
      const checkedPaths = checked.map((path) => `- ${path}`).join("\n");
      throw new Error(
        "[LLMa] Model file not found.\n" +
          `Checked paths:\n${checkedPaths}\n` +
          "Fix options:\n" +
          "- Download model locally: ./download-model.sh\n" +
          "- Set absolute model path: MODEL_PATH=/absolute/path/to/model.gguf\n" +
          "- Or place model in models/llama.gguf"
      );
    }

    console.log(`[LLMa] Loading model from: ${modelPath}`);
    console.log(`[LLMa] Config: gpuLayers=${gpuLayers}, contextSize=${contextSize}, cpuThreads=${cpuThreads > 0 ? cpuThreads : "auto (all cores)"}`);
    try {
      llmaSession = await loadSession(modelPath, gpuLayers, contextSize, cpuThreads);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      if (gpuLayers > 0 && errorText.toLowerCase().includes("not enough vram")) {
        console.warn(
          "[LLMa] Not enough VRAM for configured gpuLayers. Retrying with CPU mode (gpuLayers=0)."
        );
        llmaSession = await loadSession(modelPath, 0, contextSize, cpuThreads);
      } else {
        throw error;
      }
    }
    console.log("[LLMa] Model loaded.");

    const app = createLLMaApp();
    await new Promise<void>((resolveListen) => {
      app.listen(port, () => {
        console.log(`[LLMa] API running at http://localhost:${port}`);
        resolveListen();
      });
    });
  })();

  return startPromise;
}

export async function ask(prompt: string): Promise<AskResult> {
  const baseUrl = getLLMaBaseUrl().replace(/\/$/, "");

  try {
    const res = await fetch(`${baseUrl}/chat`, {
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
  } catch (error) {
    console.error("[LLMa] Request failed:", error);
    return { ok: false };
  }
}
