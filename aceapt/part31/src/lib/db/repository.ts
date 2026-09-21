import { readCollection, writeCollection } from './store';
import { newId } from '@/lib/ids';
import { TARGET_SOFTWARE_DEVELOPER } from '@/lib/content/targets';
import type {
  CapabilityState,
  PathState,
  SimulationAttempt,
  SimulationEvent,
  SimulationEventType,
  SimulationResult,
  Student,
} from './schema';

export const DEMO_STUDENT_ID = 'student_demo';

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export function ensureDemoStudent(): Student {
  const students = readCollection<Student>('students');
  let demo = students.find((s) => s.id === DEMO_STUDENT_ID);
  if (!demo) {
    demo = {
      id: DEMO_STUDENT_ID,
      name: 'Demo Student',
      currentTargetId: TARGET_SOFTWARE_DEVELOPER,
      createdAt: new Date().toISOString(),
    };
    students.push(demo);
    writeCollection('students', students);
  }
  return demo;
}

export function getStudent(studentId: string): Student | undefined {
  return readCollection<Student>('students').find((s) => s.id === studentId);
}

export function setStudentTarget(studentId: string, targetId: string): Student {
  const students = readCollection<Student>('students');
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx === -1) throw new Error('Student not found');
  students[idx] = { ...students[idx], currentTargetId: targetId };
  writeCollection('students', students);
  return students[idx];
}

// ---------------------------------------------------------------------------
// Capability state
// ---------------------------------------------------------------------------

export function listCapabilityStates(studentId: string): CapabilityState[] {
  return readCollection<CapabilityState>('capabilityStates').filter((c) => c.studentId === studentId);
}

export function getCapabilityState(studentId: string, capabilityId: string): CapabilityState | undefined {
  return readCollection<CapabilityState>('capabilityStates').find((c) => c.studentId === studentId && c.capabilityId === capabilityId);
}

export function upsertCapabilityState(next: CapabilityState): void {
  const all = readCollection<CapabilityState>('capabilityStates');
  const idx = all.findIndex((c) => c.studentId === next.studentId && c.capabilityId === next.capabilityId);
  if (idx === -1) all.push(next);
  else all[idx] = next;
  writeCollection('capabilityStates', all);
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export function createAttempt(attempt: SimulationAttempt): void {
  const all = readCollection<SimulationAttempt>('attempts');
  all.push(attempt);
  writeCollection('attempts', all);
}

export function getAttempt(attemptId: string): SimulationAttempt | undefined {
  return readCollection<SimulationAttempt>('attempts').find((a) => a.id === attemptId);
}

export function saveAttempt(attempt: SimulationAttempt): void {
  const all = readCollection<SimulationAttempt>('attempts');
  const idx = all.findIndex((a) => a.id === attempt.id);
  if (idx === -1) throw new Error('Attempt not found');
  all[idx] = attempt;
  writeCollection('attempts', all);
}

export function listAttemptsForStudentTarget(studentId: string, targetId: string): SimulationAttempt[] {
  return readCollection<SimulationAttempt>('attempts')
    .filter((a) => a.studentId === studentId && a.targetId === targetId)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
}

export function listRecentItemIdsForSimulation(studentId: string, simulationId: string, lastN = 2): Set<string> {
  const attempts = readCollection<SimulationAttempt>('attempts')
    .filter((a) => a.studentId === studentId && a.simulationId === simulationId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, lastN);
  const ids = new Set<string>();
  for (const a of attempts) {
    for (const stage of a.blueprint.stages) {
      for (const it of stage.items) ids.add(it.itemId);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Events (append-only log — spec §43)
// ---------------------------------------------------------------------------

export function appendEvent(studentId: string, attemptId: string | null, type: SimulationEventType, payload: Record<string, unknown> = {}): void {
  const all = readCollection<SimulationEvent>('events');
  all.push({ id: newId('evt'), attemptId, studentId, type, payload, at: new Date().toISOString() });
  writeCollection('events', all);
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export function saveResult(result: SimulationResult): void {
  const all = readCollection<SimulationResult>('results');
  all.push(result);
  writeCollection('results', all);
}

export function getResultByAttemptId(attemptId: string): SimulationResult | undefined {
  return readCollection<SimulationResult>('results').find((r) => r.attemptId === attemptId);
}

export function listResultsForStudentTarget(studentId: string, targetId: string): SimulationResult[] {
  return readCollection<SimulationResult>('results')
    .filter((r) => r.studentId === studentId && r.targetId === targetId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getLatestReliableResult(studentId: string, targetId: string): SimulationResult | undefined {
  const results = listResultsForStudentTarget(studentId, targetId).filter((r) => r.usedAsEvidence);
  return results[results.length - 1];
}

// ---------------------------------------------------------------------------
// PATH state (lightweight local stand-in for Feature 30)
// ---------------------------------------------------------------------------

export function getPathState(studentId: string, targetId: string): PathState | undefined {
  return readCollection<PathState>('pathStates').find((p) => p.studentId === studentId && p.targetId === targetId);
}

export function savePathState(state: PathState): void {
  const all = readCollection<PathState>('pathStates');
  const idx = all.findIndex((p) => p.studentId === state.studentId && p.targetId === state.targetId);
  if (idx === -1) all.push(state);
  else all[idx] = state;
  writeCollection('pathStates', all);
}
