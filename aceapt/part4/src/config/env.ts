import "dotenv/config";

export interface Env {
  port: number;
  nodeEnv: string;
  demoMode: boolean;
  databaseUrl: string | undefined;
  groqApiKey: string | undefined;
  groqBaseUrl: string;
  groqModel: string;
}

export function loadEnv(): Env {
  return {
    port: Number(process.env.PORT ?? 4000),
    nodeEnv: process.env.NODE_ENV ?? "development",
    demoMode: (process.env.DEMO_MODE ?? "true").toLowerCase() === "true",
    databaseUrl: process.env.DATABASE_URL,
    groqApiKey: process.env.GROQ_API_KEY || undefined,
    groqBaseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
    groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  };
}
