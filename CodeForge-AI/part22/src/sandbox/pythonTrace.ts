/**
 * Structured execution trace for Python, built on `sys.settrace` - the same
 * primitive `pdb` and coverage tools use. This is real instrumentation of
 * the real interpreter; nothing here is synthesized.
 *
 * Scope, by design:
 *  - Only frames whose `co_filename` is the student's own file are traced
 *    (stdlib frames are skipped) - both for signal quality and so tracing
 *    itself can't be turned into a resource-exhaustion vector.
 *  - Event count is capped (`MAX_TRACE_EVENTS`); once hit, tracing stops and
 *    the result is marked truncated rather than silently incomplete.
 *  - Variable values are captured via `repr()`, best-effort, and truncated;
 *    unrepresentable values become the literal string "<unrepr-able>"
 *    rather than throwing and losing the whole trace.
 */

export type TraceEventType = "call" | "line" | "return" | "exception";

export interface TraceEvent {
  type: TraceEventType;
  function: string;
  line: number;
  locals?: Record<string, string>;
  returnValue?: string;
  exceptionType?: string;
  exceptionMessage?: string;
}

export const TRACE_ENTRY_FILE = "_trace_harness.py";
export const TRACE_OUTPUT_FILE = "trace.jsonl";
export const MAX_TRACE_EVENTS = 2000;

export function buildTraceHarness(userEntryFile: string): string {
  return `
import sys, json

_EVENTS = []
_MAX_EVENTS = ${MAX_TRACE_EVENTS}
_USER_FILE = ${JSON.stringify(userEntryFile)}
_TRUNCATED = False

def _safe_repr(v):
    try:
        s = repr(v)
    except Exception:
        return "<unrepr-able>"
    return s if len(s) <= 200 else s[:200] + "...[truncated]"

def _tracer(frame, event, arg):
    global _TRUNCATED
    if len(_EVENTS) >= _MAX_EVENTS:
        _TRUNCATED = True
        return None
    if frame.f_code.co_filename != _USER_FILE:
        return _tracer if event == "call" else None
    if event in ("call", "line", "return"):
        entry = {"type": event, "function": frame.f_code.co_name, "line": frame.f_lineno}
        if event in ("line", "return"):
            snap = {}
            for k, v in list(frame.f_locals.items())[:20]:
                if k.startswith("__"):
                    continue
                snap[k] = _safe_repr(v)
            entry["locals"] = snap
        if event == "return":
            entry["returnValue"] = _safe_repr(arg)
        _EVENTS.append(entry)
    elif event == "exception":
        exc_type, exc_val, _tb = arg
        _EVENTS.append({
            "type": "exception",
            "function": frame.f_code.co_name,
            "line": frame.f_lineno,
            "exceptionType": exc_type.__name__,
            "exceptionMessage": str(exc_val)[:300],
        })
    return _tracer

sys.settrace(_tracer)
try:
    with open(_USER_FILE) as _f:
        _code = compile(_f.read(), _USER_FILE, "exec")
    exec(_code, {"__name__": "__main__"})
finally:
    sys.settrace(None)
    with open(${JSON.stringify(TRACE_OUTPUT_FILE)}, "w") as _tf:
        for _e in _EVENTS:
            _tf.write(json.dumps(_e) + "\\n")
        if _TRUNCATED:
            _tf.write(json.dumps({"type": "line", "function": "<trace>", "line": 0, "locals": {"_truncated": "true"}}) + "\\n")
`.trimStart();
}

export function parseTraceFile(raw: string): { events: TraceEvent[]; truncated: boolean } {
  const events: TraceEvent[] = [];
  let truncated = false;
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as TraceEvent & { locals?: Record<string, string> };
      if (parsed.function === "<trace>" && parsed.locals?._truncated === "true") {
        truncated = true;
        continue;
      }
      events.push(parsed);
    } catch {
      // A malformed line means we drop that single event rather than the
      // whole trace or, worse, fabricating a replacement.
    }
  }
  return { events, truncated };
}
