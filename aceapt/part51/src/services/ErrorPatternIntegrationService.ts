import { AccuracyProfileService, type BottleneckEntry } from "./AccuracyProfileService.js";
import { explain } from "../ai/AnthropicAccuracyAdapter.js";
import { getPorts } from "../container.js";
import type { PortRegistry } from "../types/ports.js";

export interface ErrorPatternCard {
  bottleneck: BottleneckEntry | null;
  whyThisFocus: string;
  relatedSkills: { prerequisites: string[]; downstream: string[] };
}

/** §61-62/§25/§70 — presentation-facing, but every field traces back to real evidence, never a guess. */
export class ErrorPatternIntegrationService {
  constructor(
    private readonly profiles: AccuracyProfileService = new AccuracyProfileService(),
    private readonly ports: PortRegistry = getPorts()
  ) {}

  async getErrorPatternCard(studentId: string): Promise<ErrorPatternCard> {
    const bottlenecks = await this.profiles.getBottlenecks(studentId, 1);
    const bottleneck = bottlenecks[0] ?? null;

    if (!bottleneck) {
      return {
        bottleneck: null,
        whyThisFocus: "Not enough recent attempts yet to identify a focus area.",
        relatedSkills: { prerequisites: [], downstream: [] }
      };
    }

    const [related, whyThisFocus] = await Promise.all([
      this.ports.skillGraph.getRelated(bottleneck.skillId), // §25/§70 — root-cause chaining seam (Ratio → Percentage → DI, etc.)
      explain({
        kind: "why_this_focus",
        errorType: bottleneck.errorType,
        recurrenceNote: bottleneck.reason
      }).then((r) => r.message)
    ]);

    return { bottleneck, whyThisFocus, relatedSkills: related };
  }
}
