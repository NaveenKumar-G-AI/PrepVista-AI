/**
 * CodeForge — Execution Engine (§21, §23, §24)
 *
 * Runs student-submitted code against a single test case's positional
 * arguments and reports what actually happened — never a guess. This module
 * is the only place in the codebase that shells out to run untrusted code.
 *
 * Isolation in THIS prototype: each call gets its own subprocess and its own
 * throwaway temp directory, with CPU-time, wall-clock, and (for Python)
 * virtual-memory limits enforced by the OS. That is real resource-limiting,
 * verified empirically against this sandbox (see docs/IMPLEMENTATION_MANIFEST.md
 * for the exact ulimit/timeout behavior observed). It is NOT the filesystem/
 * network/multi-tenant isolation a real deployment needs — see
 * docs/CODEFORGE_CHALLENGE_SECURITY.md — production should run this behind a
 * real per-execution container (Docker/gVisor/Firecracker), reachable through
 * the same CodeExecutor interface so nothing above this layer has to change.
 *
 * Node.js note: `ulimit -v` reliably crashes the Node process itself (V8
 * reserves a large virtual address range at startup independent of actual
 * heap usage), so JS memory is bounded with `--max-old-space-size` instead —
 * this was verified directly, not assumed. Java has the identical problem for
 * the identical reason (JVM code-cache reservation) and the identical fix:
 * `-Xmx` instead of `ulimit -v`, also verified directly rather than assumed.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExecutionStatus, SupportedLanguage, type TestCase, type TestResult } from "../domain/types.js";
import { deepEqual } from "./deepEqual.js";

export interface ExecutionLimits {
  wallTimeMs: number;
  cpuTimeSec: number;
  /** Python only — see module note above for why Node/Java use heapMB instead. */
  memoryKB: number;
  /** Node (--max-old-space-size) and Java (-Xmx). */
  heapMB: number;
}

export const DEFAULT_LIMITS: ExecutionLimits = {
  wallTimeMs: 5000,
  cpuTimeSec: 4,
  memoryKB: 262144, // 256 MB
  heapMB: 128,
};

interface HarnessOutcome {
  ok: boolean;
  status: ExecutionStatus;
  actualOutput?: unknown;
  compileError: string | null;
  runtimeError: string | null;
  resourceLimitExceeded: boolean;
  rawStderr: string;
  wallTimeMs: number;
}

const PYTHON_HARNESS = `
import sys, json, importlib.util

spec = importlib.util.spec_from_file_location("solution", "solution.py")
mod = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(mod)
except Exception as e:
    print(json.dumps({"__harness_error__": "compile_error", "message": f"{type(e).__name__}: {e}"}))
    sys.exit(1)

entry = sys.argv[1]
fn = getattr(mod, entry, None)
if fn is None or not callable(fn):
    print(json.dumps({"__harness_error__": "missing_function", "message": f"no callable '{entry}' defined"}))
    sys.exit(1)

with open("args.json") as f:
    args = json.load(f)

try:
    result = fn(*args)
    print(json.dumps({"__harness_result__": result}))
except Exception as e:
    print(json.dumps({"__harness_error__": "runtime_error", "message": f"{type(e).__name__}: {e}"}))
    sys.exit(1)
`.trim();

const NODE_HARNESS = `
import { readFileSync } from "node:fs";

const entry = process.argv[2];

async function main() {
  let mod;
  try {
    mod = await import("./solution.mjs");
  } catch (e) {
    console.log(JSON.stringify({ __harness_error__: "compile_error", message: String((e && e.message) || e) }));
    process.exit(1);
  }
  const fn = mod[entry];
  if (typeof fn !== "function") {
    console.log(JSON.stringify({ __harness_error__: "missing_function", message: \`no export '\${entry}' defined\` }));
    process.exit(1);
  }
  const args = JSON.parse(readFileSync("args.json", "utf8"));
  try {
    const result = await fn(...args);
    console.log(JSON.stringify({ __harness_result__: result === undefined ? null : result }));
  } catch (e) {
    const name = (e && e.constructor && e.constructor.name) || "Error";
    console.log(JSON.stringify({ __harness_error__: "runtime_error", message: \`\${name}: \${(e && e.message) || e}\` }));
    process.exit(1);
  }
}
main();
`.trim();

/**
 * Java has no built-in JSON and (critically) no `javac` binary in this
 * sandbox — only single-file source-launch (`java Foo.java`, JEP 330) is
 * available, which compiles exactly one file in memory and does NOT pull in
 * sibling .java sources (verified directly). So the student's `Solution`
 * class is appended to THIS file rather than written separately, and dispatch
 * uses reflection plus a small hand-rolled JSON parser/serializer (no
 * external library is installable offline). Single-file launch also requires
 * the class containing `main` to be the FIRST class declared in the file
 * (also verified directly, empirically — this is not documented behavior we
 * assumed) — hence the ordering here matters and must be preserved.
 */
const JAVA_HARNESS_PREFIX = `
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;

public class Harness {
    public static void main(String[] rawArgs) {
        try {
            String entry = rawArgs[0];
            String argsJsonText = new String(Files.readAllBytes(Paths.get("args.json")));
            Object parsed = JsonMini.parse(argsJsonText);
            if (!(parsed instanceof List)) {
                System.out.println("{\\"__harness_error__\\":\\"runtime_error\\",\\"message\\":\\"args.json must be a JSON array\\"}");
                return;
            }
            List<?> argList = (List<?>) parsed;

            Class<?> cls;
            try {
                cls = Class.forName("Solution");
            } catch (ClassNotFoundException e) {
                System.out.println("{\\"__harness_error__\\":\\"compile_error\\",\\"message\\":\\"class Solution not found\\"}");
                return;
            }

            Method target = null;
            for (Method m : cls.getMethods()) {
                if (m.getName().equals(entry) && m.getParameterCount() == argList.size()) { target = m; break; }
            }
            if (target == null) {
                System.out.println("{\\"__harness_error__\\":\\"missing_function\\",\\"message\\":\\"no static method '" + entry + "' with \\" + argList.size() + \\" parameter(s) found\\"}");
                return;
            }

            Class<?>[] paramTypes = target.getParameterTypes();
            Object[] coerced = new Object[argList.size()];
            for (int i = 0; i < argList.size(); i++) {
                coerced[i] = JsonMini.coerce(argList.get(i), paramTypes[i]);
            }

            Object result;
            try {
                result = target.invoke(null, coerced);
            } catch (InvocationTargetException ite) {
                Throwable cause = ite.getCause();
                String name = cause == null ? "Exception" : cause.getClass().getSimpleName();
                String msg = cause == null ? ite.getMessage() : cause.getMessage();
                System.out.println("{\\"__harness_error__\\":\\"runtime_error\\",\\"message\\":\\"" + JsonMini.escape(name + ": " + msg) + "\\"}");
                return;
            }

            System.out.println("{\\"__harness_result__\\":" + JsonMini.serialize(result) + "}");
        } catch (Exception e) {
            System.out.println("{\\"__harness_error__\\":\\"runtime_error\\",\\"message\\":\\"" + JsonMini.escape(e.getClass().getSimpleName() + ": " + e.getMessage()) + "\\"}");
        }
    }
}

class JsonMini {
    private final String s;
    private int i = 0;
    private JsonMini(String s) { this.s = s; }

    static Object parse(String text) {
        JsonMini p = new JsonMini(text);
        p.skipWs();
        return p.parseValue();
    }

    private void skipWs() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

    private Object parseValue() {
        skipWs();
        char c = s.charAt(i);
        if (c == '"') return parseString();
        if (c == '[') return parseArray();
        if (c == '{') return parseObject();
        if (c == 't') { i += 4; return Boolean.TRUE; }
        if (c == 'f') { i += 5; return Boolean.FALSE; }
        if (c == 'n') { i += 4; return null; }
        return parseNumber();
    }

    private String parseString() {
        StringBuilder sb = new StringBuilder();
        i++;
        while (s.charAt(i) != '"') {
            char c = s.charAt(i);
            if (c == '\\\\') {
                i++;
                char esc = s.charAt(i);
                switch (esc) {
                    case 'n': sb.append('\\n'); break;
                    case 't': sb.append('\\t'); break;
                    case 'r': sb.append('\\r'); break;
                    case '"': sb.append('"'); break;
                    case '\\\\': sb.append('\\\\'); break;
                    case '/': sb.append('/'); break;
                    case 'u':
                        String hex = s.substring(i + 1, i + 5);
                        sb.append((char) Integer.parseInt(hex, 16));
                        i += 4;
                        break;
                    default: sb.append(esc);
                }
            } else {
                sb.append(c);
            }
            i++;
        }
        i++;
        return sb.toString();
    }

    private Object parseNumber() {
        int start = i;
        while (i < s.length() && (Character.isDigit(s.charAt(i)) || "-+.eE".indexOf(s.charAt(i)) >= 0)) i++;
        return Double.parseDouble(s.substring(start, i));
    }

    private List<Object> parseArray() {
        List<Object> list = new ArrayList<>();
        i++;
        skipWs();
        if (s.charAt(i) == ']') { i++; return list; }
        while (true) {
            list.add(parseValue());
            skipWs();
            if (s.charAt(i) == ',') { i++; skipWs(); continue; }
            if (s.charAt(i) == ']') { i++; break; }
        }
        return list;
    }

    private Map<String, Object> parseObject() {
        Map<String, Object> map = new LinkedHashMap<>();
        i++;
        skipWs();
        if (s.charAt(i) == '}') { i++; return map; }
        while (true) {
            skipWs();
            String key = parseString();
            skipWs();
            i++;
            Object val = parseValue();
            map.put(key, val);
            skipWs();
            if (s.charAt(i) == ',') { i++; continue; }
            if (s.charAt(i) == '}') { i++; break; }
        }
        return map;
    }

    @SuppressWarnings("unchecked")
    static Object coerce(Object v, Class<?> targetType) {
        if (v == null) return null;
        if (targetType == int.class || targetType == Integer.class) return ((Double) v).intValue();
        if (targetType == long.class || targetType == Long.class) return ((Double) v).longValue();
        if (targetType == double.class || targetType == Double.class) return v;
        if (targetType == float.class || targetType == Float.class) return ((Double) v).floatValue();
        if (targetType == boolean.class || targetType == Boolean.class) return v;
        if (targetType == String.class) return v;
        if (targetType == int[].class) {
            List<Object> list = (List<Object>) v;
            int[] arr = new int[list.size()];
            for (int j = 0; j < list.size(); j++) arr[j] = ((Double) list.get(j)).intValue();
            return arr;
        }
        if (targetType == double[].class) {
            List<Object> list = (List<Object>) v;
            double[] arr = new double[list.size()];
            for (int j = 0; j < list.size(); j++) arr[j] = (Double) list.get(j);
            return arr;
        }
        if (targetType == String[].class) {
            List<Object> list = (List<Object>) v;
            String[] arr = new String[list.size()];
            for (int j = 0; j < list.size(); j++) arr[j] = (String) list.get(j);
            return arr;
        }
        return v;
    }

    static String serialize(Object v) {
        if (v == null) return "null";
        if (v instanceof String) return "\\"" + escape((String) v) + "\\"";
        if (v instanceof Boolean) return v.toString();
        if (v instanceof Integer || v instanceof Long) return v.toString();
        if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (d == Math.floor(d) && !Double.isInfinite(d) && Math.abs(d) < 1e15) return String.valueOf((long) d);
            return String.valueOf(d);
        }
        if (v instanceof int[]) {
            int[] a = (int[]) v;
            StringBuilder sb = new StringBuilder("[");
            for (int j = 0; j < a.length; j++) { if (j > 0) sb.append(","); sb.append(a[j]); }
            return sb.append("]").toString();
        }
        if (v instanceof double[]) {
            double[] a = (double[]) v;
            StringBuilder sb = new StringBuilder("[");
            for (int j = 0; j < a.length; j++) { if (j > 0) sb.append(","); sb.append(serialize(a[j])); }
            return sb.append("]").toString();
        }
        if (v instanceof Object[]) {
            Object[] a = (Object[]) v;
            StringBuilder sb = new StringBuilder("[");
            for (int j = 0; j < a.length; j++) { if (j > 0) sb.append(","); sb.append(serialize(a[j])); }
            return sb.append("]").toString();
        }
        if (v instanceof List) {
            List<?> list = (List<?>) v;
            StringBuilder sb = new StringBuilder("[");
            for (int j = 0; j < list.size(); j++) { if (j > 0) sb.append(","); sb.append(serialize(list.get(j))); }
            return sb.append("]").toString();
        }
        if (v instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) v;
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : map.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\\"").append(escape(String.valueOf(e.getKey()))).append("\\":").append(serialize(e.getValue()));
            }
            return sb.append("}").toString();
        }
        return "\\"" + escape(v.toString()) + "\\"";
    }

    static String escape(String s) {
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\\\\""); break;
                case '\\\\': sb.append("\\\\\\\\"); break;
                case '\\n': sb.append("\\\\n"); break;
                case '\\r': sb.append("\\\\r"); break;
                case '\\t': sb.append("\\\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }
}
`.trim();

/** Student code (a package-private \`class Solution { ... }\`) is appended after this — see the harness docstring for why it can't be a separate file. */
function buildJavaSource(studentCode: string): string {
  return `${JAVA_HARNESS_PREFIX}\n\n${studentCode}`;
}

function runSubprocess(
  language: SupportedLanguage,
  code: string,
  entryFunction: string,
  args: unknown[],
  limits: ExecutionLimits,
): HarnessOutcome {
  const dir = mkdtempSync(path.join(tmpdir(), "codeforge-exec-"));
  const start = Date.now();
  try {
    writeFileSync(path.join(dir, "args.json"), JSON.stringify(args));

    let command: string;
    if (language === SupportedLanguage.PYTHON) {
      writeFileSync(path.join(dir, "solution.py"), code);
      writeFileSync(path.join(dir, "harness.py"), PYTHON_HARNESS);
      command = `ulimit -v ${limits.memoryKB}; ulimit -t ${limits.cpuTimeSec}; exec python3 harness.py "${entryFunction}"`;
    } else if (language === SupportedLanguage.JAVASCRIPT) {
      writeFileSync(path.join(dir, "solution.mjs"), code);
      writeFileSync(path.join(dir, "harness.mjs"), NODE_HARNESS);
      command = `ulimit -t ${limits.cpuTimeSec}; exec node --max-old-space-size=${limits.heapMB} harness.mjs "${entryFunction}"`;
    } else {
      // JAVA — combined single file (see buildJavaSource docstring); args.json still shared via cwd.
      writeFileSync(path.join(dir, "Harness.java"), buildJavaSource(code));
      command = `ulimit -t ${limits.cpuTimeSec}; exec java -Xmx${limits.heapMB}m Harness.java "${entryFunction}"`;
    }

    const res = spawnSync("bash", ["-c", command], {
      cwd: dir,
      timeout: limits.wallTimeMs,
      killSignal: "SIGKILL",
      encoding: "utf8",
      maxBuffer: 2_000_000,
    });
    const wallTimeMs = Date.now() - start;

    if (res.error) {
      return {
        ok: false,
        status: ExecutionStatus.SYSTEM_ERROR,
        compileError: null,
        runtimeError: `platform error launching subprocess: ${res.error.message}`,
        resourceLimitExceeded: false,
        rawStderr: "",
        wallTimeMs,
      };
    }

    // Killed by a signal (our wall-clock timeout, ulimit -t, or a Node heap abort).
    // We deliberately do NOT claim to know which one — see module docstring.
    if (res.signal) {
      return {
        ok: false,
        status: ExecutionStatus.FAILED,
        compileError: null,
        runtimeError: "execution stopped: exceeded the allotted time or memory",
        resourceLimitExceeded: true,
        rawStderr: (res.stderr ?? "").slice(0, 2000),
        wallTimeMs,
      };
    }

    const stdout = (res.stdout ?? "").trim();
    const lastLine = stdout.split("\n").filter(Boolean).pop() ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(lastLine);
    } catch {
      // fall through — treated as a system error below
    }

    if (parsed && "__harness_result__" in parsed) {
      return {
        ok: true,
        status: ExecutionStatus.RUNNING,
        actualOutput: parsed.__harness_result__,
        compileError: null,
        runtimeError: null,
        resourceLimitExceeded: false,
        rawStderr: "",
        wallTimeMs,
      };
    }

    if (parsed && "__harness_error__" in parsed) {
      const kind = parsed.__harness_error__ as string;
      return {
        ok: false,
        status: ExecutionStatus.FAILED,
        compileError: kind === "compile_error" ? parsed.message : null,
        runtimeError: kind !== "compile_error" ? parsed.message : null,
        resourceLimitExceeded: false,
        rawStderr: (res.stderr ?? "").slice(0, 2000),
        wallTimeMs,
      };
    }

    // Non-zero exit / unparseable output the harness itself didn't explain.
    // Java special case: a student compile error prevents the WHOLE combined
    // file from compiling, so nothing ever reaches the harness's own
    // try/catch (unlike Python/JS, which import the student file at runtime
    // and can catch a syntax error themselves) — javac's own stderr is the
    // only signal here, verified directly against this sandbox's compiler.
    if (language === SupportedLanguage.JAVA && /error:/.test(res.stderr ?? "")) {
      return {
        ok: false,
        status: ExecutionStatus.FAILED,
        compileError: (res.stderr ?? "").trim().slice(0, 1000),
        runtimeError: null,
        resourceLimitExceeded: false,
        rawStderr: (res.stderr ?? "").slice(0, 2000),
        wallTimeMs,
      };
    }

    return {
      ok: false,
      status: ExecutionStatus.SYSTEM_ERROR,
      compileError: null,
      runtimeError: `unexpected process exit (code ${res.status}); stderr: ${(res.stderr ?? "").slice(0, 500)}`,
      resourceLimitExceeded: false,
      rawStderr: (res.stderr ?? "").slice(0, 2000),
      wallTimeMs,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs one test case and scores it against the expected output. Never throws. */
export function runTestCase(
  language: SupportedLanguage,
  code: string,
  entryFunction: string,
  comparisonMode: "exact" | "unordered_collection",
  testCase: TestCase,
  limits: ExecutionLimits = DEFAULT_LIMITS,
): { result: TestResult; outcome: HarnessOutcome } {
  const outcome = runSubprocess(language, code, entryFunction, testCase.input, limits);

  if (!outcome.ok) {
    const errorKind: TestResult["errorKind"] = outcome.resourceLimitExceeded
      ? "resource_limit"
      : outcome.compileError
        ? "compile_error"
        : outcome.status === ExecutionStatus.SYSTEM_ERROR
          ? "system_error"
          : "runtime_error";
    return {
      outcome,
      result: {
        testId: testCase.id,
        category: testCase.category,
        hidden: testCase.hidden,
        passed: false,
        expectedOutput: testCase.hidden ? undefined : testCase.expectedOutput,
        errorMessage: outcome.compileError ?? outcome.runtimeError ?? "execution failed",
        errorKind,
      },
    };
  }

  const passed = deepEqual(outcome.actualOutput, testCase.expectedOutput, comparisonMode);
  return {
    outcome,
    result: {
      testId: testCase.id,
      category: testCase.category,
      hidden: testCase.hidden,
      passed,
      // Hidden tests never expose actual/expected values (§18, §43) — only whether they passed.
      // A visible error message is still fine to keep: it describes the student's own code
      // behavior (e.g. "TypeError: ..."), not the hidden test's secret input or answer.
      actualOutput: testCase.hidden ? undefined : outcome.actualOutput,
      expectedOutput: testCase.hidden ? undefined : testCase.expectedOutput,
    },
  };
}
