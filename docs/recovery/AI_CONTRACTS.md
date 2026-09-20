# AI contracts
Interview scoring: services/llm.py -> Groq primary, optional OpenAI fallback remains in code (user does not want an OpenAI key). evaluator_scoring validates plan-specific 0..2 dimension fields only under strict_evidence. Legacy paths can produce heuristic fallback scores after provider failure. Coding uses app/ai registry, Groq or configured Gemini, typed MentorAnswer, shared DB reservations.

Question orchestration V2 is deterministic catalog + bounded answer-led probes; legacy question generation remains reachable for stored older sessions. Speech: browser STT/server Groq Whisper, optional Deepgram. Provider responses are untrusted. Precise prompt/model/version persistence and provider outage cases require further verification.


Recovery routes all queued interview evaluations through strict_evidence=True; missing or invalid output stays unavailable and retryable. The obsolete finish-time provider backfill is now a queue-only compatibility adapter. Evaluation records include rubric/prompt version labels and the configured evaluation model; that model label is configuration provenance, not proof of the provider used if an adapter internally falls back. No OpenAI key or live model request was used for the local recovery tests.

Names extracted by a model must match resume source text (case-insensitively, preserving source spelling/case in the result); otherwise the name remains unknown and setup may use the existing profile name. The parser no longer assumes the first resume line is a person's name.
