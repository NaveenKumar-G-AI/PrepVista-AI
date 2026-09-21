import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";

/**
 * This renders the REAL App component tree against the REAL backend
 * (localhost:4030) rather than mocking fetch -- it exists to catch the
 * class of bug that type-checking cannot: a hook wired to the wrong field
 * name, a state branch that never actually renders, an event handler that
 * throws, or (as happened once here) a stale-identity race between a
 * parent hook and a child effect. Requires the backend to be running with
 * a freshly-seeded database -- see README for the exact reset sequence.
 */
describe("App (live backend smoke test)", () => {
  it("renders Ananya's real, already-seeded Data Analyst dashboard", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Data Analyst")).toBeInTheDocument(), { timeout: 10000 });
    expect(screen.getByText("Readiness")).toBeInTheDocument();
    expect(screen.getAllByText(/^\d+%$/).length).toBeGreaterThan(0);

    // The Section-50 worked example: Python for Data should be the bottleneck.
    await waitFor(() => expect(screen.getByText("Python for Data")).toBeInTheDocument());

    // Milestone route rendered with real stage data, not a placeholder.
    // (Rendered twice -- desktop and mobile variants -- so getAllByText.)
    expect(screen.getAllByText("Foundation").length).toBeGreaterThan(0);
  });

  it("switching the demo identity loads a different student's real path, not a stale mix of both", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Data Analyst")).toBeInTheDocument(), { timeout: 10000 });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /rahul/i }));

    await waitFor(() => expect(screen.getByText("Software Developer")).toBeInTheDocument(), { timeout: 10000 });
    // Rahul's seeded story is meant to land him in Recovery -- the mode badge
    // renders it as its own isolated span (TargetHeader), which is a more
    // reliable target than substring-matching inside the mixed-content
    // "why did my path change" paragraph.
    await waitFor(() => expect(screen.getByText("Recovery")).toBeInTheDocument());
    // And Ananya's target must be gone, not lingering from the previous render.
    expect(screen.queryByText("Data Analyst")).not.toBeInTheDocument();
  });

  it("shows the Section 52 empty state for a student with no target, and creates one live", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Data Analyst")).toBeInTheDocument(), { timeout: 10000 });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /priya/i }));

    await waitFor(() => expect(screen.getByText(/your path starts with a target/i)).toBeInTheDocument(), { timeout: 10000 });

    await user.click(screen.getByRole("button", { name: /explore targets/i }));
    await waitFor(() => expect(screen.getByText("Data Analyst")).toBeInTheDocument(), { timeout: 10000 });
  });
});
