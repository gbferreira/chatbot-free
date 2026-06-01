export default {
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "chatbot",
    ssl: process.env.DB_SSL === "true",
  },
  llm: {
    provider: process.env.LLM_PROVIDER || "local",
    apiKey: process.env.GEMINI_API_KEY ?? "",
    baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:11435",
    model: process.env.LLM_MODEL ?? "",
  },
};
