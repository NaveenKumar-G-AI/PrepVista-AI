import { RequestError } from '@/lib/security';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

// Hosting dashboards can preserve quotes that dotenv would normally remove.
function unquote(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function geminiConfig() {
  const key = unquote(process.env.GEMINI_API_KEY ?? '');
  if (!key) {
    throw new RequestError(503, 'AI mentoring is not configured yet. You can continue with the authored hints and coding exercises.');
  }
  const configured = unquote(process.env.GEMINI_MODEL ?? '');
  // Google returns resource names as models/{model}; the URL adds models/ below.
  const model = (configured || DEFAULT_GEMINI_MODEL).replace(/^models\//, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(model)) {
    throw new RequestError(503, 'The AI mentor has an invalid model setting. Contact the site administrator or continue with the authored hints.');
  }
  return { key, model };
}
