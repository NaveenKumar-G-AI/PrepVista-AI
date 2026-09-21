// The contract Feature 44 needs from "existing capability data" (Section
// 18, owned by Feature 43 / diagnostics / skill intelligence in the real
// codebase - Section 72's architectural boundary). Feature 44 must never
// import Feature 43's internals directly; it depends on this interface
// only, so swapping MockCapabilityDataClient for a real client is a
// one-line change at the composition root (src/server.ts).
import type { CapabilitySnapshot } from "../../domain/types.js";

export interface CapabilityDataClient {
  getLatestSnapshot(studentId: string): Promise<CapabilitySnapshot | null>;
}
