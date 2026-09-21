import { describe, expect, it } from "vitest";
import {
  computeDimensionConfidence,
  computeDimensionScore,
  computeDimensionStatus,
  evidenceStrengthForDimension,
  evidenceStrengthFromWeight,
  extractGaps,
} from "@/understanding/scoringEngine.js";
import { buildUnderstandingProfile } from "@/understanding/evidenceEngine.js";
import { classifyUnderstanding } from "@/understanding/resultClassification.js";
import { RESOLVED_CONFIDENCE_THRESHOLD, selectNextProbe } from "@/understanding/probeEngine.js";
import { UNDERSTANDING_DIMENSIONS, type EvidenceItem, type UnderstandingDimension, type UnderstandingProfile } from "@/types/index.js";
import { emptyEvidenceByDimension, makeDimensionsRecord, makeEvidence, makeMentalModel } from "./fixtures.js";

describe("scoringEngine", () => {
  it("computeDimensionScore: weighted average, reliability x eval-confidence as weight", () => {
    const items = [
      makeEvidence({ probe_type: "prediction", result: "correct", confidence: 90 }), // weight 0.9*0.9=0.81, value 100
      makeEvidence({ probe_type: "explanation", result: "incorrect", confidence: 80 }), // weight 0.3*0.8=0.24, value 5
    ];
    // (100*0.81 + 5*0.24) / (0.81+0.24) = 82.2 / 1.05 = 78.2857... -> 78
    expect(computeDimensionScore(items)).toBe(78);
  });

  it("computeDimensionScore: empty evidence is 0, never fabricated", () => {
    expect(computeDimensionScore([])).toBe(0);
  });

  it("computeDimensionConfidence: depends on amount, diversity, reliability, eval-clarity (documented 0.35/0.25/0.2/0.2 split)", () => {
    const items = [
      makeEvidence({ probe_type: "prediction", result: "correct", confidence: 90 }),
      makeEvidence({ probe_type: "explanation", result: "incorrect", confidence: 80 }),
    ];
    // amount=min(1,2/3)=.6667*.35=.2333; diversity=min(1,2/2)=1*.25=.25;
    // reliability=mean(.9,.3)=.6*.2=.12; evalConf=mean(90,80)/100=.85*.2=.17 -> .7733 -> 77
    expect(computeDimensionConfidence(items)).toBe(77);
  });

  it("a single piece of evidence alone yields capped, non-saturated confidence (never decide understanding from one answer)", () => {
    const items = [makeEvidence({ probe_type: "transfer", result: "correct", confidence: 100 })];
    const confidence = computeDimensionConfidence(items);
    expect(confidence).toBeLessThan(70);
  });

  it("evidenceStrengthFromWeight follows the spec's strong/moderate/weak tiers", () => {
    expect(evidenceStrengthFromWeight(1.0)).toBe("strong"); // transfer
    expect(evidenceStrengthFromWeight(0.8)).toBe("strong"); // invariant — "must receive significant weight"
    expect(evidenceStrengthFromWeight(0.65)).toBe("moderate"); // causal_why
    expect(evidenceStrengthFromWeight(0.3)).toBe("weak"); // generic explanation
  });

  it("evidenceStrengthForDimension reflects the probe types actually used", () => {
    const strongItems = [makeEvidence({ probe_type: "transfer" }), makeEvidence({ probe_type: "debugging" })];
    expect(evidenceStrengthForDimension(strongItems)).toBe("strong");

    const weakItems = [makeEvidence({ probe_type: "explanation" })];
    expect(evidenceStrengthForDimension(weakItems)).toBe("weak");
  });

  it("computeDimensionStatus: not_assessed / insufficient / developing / demonstrated / strong / gap_identified are all reachable", () => {
    expect(computeDimensionStatus(0, 0, false)).toBe("not_assessed");
    expect(computeDimensionStatus(90, 20, true)).toBe("insufficient_evidence"); // confidence too low to trust a high score
    expect(computeDimensionStatus(40, 50, true)).toBe("developing");
    expect(computeDimensionStatus(60, 50, true)).toBe("demonstrated");
    expect(computeDimensionStatus(80, 70, true)).toBe("strong");
    expect(computeDimensionStatus(10, 50, true)).toBe("gap_identified");
  });

  it("extractGaps deduplicates and only pulls from non-correct evidence", () => {
    const items = [
      makeEvidence({ result: "correct", observed_evidence: "fine" }),
      makeEvidence({ result: "incorrect", observed_evidence: "Missed the off-by-one at the boundary." }),
      makeEvidence({ result: "partially_correct", observed_evidence: "Missed the off-by-one at the boundary." }),
      makeEvidence({ result: "incorrect", observed_evidence: "Confused the invariant with the postcondition." }),
    ];
    expect(extractGaps(items)).toEqual([
      "Missed the off-by-one at the boundary.",
      "Confused the invariant with the postcondition.",
    ]);
  });
});

describe("evidenceEngine: buildUnderstandingProfile", () => {
  it("computes the procedural/conceptual split independently and gates classification on too little evidence", () => {
    const evidence = [makeEvidence({ dimension: "problem", probe_type: "explanation", result: "correct", confidence: 95 })];
    const profile = buildUnderstandingProfile({
      assessmentId: "a1",
      studentId: "s1",
      challengeId: "c1",
      status: "in_progress",
      evidence,
      execution: { ran: true, passed_tests: 8, total_tests: 10 },
      probesAsked: evidence.length,
      maxProbes: 8,
      createdAt: new Date().toISOString(),
    });

    // dimMean(procedural) = mean([100,0,0,0]) = 25; passRate = 80
    // procedural = round(80*0.6 + 25*0.4) = round(48+10) = 58
    expect(profile.procedural_score).toBe(58);
    // no evidence on any conceptual dimension yet
    expect(profile.conceptual_score).toBe(0);
    // only 1 probe asked so far -> too early to classify, regardless of the scores above
    expect(profile.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(profile.dimensions.problem.status).toBe("demonstrated");
  });

  it("reproduces the spec's 'excellent explanation, weak everything else' memorization-resistant pattern -> PARTIAL_UNDERSTANDING", () => {
    const proceduralDims: UnderstandingDimension[] = ["problem", "algorithm", "data_structure", "control_flow"];
    const conceptualDims: UnderstandingDimension[] = [
      "state",
      "invariant",
      "correctness",
      "complexity",
      "space",
      "edge_case",
      "debugging",
      "adaptation",
      "transfer",
    ];
    const typeForDim: Record<string, EvidenceItem["probe_type"]> = {
      state: "prediction",
      transfer: "transfer",
      debugging: "debugging",
      adaptation: "modification",
      invariant: "invariant",
      correctness: "causal_why",
      complexity: "complexity",
      space: "complexity",
      edge_case: "edge_case",
    };
    const evidence: EvidenceItem[] = [
      ...proceduralDims.map((d) => makeEvidence({ dimension: d, probe_type: "explanation", result: "correct", confidence: 90 })),
      ...conceptualDims.map((d) => makeEvidence({ dimension: d, probe_type: typeForDim[d], result: "incorrect", confidence: 70 })),
    ];

    const profile = buildUnderstandingProfile({
      assessmentId: "a2",
      studentId: "s1",
      challengeId: "c1",
      status: "in_progress",
      evidence,
      execution: { ran: true, passed_tests: 10, total_tests: 10 },
      probesAsked: evidence.length,
      maxProbes: 20,
      createdAt: new Date().toISOString(),
    });

    expect(profile.procedural_score).toBe(100);
    expect(profile.conceptual_score).toBeLessThan(15);
    expect(profile.procedural_score - profile.conceptual_score).toBeGreaterThanOrEqual(20);
    expect(profile.classification).toBe("PARTIAL_UNDERSTANDING");
    // Every conceptual dimension should show up as a real, inspectable gap — not an accusation.
    for (const d of conceptualDims) {
      expect(profile.dimensions[d].status).toBe("gap_identified");
      expect(profile.dimensions[d].identified_gaps.length).toBeGreaterThan(0);
    }
  });

  it("produces STRONG_UNDERSTANDING when every dimension has diverse, reliable, correct evidence", () => {
    const evidence: EvidenceItem[] = UNDERSTANDING_DIMENSIONS.flatMap((d) => [
      makeEvidence({ dimension: d, probe_type: "transfer", result: "correct", confidence: 95 }),
      makeEvidence({ dimension: d, probe_type: "transfer", result: "correct", confidence: 95 }),
      makeEvidence({ dimension: d, probe_type: "modification", result: "correct", confidence: 90 }),
    ]);

    const profile = buildUnderstandingProfile({
      assessmentId: "a3",
      studentId: "s1",
      challengeId: "c1",
      status: "in_progress",
      evidence,
      execution: { ran: true, passed_tests: 10, total_tests: 10 },
      probesAsked: evidence.length,
      maxProbes: 50,
      createdAt: new Date().toISOString(),
    });

    expect(profile.procedural_score).toBe(100);
    expect(profile.conceptual_score).toBe(100);
    expect(profile.overall_evidence_strength).toBe("strong");
    expect(profile.classification).toBe("STRONG_UNDERSTANDING");
  });
});

describe("resultClassification: classifyUnderstanding direct branch coverage", () => {
  const baseProfile = (overrides: Partial<Omit<UnderstandingProfile, "classification">>): Omit<UnderstandingProfile, "classification"> => ({
    assessment_id: "a1",
    student_id: "s1",
    challenge_id: "c1",
    status: "in_progress",
    dimensions: makeDimensionsRecord(),
    procedural_score: 50,
    conceptual_score: 50,
    overall_confidence: 50,
    overall_evidence_strength: "moderate",
    probes_asked: 5,
    max_probes: 8,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  it("gate 1: too few probes -> INSUFFICIENT_EVIDENCE regardless of scores", () => {
    const profile = baseProfile({ probes_asked: 1, conceptual_score: 95, overall_confidence: 95 });
    expect(classifyUnderstanding(profile)).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("gate 2: contradictory mix of strong and gap dimensions with moderate confidence -> UNCERTAIN", () => {
    const dims = makeDimensionsRecord({
      problem: { status: "strong" },
      algorithm: { status: "strong" },
      data_structure: { status: "gap_identified" },
      state: { status: "gap_identified" },
    });
    const profile = baseProfile({ dimensions: dims, overall_confidence: 40 });
    expect(classifyUnderstanding(profile)).toBe("UNCERTAIN");
  });

  it("gate 4: large procedural-conceptual gap -> PARTIAL_UNDERSTANDING even with only moderate confidence", () => {
    const dims = makeDimensionsRecord({ problem: { status: "demonstrated" }, algorithm: { status: "developing" }, state: { status: "developing" } });
    const profile = baseProfile({ dimensions: dims, procedural_score: 90, conceptual_score: 60, overall_confidence: 46 });
    expect(classifyUnderstanding(profile)).toBe("PARTIAL_UNDERSTANDING");
  });

  it("gate 6: confidently low conceptual score with no procedural mismatch -> UNDERSTANDING_GAP", () => {
    const dims = makeDimensionsRecord({ problem: { status: "developing" }, algorithm: { status: "developing" }, state: { status: "developing" } });
    const profile = baseProfile({ dimensions: dims, procedural_score: 30, conceptual_score: 20, overall_confidence: 50 });
    expect(classifyUnderstanding(profile)).toBe("UNDERSTANDING_GAP");
  });

  it("gate 7: mid-range evidence that resolves cleanly to neither demonstrated nor gap -> UNCERTAIN", () => {
    const dims = makeDimensionsRecord({ problem: { status: "developing" }, algorithm: { status: "developing" }, state: { status: "developing" } });
    const profile = baseProfile({ dimensions: dims, procedural_score: 50, conceptual_score: 45, overall_confidence: 40 });
    expect(classifyUnderstanding(profile)).toBe("UNCERTAIN");
  });
});

describe("probeEngine: adaptive selection", () => {
  it("on a fresh assessment, picks the first dimension in canonical order and starts at the explanation rung", () => {
    const spec = selectNextProbe({
      dimensions: makeDimensionsRecord(),
      evidenceByDimension: emptyEvidenceByDimension(),
      mentalModel: makeMentalModel(),
      probesAsked: 0,
      maxProbes: 8,
    });
    expect(spec).not.toBeNull();
    expect(spec!.dimension).toBe("problem");
    expect(spec!.probeType).toBe("explanation");
    expect(spec!.difficulty).toBe("explanation");
    expect(spec!.isClarification).toBe(false);
  });

  it("an ambiguous prior response triggers an immediate same-concept clarifying probe", () => {
    const lastEvidence = makeEvidence({ dimension: "invariant", concept: "loop invariant", probe_type: "invariant", result: "ambiguous" });
    const spec = selectNextProbe({
      dimensions: makeDimensionsRecord(),
      evidenceByDimension: { ...emptyEvidenceByDimension(), invariant: [lastEvidence] },
      mentalModel: makeMentalModel(),
      probesAsked: 1,
      maxProbes: 8,
      lastEvidence,
    });
    expect(spec).not.toBeNull();
    expect(spec!.isClarification).toBe(true);
    expect(spec!.dimension).toBe("invariant");
    expect(spec!.probeType).toBe("invariant");
  });

  it("a resolved (high-confidence) dimension is skipped in favor of the next uncertain one", () => {
    const dims = makeDimensionsRecord({
      problem: { status: "strong", confidence: RESOLVED_CONFIDENCE_THRESHOLD + 10 },
    });
    const spec = selectNextProbe({
      dimensions: dims,
      evidenceByDimension: emptyEvidenceByDimension(),
      mentalModel: makeMentalModel(),
      probesAsked: 1,
      maxProbes: 8,
    });
    expect(spec!.dimension).not.toBe("problem");
    expect(spec!.dimension).toBe("algorithm"); // next in canonical order
  });

  it("terminates once the probe budget is exhausted", () => {
    const spec = selectNextProbe({
      dimensions: makeDimensionsRecord(),
      evidenceByDimension: emptyEvidenceByDimension(),
      mentalModel: makeMentalModel(),
      probesAsked: 8,
      maxProbes: 8,
    });
    expect(spec).toBeNull();
  });

  it("terminates once every dimension is resolved, even under budget", () => {
    const resolved = Object.fromEntries(
      UNDERSTANDING_DIMENSIONS.map((d) => [d, { status: "strong" as const, confidence: 90 }])
    );
    const spec = selectNextProbe({
      dimensions: makeDimensionsRecord(resolved),
      evidenceByDimension: emptyEvidenceByDimension(),
      mentalModel: makeMentalModel(),
      probesAsked: 3,
      maxProbes: 20,
    });
    expect(spec).toBeNull();
  });

  it("difficulty ladder: climbs through available rungs and only reaches for an advanced (modification) probe type once non-advanced options are exhausted", () => {
    // Resolve every dimension except "state" so it's the only candidate each call.
    const resolvedExceptState = Object.fromEntries(
      UNDERSTANDING_DIMENSIONS.filter((d) => d !== "state").map((d) => [d, { status: "strong" as const, confidence: 90 }])
    );
    const dims = makeDimensionsRecord(resolvedExceptState);
    const mentalModel = makeMentalModel();

    const evidenceByDimension = emptyEvidenceByDimension();

    const call1 = selectNextProbe({ dimensions: dims, evidenceByDimension, mentalModel, probesAsked: 1, maxProbes: 20 });
    expect(call1!.dimension).toBe("state");
    expect(["state_trace", "prediction"]).toContain(call1!.probeType); // a non-advanced (prediction-rung) type
    expect(call1!.difficulty).not.toBe("modification");

    evidenceByDimension.state.push(makeEvidence({ dimension: "state", probe_type: call1!.probeType, result: "incorrect", confidence: 70 }));
    const call2 = selectNextProbe({ dimensions: dims, evidenceByDimension, mentalModel, probesAsked: 2, maxProbes: 20 });
    expect(["state_trace", "prediction"]).toContain(call2!.probeType);
    expect(call2!.probeType).not.toBe(call1!.probeType); // diversifies within the rung before advancing
    expect(call2!.difficulty).not.toBe("modification");

    evidenceByDimension.state.push(makeEvidence({ dimension: "state", probe_type: call2!.probeType, result: "incorrect", confidence: 70 }));
    const call3 = selectNextProbe({ dimensions: dims, evidenceByDimension, mentalModel, probesAsked: 3, maxProbes: 20 });
    // Only now — with both non-advanced options exhausted and neither correct — does it advance.
    expect(call3!.probeType).toBe("debugging");
    expect(call3!.difficulty).toBe("modification");
  });
});
