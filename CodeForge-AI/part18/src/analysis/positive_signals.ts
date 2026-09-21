import { FunctionMetrics } from './structural';
import { PositiveSignal } from '../types';
import { THRESHOLDS } from '../config';

let counter = 0;
function nextId(prefix: string): string {
  counter++;
  return `${prefix}_${counter}`;
}

export interface PositiveSignalInput {
  functions: FunctionMetrics[];
  duplicationCount: number;
  magicValueCount: number;
  namingIssueCount: number;
  swallowedExceptionCount: number;
  resourceLeakCount: number;
  hasAnyTryExcept: boolean;
  hasAnyWithForResources: boolean;
}

export function detectPositiveSignals(p: PositiveSignalInput): PositiveSignal[] {
  const signals: PositiveSignal[] = [];

  const focused = p.functions.filter(
    (f) => f.lineCount <= THRESHOLDS.MAX_FUNCTION_LENGTH_FOR_POSITIVE && f.maxNestingDepth <= 2 && f.paramCount <= THRESHOLDS.EXCESSIVE_PARAMS
  );
  if (p.functions.length > 0 && focused.length === p.functions.length) {
    signals.push({
      signalId: nextId('pos'),
      category: 'FOCUSED_FUNCTION',
      title: 'Functions are focused and appropriately sized',
      description: `All ${p.functions.length} function(s) stay within a reasonable length, nesting depth, and parameter count.`,
      sourceLocation: null,
      confidence: 'HIGH',
    });
  }

  if (p.functions.length > 0 && p.duplicationCount === 0) {
    signals.push({
      signalId: nextId('pos'),
      category: 'LOW_DUPLICATION',
      title: 'No significant duplicated logic detected',
      description: 'No structurally duplicated or near-duplicate function bodies were found.',
      sourceLocation: null,
      confidence: 'HIGH',
    });
  }

  if (p.hasAnyTryExcept && p.swallowedExceptionCount === 0) {
    signals.push({
      signalId: nextId('pos'),
      category: 'GOOD_ERROR_HANDLING',
      title: 'Exceptions are handled deliberately',
      description: 'Error-handling blocks were found and none of them silently swallow failures.',
      sourceLocation: null,
      confidence: 'MEDIUM',
    });
  }

  if (p.hasAnyWithForResources && p.resourceLeakCount === 0) {
    signals.push({
      signalId: nextId('pos'),
      category: 'GOOD_RESOURCE_MANAGEMENT',
      title: 'Resources are managed with proper lifecycle handling',
      description: 'Resource acquisition uses scoped context management rather than manual open/close.',
      sourceLocation: null,
      confidence: 'MEDIUM',
    });
  }

  if (p.functions.length > 0 && p.magicValueCount === 0) {
    signals.push({
      signalId: nextId('pos'),
      category: 'NO_MAGIC_VALUES',
      title: 'No unexplained literals detected',
      description: 'Numeric and string literals in the code are either trivial or used clearly.',
      sourceLocation: null,
      confidence: 'MEDIUM',
    });
  }

  if (p.functions.length > 0 && p.namingIssueCount === 0) {
    signals.push({
      signalId: nextId('pos'),
      category: 'CLEAR_NAMING',
      title: 'Identifiers are clear and descriptive',
      description: 'No generic, single-character (outside loop context), or overly short identifiers were detected.',
      sourceLocation: null,
      confidence: 'MEDIUM',
    });
  }

  return signals;
}
