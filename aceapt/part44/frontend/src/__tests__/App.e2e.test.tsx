import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import pg from "pg";
import App from "../App";

// A real, black-box end-to-end test: spawns the ACTUAL compiled backend
// (dist/src/server.js) as a separate process - the same artifact that
// ships - and renders the real React app against it with jsdom + real
// fetch calls. Nothing here is mocked. This is what actually caught the
// "\u2192 rendered as literal text" bug during development (see README
// "Bugs found and fixed"): a type-check alone did not.
const BACKEND_DIR = path.resolve(__dirname, "../../../");
// api/client.ts resolves its base URL from import.meta.env.VITE_API_BASE_URL,
// which Vite statically replaces at transform time - setting it at
// runtime in beforeAll has no effect on the already-compiled module. So
// this test runs the backend on the client's actual built-in default
// port instead of fighting that.
const PORT = 4044;
const API_BASE = `http://127.0.0.1:${PORT}/api`;

describe("App (real backend, real DOM render)", () => {
  let backend: ChildProcess;
  let admin: pg.Client;
  let studentId: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await admin.connect();
    const res = await admin.query("INSERT INTO students (display_name) VALUES ('Frontend E2E Student') RETURNING id");
    studentId = res.rows[0].id;
    await admin.query(
      `INSERT INTO mock_capability_snapshots (student_id, quant, logical, verbal, accuracy, speed_band, consistency, improvement_rate_per_hour)
       VALUES ($1, 72, 54, 68, 71, 'DEVELOPING', 58, $2::jsonb)`,
      [studentId, JSON.stringify({ quant: 1.1, logical: 2.4, verbal: 0.9 })]
    );

    backend = spawn("node", ["dist/src/server.js"], {
      cwd: BACKEND_DIR,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "pipe",
    });
    backend.stderr?.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));
    backend.stdout?.on("data", (chunk) => process.stdout.write(`[backend] ${chunk}`));
    await waitForHealthz();
  }, 30000);

  afterAll(async () => {
    backend.kill();
    await admin.query("DELETE FROM students WHERE id = $1", [studentId]);
    await admin.end();
  });

  async function waitForHealthz() {
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
        if (res.ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("backend did not become healthy in time");
  }

  it("takes a student through goal creation and renders a real computed dashboard", async () => {
    const user = userEvent.setup();
    render(<App />);

    const idInput = screen.getByPlaceholderText("Student ID (dev mode)");
    await user.type(idInput, studentId);

    // Goal creation screen appears once the (empty) goal list loads.
    await waitFor(() => expect(screen.getByText("What are you trying to achieve?")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Placement readiness" }));

    // Constraints step.
    await waitFor(() => expect(screen.getByText("A couple more things")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Create goal" }));

    // Dashboard renders with the REAL computed priority from the REAL
    // backend (Quant 72 / Logical 54 / Verbal 68 -> Logical is the gap).
    await waitFor(() => expect(screen.getByText("Placement Readiness")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText("Logical Reasoning")).toBeInTheDocument();
    expect(screen.getByText("30 DAYS REMAINING")).toBeInTheDocument();

    // Milestones tab, generated server-side, actually renders real titles.
    await user.click(screen.getByRole("button", { name: "Milestones" }));
    expect(screen.getByText("Foundation")).toBeInTheDocument();
    expect(screen.getByText("Verification")).toBeInTheDocument();
  }, 20000);
});
