import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// `globals: false` in vitest.config.ts means testing-library's own
// auto-cleanup detection (which looks for an ambient `afterEach`) never
// fires, so without this, each test's rendered tree stays mounted into the
// next test's document and queries like getByRole start matching duplicates
// across tests.
afterEach(() => {
  cleanup();
});
