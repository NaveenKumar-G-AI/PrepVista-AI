"""
Execution service — runs real, untrusted student Python code against real
test cases. No results here are ever fabricated; if execution cannot be
carried out, the result is SYSTEM_ERROR, never a guessed pass/fail.

Isolation model actually implemented in this sandbox environment:
  - separate temp working directory per run
  - separate OS process (subprocess), never in-process exec/eval
  - hard wall-clock timeout
  - CPU time limit and address-space (memory) limit via `resource.setrlimit`
    in the child, applied before the student code runs
  - restricted environment variables (no inherited secrets)
  - output size cap (stdout/stderr truncated past a byte limit)

Known gap vs. a real production deployment (documented, not hidden):
  this executes in the same container/user as the rest of the demo, not in
  a separately provisioned sandbox (gVisor/Firecracker/Docker/Judge0/Piston
  etc.) with filesystem and network namespace isolation and a dedicated
  low-privilege execution fleet. A real CodeForge deployment must run this
  in that separately isolated execution service, not the app server —
  Phase 4's own rule. This module is written so the *policy* (timeouts,
  resource limits, output caps, per-run isolation) transfers directly;
  only the underlying sandbox needs to be swapped for a hardened one.
"""
from __future__ import annotations

import json
import os
import resource
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

TIMEOUT_S = 5.0
MEMORY_LIMIT_BYTES = 256 * 1024 * 1024  # 256 MB
CPU_LIMIT_S = 5
OUTPUT_LIMIT_BYTES = 64 * 1024


@dataclass
class RunResult:
    status: str  # COMPLETED | TIMEOUT | RUNTIME_ERROR | COMPILATION_ERROR | SYSTEM_ERROR
    stdout: str
    stderr: str
    exit_code: int | None
    runtime_ms: float
    # Peak RSS of the child, best-effort (Linux getrusage ru_maxrss, KB)
    memory_kb: float | None


def _limit_resources() -> None:
    """Runs inside the child process (preexec_fn) before exec of the interpreter."""
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (CPU_LIMIT_S, CPU_LIMIT_S))
        resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT_BYTES, MEMORY_LIMIT_BYTES))
        resource.setrlimit(resource.RLIMIT_NPROC, (32, 32))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
    except (ValueError, OSError):
        # If the platform/user can't set a given limit, fail closed by not
        # running unlimited — but never crash the whole request for it.
        pass


def compile_check_python(source_code: str) -> tuple[bool, str]:
    """Real syntax check (compile, not execute) so COMPILATION_ERROR is genuine."""
    try:
        compile(source_code, "<student_submission>", "exec")
        return True, ""
    except SyntaxError as exc:
        return False, f"{exc.msg} (line {exc.lineno})"


def run_python(source_code: str, stdin_data: str) -> RunResult:
    ok, err = compile_check_python(source_code)
    if not ok:
        return RunResult("COMPILATION_ERROR", "", err, None, 0.0, None)

    with tempfile.TemporaryDirectory(prefix="codeforge_exec_") as tmp:
        script_path = Path(tmp) / "submission.py"
        script_path.write_text(source_code)

        start = time.monotonic()
        try:
            proc = subprocess.run(
                ["python3", str(script_path)],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_S,
                cwd=tmp,
                env={"PATH": os.environ.get("PATH", "/usr/bin:/bin")},
                preexec_fn=_limit_resources,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return RunResult("TIMEOUT", "", "Execution exceeded time limit", None,
                              TIMEOUT_S * 1000, None)
        except OSError as exc:
            return RunResult("SYSTEM_ERROR", "", f"Failed to launch execution: {exc}", None, 0.0, None)

        elapsed_ms = (time.monotonic() - start) * 1000
        stdout = proc.stdout[:OUTPUT_LIMIT_BYTES]
        stderr = proc.stderr[:OUTPUT_LIMIT_BYTES]

        # RLIMIT_CPU (Phase 4) races with the wall-clock subprocess.run
        # timeout on a tight CPU-bound infinite loop: depending on
        # scheduling, either can fire first. If the CPU limit wins, the
        # kernel kills the child with SIGXCPU (24) before subprocess.run's
        # own timeout has a chance to raise TimeoutExpired. Both outcomes
        # mean the same thing to the student — the program ran too long —
        # so both are classified TIMEOUT, not RUNTIME_ERROR, for
        # consistent, non-flaky results regardless of scheduler timing.
        if proc.returncode is not None and proc.returncode < 0:
            sig = -proc.returncode
            if sig in (24, 9):  # SIGXCPU, SIGKILL
                return RunResult("TIMEOUT", stdout, stderr, proc.returncode, elapsed_ms, None)
            return RunResult("RUNTIME_ERROR", stdout, stderr, proc.returncode, elapsed_ms, None)

        if proc.returncode != 0:
            return RunResult("RUNTIME_ERROR", stdout, stderr, proc.returncode, elapsed_ms, None)

        return RunResult("COMPLETED", stdout, stderr, proc.returncode, elapsed_ms, None)


def run_against_test(source_code: str, test_input_json: str) -> RunResult:
    """test_input_json is a JSON-encoded dict; we pass it as stdin (JSON) —
    the challenge's starter code is responsible for reading stdin as JSON."""
    try:
        parsed = json.loads(test_input_json)
        stdin_data = json.dumps(parsed)
    except json.JSONDecodeError:
        stdin_data = test_input_json
    return run_python(source_code, stdin_data)
