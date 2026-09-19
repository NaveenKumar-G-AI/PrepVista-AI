import { TimelineEvent } from "@/modules/coding/engines/incidents/types";

// Offsets are in minutes relative to "now" (0) = the moment the student
// takes ownership of the incident. Negative = before the student arrived.
export const timeline: TimelineEvent[] = [
  { offsetMinutes: -21, label: "Deployment completed", detail: "placement-api v2.14.0 rolled out", eventKind: "DEPLOY" },
  { offsetMinutes: -16, label: "Latency begins rising", detail: "p95 latency crosses 800ms", eventKind: "SIGNAL" },
  { offsetMinutes: -12, label: "Error rate reaches 5%", detail: "placement-api error rate crosses 5%", eventKind: "SIGNAL" },
  { offsetMinutes: -7, label: "Users report failures", detail: "Support ticket volume spikes for application submission errors", eventKind: "REPORT" },
  { offsetMinutes: -2, label: "Incident declared", detail: "HIGH_ERROR_RATE alert fires, SEV-2 declared", eventKind: "ALERT" },
  { offsetMinutes: 0, label: "Ownership taken", detail: "Student takes ownership of PF-2048", eventKind: "OWNERSHIP" },
];
