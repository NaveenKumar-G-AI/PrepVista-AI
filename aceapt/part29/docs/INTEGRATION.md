# ALIGN integration guide

## The closed loop (spec §42)

```
CAPABILITY (Feature 3/5/6/8/20)
     |  evidenceSource.ts adapter
     v
  ALIGN  ---- GapIdentifiedForAdapt ---->  ADAPT (Feature 26)
     ^                                          |
     |                                          v
     |                                   (intervention, improvement)
     |
     |  <---- ProofCompleted webhook ----   PROOF (Feature 28)
     |                                          ^
     +---- TargetSelectedForProof ------------+
```

Nothing here is wired to real Feature 26/27/28 code, because that code
doesn't exist in this build's context. What's real is the *contract* on
each side of that gap: a durable outbox event out, a webhook in, both with
a stable, typed payload.

## Outbox events (`align_outbox` table)

Published via `src/integrations/outbox.ts::publishSignal`, always inside
the same transaction as whatever triggered them.

### `GapIdentifiedForAdapt`

Fired by `POST /align/targets/:targetId/improve-gap`.

```ts
{
  targetId: string;
  targetName: string;
  capabilityId: string;
  capabilityName: string;
  currentLevel: string;      // CapabilityLevel
  requiredLevel: string;
  importance: 'CORE' | 'IMPORTANT' | 'SUPPORTING';
  isCritical: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  priorityScore: number | null;
}
```

To wire up: call `registerOutboxConsumer('GapIdentifiedForAdapt', async (event) => { ... })`
somewhere in your app's startup, where the consumer calls into the real
Feature 26. Until you do, events sit durably in `align_outbox` — nothing
is lost, and `OUTBOX_DISPATCH_ENABLED=false` (the default) means the
dispatcher doesn't even poll.

### `TargetSelectedForProof`

Fired by `POST /align/targets/:targetId/prove`.

```ts
{
  targetId: string;
  targetName: string;
  requirements: { capabilityId: string; importance: string; requiredLevel: string }[];
}
```

## Inbound: PROOF → ALIGN

`POST /align/webhooks/proof-completed`, signed with `PROOF_WEBHOOK_SECRET`
(header `X-Proof-Signature`) once you set it — unsigned requests are only
accepted with a loud console warning, meant for local dev only.

```ts
{
  studentId: string;
  capabilityId: string;
  verified: boolean;
  sourceRef?: string;
}
```

This reference implementation also flips `proof_verified` on the most
recent matching row in the local `capability_evidence_events` table so the
loop is demonstrable standalone (see `scripts/demo-walkthrough.js`). In
production, Feature 28 almost certainly manages its own verification
state — once `evidenceSource.ts` points at the real tables, this update
step becomes redundant (verified status will already be reflected) and
can be deleted; only the `recalculateAlignment(studentId)` call at the end
matters.

## Event-driven recalculation (spec §58)

Right now, `recalculateAlignment(studentId)` is called explicitly by
`POST /align/recalculate`, the dashboard's cache-miss path, and the PROOF
webhook. To wire up the fuller event-driven picture the spec describes,
call it from wherever these fire in your real system:

- `AssessmentCompleted` → recalculate
- `CapabilityUpdated` → recalculate
- `ProofCompleted` → already wired via the webhook above
- `InterventionCompleted` (from ADAPT) → recalculate

## API reference

All routes under `/align`, `Authorization: Bearer <token>` required
(`src/api/middleware/auth.ts`). `:studentId` routes additionally require
the caller be that student, or `tpo`/`trainer`/`service`.

| Method | Path | Notes |
|---|---|---|
| GET | `/align` | Dashboard: cached results + priority shortlist |
| GET | `/align/targets` | Configured target catalog |
| GET | `/align/targets/:targetId` | One target's alignment + AI/template explanation |
| GET | `/align/capabilities` | Capability catalog |
| GET | `/align/history?targetId=` | Snapshot history for one target |
| POST | `/align/recalculate` | Force recalculation across all active targets |
| POST | `/align/scenario` | What-if — `{ targetId, capabilityId, projectedLevel }` |
| POST | `/align/target` | Record a target selection (drift tracking) |
| POST | `/align/targets/:targetId/improve-gap` | → ADAPT, body `{ capabilityId }` |
| POST | `/align/targets/:targetId/prove` | → PROOF |
| POST | `/align/webhooks/proof-completed` | ← PROOF (see above) |
| GET | `/align/tpo/cohort` | Requires `tpo`/`service` role |

## Swapping in real evidence

`src/integrations/evidenceSource.ts` exports one interface:

```ts
interface EvidenceSource {
  getEvidenceForStudent(studentId: string): Promise<Record<string, CapabilityEvidenceEvent[]>>;
}
```

Implement it against your real tables/views and swap the import in
`src/services/alignmentService.ts` (three call sites, all named
`postgresEvidenceSource`). Nothing else in the engine, API, or frontend
needs to change — this is the seam spec §11 asks for.
