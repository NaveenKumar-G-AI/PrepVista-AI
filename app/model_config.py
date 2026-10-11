"""Canonical Groq model defaults and retired deployment-value compatibility.

Defaults verified against https://console.groq.com/docs/models and
https://console.groq.com/docs/deprecations on 2026-10-07.
"""
GROQ_FAST_MODEL = "openai/gpt-oss-20b"
GROQ_QUALITY_MODEL = "openai/gpt-oss-120b"
_RETIRED_MODELS = {
    "llama3-70b-8192": GROQ_QUALITY_MODEL,
    "llama-3.1-70b-versatile": GROQ_QUALITY_MODEL,
    "llama-3.3-70b-versatile": GROQ_QUALITY_MODEL,
    "llama3-8b-8192": GROQ_FAST_MODEL,
    "llama-3.1-8b-instant": GROQ_FAST_MODEL,
}


def canonical_groq_model(value: str) -> str:
    value = value.strip()
    return _RETIRED_MODELS.get(value, value)
