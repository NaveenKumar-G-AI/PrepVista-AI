import { v4 as uuid } from 'uuid';
import { jsonStore } from './JsonStore';
import {
  StudentAction,
  ActionOutcome,
  Milestone,
  StudentGoal,
  SkillEvidence,
  ReadinessSnapshot,
  Student,
} from '../types';

function makeRepo<T extends { id: string }>(collectionName: string) {
  return {
    all(): T[] {
      return jsonStore.collection<T>(collectionName);
    },
    find(predicate: (item: T) => boolean): T[] {
      return jsonStore.collection<T>(collectionName).filter(predicate);
    },
    findOne(predicate: (item: T) => boolean): T | undefined {
      return jsonStore.collection<T>(collectionName).find(predicate);
    },
    getById(id: string): T | undefined {
      return jsonStore.collection<T>(collectionName).find((i) => i.id === id);
    },
    insert(item: Omit<T, 'id'> & { id?: string }): T {
      const withId = { ...item, id: item.id || uuid() } as T;
      const items = jsonStore.collection<T>(collectionName);
      items.push(withId);
      jsonStore.setCollection(collectionName, items);
      return withId;
    },
    update(id: string, patch: Partial<T>): T | undefined {
      const items = jsonStore.collection<T>(collectionName);
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) return undefined;
      items[idx] = { ...items[idx], ...patch };
      jsonStore.setCollection(collectionName, items);
      return items[idx];
    },
  };
}

// One named repo per §37 entity, plus Student and SkillEvidence which the
// services also need. Swap JsonStore for a real DB and every line below
// keeps working unchanged.
export const ActionRepo = makeRepo<StudentAction>('actions');
export const OutcomeRepo = makeRepo<ActionOutcome>('outcomes');
export const MilestoneRepo = makeRepo<Milestone>('milestones');
export const GoalRepo = makeRepo<StudentGoal>('goals');
export const EvidenceRepo = makeRepo<SkillEvidence & { id: string }>('evidence');
export const ReadinessRepo = makeRepo<ReadinessSnapshot>('readiness_snapshots');
export const StudentRepo = makeRepo<Student>('students');
