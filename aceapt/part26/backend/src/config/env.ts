import "dotenv/config";

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "",
  databaseUrl: process.env.DATABASE_URL || ""
};
