import "dotenv/config";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int("PORT", 4000),

  databaseUrl: process.env.DATABASE_URL || null,

  ai: {
    groq: { apiKey: process.env.GROQ_API_KEY || null, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" },
    gemini: { apiKey: process.env.GEMINI_API_KEY || null, model: process.env.GEMINI_MODEL || "gemini-2.0-flash" },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY || null, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6" }
  },

  jwtSecret: process.env.JWT_SECRET || null,

  sandbox: {
    wallTimeMs: int("SANDBOX_WALL_TIME_MS", 6000),
    cpuTimeSec: int("SANDBOX_CPU_TIME_SEC", 5),
    memoryKB: int("SANDBOX_MEMORY_KB", 256 * 1024), // 256MB, Python only (see executor.ts)
    jsHeapMB: int("SANDBOX_JS_HEAP_MB", 192),
    jsVirtualMemKB: int("SANDBOX_JS_VMEM_KB", 1_572_864), // 1.5GB - V8 needs headroom, see README
    maxProcesses: int("SANDBOX_MAX_PROCESSES", 32),
    maxFileSizeKB: int("SANDBOX_MAX_FILE_SIZE_KB", 10 * 1024)
  }
} as const;

export const isAiConfigured =
  Boolean(config.ai.groq.apiKey) || Boolean(config.ai.gemini.apiKey) || Boolean(config.ai.anthropic.apiKey);

export const isDatabaseConfigured = Boolean(config.databaseUrl);
