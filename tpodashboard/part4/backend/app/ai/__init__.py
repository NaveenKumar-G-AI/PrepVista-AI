"""Provider-independent AI model connectivity layer.

This package lets the rest of the application talk to multiple AI model
providers (Gemini, Groq, Cerebras, OpenRouter, ...) through one stable
interface (`app.ai.provider.ModelProvider`) without depending on any
provider-specific SDK type. See `docs/ai-providers.md` for the full
architecture, and `app/ai/providers/` for the concrete adapters.

This is the AI *connectivity* foundation only. No planner, coding agent,
tool-execution engine, or model router exists yet -- see each module's
docstring for exactly what is and is not in scope.
"""
