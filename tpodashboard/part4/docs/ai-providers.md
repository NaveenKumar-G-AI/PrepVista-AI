# AI Model Provider System — Part 4

## 1. Scope

This is the AI **connectivity** foundation: a provider-independent way to
call an LLM and get back a normalized response. It is explicitly **not**
the planner, coding agent, tool-execution engine, model router, or
autonomous loop — those are later parts. Nothing in `app/api/` or
`app/services/` calls into this layer yet; it exists for future parts to
build on.

## 2. Provider abstraction

```
Future agent / orchestrator (not built yet)
        │
        ▼
 app.ai.provider.ModelProvider   <- the only thing future code depends on
        │
        ▼
 app.ai.registry.ProviderRegistry.get("gemini" | "groq" | "cerebras" |
                                        "openrouter" | "mock")
        │
        ▼
 Concrete adapter (app/ai/providers/*.py)
        │
        ▼
 Provider SDK  →  External API
```

`ModelProvider` (`app/ai/provider.py`) is an `abc.ABC` — chosen over a bare
`typing.Protocol` because this family needs shared lifecycle behavior (a
default no-op `aclose()`) and participates in a name-keyed registry, which
suits nominal typing better. Every adapter implements four methods:

```python
class ModelProvider(ABC):
    name: str
    async def generate(self, request: ModelRequest) -> ModelResponse: ...
    def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]: ...
    async def health(self) -> ProviderHealth: ...
    async def aclose(self) -> None: ...  # default no-op
```

Future code obtains a provider through the registry, never by importing an
adapter class directly:

```python
from app.ai.registry import build_default_registry

registry = build_default_registry(settings)
provider = registry.get("gemini")  # returns a ModelProvider, nothing more specific
response = await provider.generate(request)
```

This is what makes the dependency-inversion rule (`Agent → ModelProvider →
Provider implementation → External API`, never `Agent → Gemini SDK`) hold
at the import-graph level, not just as a docstring convention.

## 3. Providers implemented

| Provider | SDK used | Why |
|---|---|---|
| **Gemini** | `google-genai` (`genai.Client`) | Google's current unified SDK — GA and the recommended integration path since May 2025, superseding the deprecated `google-generativeai` package. Confirmed current via web search in August 2026. |
| **Groq** | `groq` (`AsyncGroq`) | Official SDK; OpenAI-chat-completions-compatible wire format. |
| **Cerebras** | `cerebras-cloud-sdk` (`AsyncCerebras`) | Official SDK; also OpenAI-chat-completions-compatible. |
| **OpenRouter** | `openai` (`AsyncOpenAI` with `base_url` override) | OpenRouter has no dedicated first-party SDK requirement — their own documentation states the supported integration path is the official OpenAI SDK pointed at `https://openrouter.ai/api/v1`. Using it is *following* current official guidance, not a workaround. |
| **Mock** | none (in-memory) | Deterministic, mandatory for tests — see §7. |

All SDK choices were verified against current provider documentation
(searched August 2026) rather than assumed from training data — see the
note on Gemini below for the one place that mattered concretely.

**A note on Gemini's newer "Interactions" API.** Gemini has recently
introduced a stateful `client.interactions.create(...)` API with
server-side conversation threads (`previous_interaction_id`). This adapter
deliberately does **not** use it: it has no equivalent in any other
provider here, and it doesn't fit this layer's stateless
`ModelRequest → ModelResponse` contract, where the caller always supplies
the full message history itself. `client.aio.models.generate_content(...)`
(and its streaming sibling) remains fully supported and is the correct fit
— see `app/ai/providers/gemini.py`'s module docstring for the full
reasoning.

**Local model support.** `ProviderRegistry` has no built-in assumption
about what a provider *is* — a future `LocalModelProvider` registers the
same way the four above do (`registry.register("local", factory)`). No
local inference runtime is installed or implemented in Part 4; there was
nothing already in the repository to build on, and the spec is explicit
that Part 4 should only create the extension point, not a runtime.

## 4. Configuration

All provider configuration comes from `Settings.ai` (Part 2) — no
provider adapter reads `os.environ` directly:

| Setting | Env var | Used for |
|---|---|---|
| `settings.ai.gemini_api_key` | `GEMINI_API_KEY` | Gemini adapter |
| `settings.ai.groq_api_key` | `GROQ_API_KEY` | Groq adapter |
| `settings.ai.cerebras_api_key` | `CEREBRAS_API_KEY` | Cerebras adapter |
| `settings.ai.openrouter_api_key` | `OPENROUTER_API_KEY` | OpenRouter adapter |
| `settings.ai.request_timeout_seconds` | `AI_REQUEST_TIMEOUT` | Default per-request timeout for every adapter |

Every key is a `pydantic.SecretStr` — masked in `repr()`/`str()`/logs by
construction (see `docs/configuration.md` §Secret-handling rules, which
this layer inherits unchanged). `build_default_registry(settings)`
registers all five providers unconditionally, whether or not their key is
set — constructing an adapter is cheap and side-effect-free. A missing key
only surfaces when you actually call `generate()`/`stream()` (as a clear
`ConfigurationError`, message never contains the key) or `health()` (as
`misconfigured`). This keeps "is this provider configured" a runtime
question, not an import-time crash — see `tests/unit/ai/test_security.py`
for the tests that pin this behavior down.

`model` (which specific model to use) is always a required field on
`ModelRequest` — never defaulted or hardcoded anywhere in this layer, per
the spec's explicit instruction not to assume a model name will remain
valid forever.

## 5. Request / response normalization

`app/ai/types.py` defines the provider-independent shapes:

- **`Message`** — `role` (`system`/`user`/`assistant`/`tool`), `content`,
  and (for assistant/tool turns) `tool_calls`/`tool_call_id`.
- **`ModelRequest`** — `messages`, `system` (a dedicated slot, kept
  separate from `messages` since some provider APIs — Gemini's Interactions
  API among them — accept it as its own field rather than a leading
  message), `model`, `temperature`, `max_output_tokens`, `stop_sequences`,
  `tools`, `timeout_seconds`, plus `metadata` (caller-side observability,
  never sent to the provider) and `provider_options` (an escape hatch for
  genuinely provider-specific parameters with no cross-provider meaning).
- **`ModelResponse`** — `content`, `provider`, `model`, `finish_reason`
  (a `FinishReason` enum: `stop`/`length`/`tool_calls`/`content_filter`/
  `error`/`unknown`), `usage`, `tool_calls`, `request_id`, `cost` (always
  `None` unless a verified pricing source is configured — never
  fabricated), `metadata`. Never wraps or exposes a raw SDK response
  object.
- **`Usage`** — `input_tokens`/`output_tokens`/`total_tokens`, every field
  nullable. `Usage.unavailable()` is the explicit constructor for "this
  provider reported nothing," used instead of inventing zeros.
- **`ToolCall`** / **`ToolDefinition`** — see §6.

Each adapter's job is exactly this translation, in both directions —
nothing else. The two translation styles in this codebase:

- **Shared** (`app/ai/providers/openai_compatible.py`): Groq, Cerebras,
  and OpenRouter all speak the same OpenAI-chat-completions wire format,
  so `translate_request`/`translate_response`/`translate_stream`/
  `classify_error` are written once and reused by all three thin adapters.
- **Dedicated** (`app/ai/providers/gemini.py`): Gemini's `Content`/`Part`
  structure, `system_instruction` config field, `"model"` role name (not
  `"assistant"`), and `function_call`/`function_response` parts are
  different enough that it owns its own translation functions in the same
  file, not shared with anyone.

## 6. Tool calls

`ToolDefinition` (`name`, `description`, `input_schema` as JSON Schema) is
how a request offers tools to the model; `ToolCall` (`id`, `name`,
`arguments` — always a parsed `dict`, never raw JSON text) is how a
response reports what the model wants to call. Both providers' native
formats are translated into these two shapes — OpenAI-style `tool_calls`
arrays for Groq/Cerebras/OpenRouter, `function_call`/`FunctionDeclaration`
parts for Gemini. **Tool *execution* is out of scope** — this layer only
represents the call and its arguments; actually running a tool and feeding
the result back belongs to Part 5.

## 7. Errors

`app/ai/errors.py` defines a normalized hierarchy, all subclassing
`ProviderError`:

```
ProviderError (code, provider, model, status_code, retryable, provider_request_id)
├── AuthenticationError       (not retryable)
├── RateLimitError            (retryable)
├── ProviderTimeoutError      (retryable)
├── InvalidRequestError       (not retryable)
├── ModelNotFoundError        (not retryable)
├── ProviderUnavailableError  (retryable)
├── MalformedResponseError    (not retryable)
└── ConfigurationError        (not retryable -- adapter misconfigured, no request was ever sent)

ProviderNotRegisteredError(LookupError)  -- unknown name passed to registry.get(); not a
                                              ProviderError since no provider was ever contacted
```

Every raised error carries diagnostic metadata that's safe to log
(provider, model, HTTP status, a retryability flag, the provider's own
request ID) and **never** a prompt, an API key, or a raw header —
`ProviderError.to_info()` produces the serializable summary
(`ProviderErrorInfo`) used in `ErrorEvent`s and safe to pass to a logger
as-is.

**Retry classification.** `retryable` defaults per error class (rate
limits, timeouts, and provider-unavailable errors default `True`;
everything else defaults `False`) and can be overridden per-instance. Part
4 does **not** implement a retry loop — this is exactly the information
the future retry engine (Part 5/12) needs to make that decision, exposed
and nothing more.

**Classification strategy.** Both `openai_compatible.classify_error` and
`gemini.classify_error` use duck typing (`getattr(exc, "status_code"/
"code", None)`, plus a fallback check on the exception class name for
`"Timeout"`/`"Connection"`) rather than `isinstance` checks against
imported SDK exception classes. This is deliberate: it degrades gracefully
across SDK versions (an unrecognized exception still falls through to the
generic `ProviderError` rather than crashing the classifier) and makes the
classification logic fully testable with plain fake exception objects, as
opposed to needing to construct real, and potentially version-fragile, SDK
exception instances in tests.

## 8. Streaming

`ModelProvider.stream(request)` is an async generator yielding
`StreamEvent`s (`app/ai/types.py`, a `pydantic` discriminated union on a
`type` field):

```
TextDeltaEvent      {"type": "text_delta", "text": "..."}
ToolCallDeltaEvent   {"type": "tool_call_delta", "index": 0, "id": ..., "name": ..., "arguments_delta": "..."}
UsageEvent           {"type": "usage", "usage": {...}}
CompletedEvent        {"type": "completed", "response": <full ModelResponse>}
ErrorEvent            {"type": "error", "error": <ProviderErrorInfo>}
```

A stream always ends in exactly one of `CompletedEvent` or `ErrorEvent` —
**errors are yielded, not raised**, so a consumer can use one uniform
`async for event in provider.stream(request)` loop for both success and
failure instead of wrapping every stream in `try`/`except`.
`ToolCallDeltaEvent.index` disambiguates interleaved deltas when a model
requests multiple tool calls in parallel; `arguments_delta` is a partial
JSON text fragment that accumulates across deltas for the same index.
Provider-specific streaming shapes (SSE chunks, Gemini's async
`generate_content_stream` iterator) never leak past the adapter that
produced them.

## 9. Mock provider

`app/ai/providers/mock.py`'s `MockModelProvider` is mandatory
infrastructure for every future agent test — deterministic, in-memory,
zero network calls, zero cost. Scenario selection is via
`request.metadata["mock_scenario"]`:

| Scenario | Behavior |
|---|---|
| `normal` (default) | Short deterministic text response |
| `long_response` | ~50-sentence response, for testing truncation/pagination |
| `tool_call` | Returns a deterministic `read_file` tool call |
| `rate_limit` | Raises `RateLimitError` (or yields an `ErrorEvent` when streaming) |
| `timeout` | Raises `ProviderTimeoutError` |
| `unavailable` | Raises `ProviderUnavailableError` |
| `malformed` | Raises `MalformedResponseError` |

```python
from app.ai.providers.mock import MockModelProvider
from app.ai.types import Message, ModelRequest, Role

provider = MockModelProvider()
request = ModelRequest(
    messages=[Message(role=Role.user, content="hi")],
    model="mock-model",
    metadata={"mock_scenario": "tool_call"},
)
response = await provider.generate(request)  # deterministic tool-call response, no network
```

Both `generate()` and `stream()` support every scenario, so an agent's
error-handling and streaming code paths can be tested without hitting the
`rate_limit`/`timeout`/etc. corner cases of a real provider.

## 10. Testing strategy

No test in this codebase makes a real network call to any provider. Three
layers, all under `backend/tests/unit/ai/`:

- **Unit tests** for each module in isolation: `test_types.py`,
  `test_errors.py`, `test_registry.py`, `test_mock_provider.py`,
  `test_openai_compatible.py` (the shared translation logic),
  `test_gemini_translation.py` (Gemini's own translation logic),
  `test_security.py` (API keys never leak — see below).
- **Provider contract tests** (`contract.py` + one
  `test_<provider>_contract.py` per provider): the exact same
  `ProviderContractTests` suite (`test_basic_generation`,
  `test_system_message`, `test_multiple_messages`,
  `test_response_normalization`, `test_usage_normalization`,
  `test_tool_call_normalization`, `test_error_normalization_rate_limit`,
  `test_timeout`, `test_streaming`, `test_streaming_tool_call`,
  `test_streaming_error_yields_error_event`, `test_health_returns_a_status`)
  runs against Mock, Groq, Cerebras, OpenRouter, and Gemini, each wired to
  a fake transport via that provider's own `provider_factory` fixture.
  This guarantees every provider behaves identically at the `ModelProvider`
  boundary, regardless of its underlying SDK.
- **Fakes, not mocks-of-real-SDK-objects** (`fakes.py`): plain
  `SimpleNamespace`-based stand-ins that expose only the attributes each
  adapter actually reads (duck typing), injected via each adapter's
  `client=` constructor parameter. This keeps the fakes small, makes
  exactly what each adapter depends on obvious, and avoids coupling tests
  to the real SDKs' full (and more complex) response-object construction.

**Security tests** (`test_security.py`, spec §Security testing) verify:
API keys never appear in a `ConfigurationError`'s message, never appear in
a provider's `repr()`, are never logged (checked via `caplog`), and
`Settings.ai`'s `repr()`/`str()` mask every provider key. Every fake key
used in tests is obviously fake (`fake-test-key-not-a-real-credential-...`).

**Live provider testing.** None exists yet, and none is required for Part
4 — no real credentials are available in this environment, and the spec
only requires live tests as an *optional*, explicitly-separated addition.
If a future contributor wants to add one, it should live under a separate
`make test-live-ai` target that skips cleanly when credentials are absent,
per the spec's §Live API testing.

## 11. Adding a new provider

1. Implement `ModelProvider` (`app/ai/provider.py`) in a new file under
   `app/ai/providers/`.
2. If the new provider speaks the OpenAI-chat-completions wire format,
   reuse `app/ai/providers/openai_compatible.py`'s `translate_request` /
   `translate_response` / `translate_stream` / `classify_error` — see
   `groq.py`, `cerebras.py`, or `openrouter.py` for the ~90-line pattern to
   copy (client construction + four thin methods delegating to the shared
   functions). Otherwise, write your own translation functions in the new
   file, following `gemini.py`'s structure.
3. Normalize errors into the hierarchy in `app/ai/errors.py` — don't let a
   raw SDK exception escape the adapter.
4. Add a `ConfigurationError` at the point of first real use if the
   provider requires credentials, not at construction time.
5. Add the provider's credential/config fields to `AISettings`
   (`app/core/config.py`) if new ones are needed, and to `.env.example`.
6. Register it in `build_default_registry()` (`app/ai/registry.py`).
7. Add contract tests: a new `test_<provider>_contract.py` subclassing
   `ProviderContractTests`, with a `provider_factory` fixture that wires
   your fake transport to the four scenario names
   (`"success"`/`"tool_call"`/`"rate_limit"`/`"timeout"`). Add fakes to
   `tests/unit/ai/fakes.py` if the wire shape is new.
8. Add any adapter-specific translation tests the shared contract suite
   doesn't cover (see `test_gemini_translation.py` for the shape).
9. Document it in the table in §3 above.

No existing provider file, the registry's public interface, or any future
agent code needs to change to do this — that's the point of the
abstraction.
