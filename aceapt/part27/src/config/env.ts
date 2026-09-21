import "dotenv/config";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value.toLowerCase() === "true";
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: num(process.env.PORT, 4027),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: (process.env.NODE_ENV ?? "development") === "production",

  // Left blank on purpose — see .env.example. Nothing in this module reads
  // these as if a value is guaranteed to be present.
  databaseUrl: process.env.DATABASE_URL ?? "",
  authJwtPublicKey: process.env.AUTH_JWT_PUBLIC_KEY ?? "",
  authServiceUrl: process.env.AUTH_SERVICE_URL ?? "",

  aiProviderEnabled: bool(process.env.AI_PROVIDER_ENABLED, false),
  aiProviderApiKey: process.env.AI_PROVIDER_API_KEY ?? "",
  aiProviderModel: process.env.AI_PROVIDER_MODEL ?? "",
  aiProviderBaseUrl: process.env.AI_PROVIDER_BASE_URL ?? "https://api.anthropic.com/v1/messages",

  forecastCacheMaxAgeMs: num(process.env.FORECAST_CACHE_MAX_AGE_MS, 1000 * 60 * 30),
  defaultForecastHorizonWeeks: num(process.env.DEFAULT_FORECAST_HORIZON_WEEKS, 3),
};
