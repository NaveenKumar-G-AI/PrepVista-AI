import 'dotenv/config';

export const env = {
  port: parseInt(process.env.PORT || '4007', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  feature5: {
    apiUrl: process.env.FEATURE5_API_URL || '',
    apiKey: process.env.FEATURE5_API_KEY || '',
  },
  feature6: {
    apiUrl: process.env.FEATURE6_API_URL || '',
    apiKey: process.env.FEATURE6_API_KEY || '',
  },
  jwtSecret: process.env.JWT_SECRET || '',
};

// Every one of these is designed to default to a working local behaviour
// when the corresponding key/URL is left blank — see .env.example.
export const usingMockFeature5 = !env.feature5.apiUrl;
export const usingMockFeature6 = !env.feature6.apiUrl;
export const usingAiExplanations = !!env.anthropicApiKey;
