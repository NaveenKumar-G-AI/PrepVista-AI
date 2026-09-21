import { SupportedLanguage } from '../types';
import { NormalizedNode } from '../parsers/ir';
import { FunctionMetrics, DeadCodeHit, UnusedHit } from '../analysis/structural';
import { DuplicationMatch } from '../analysis/duplication';
import { MagicValueHit } from '../analysis/magic_values';
import { NamingIssue } from '../analysis/naming';
import { SwallowedExceptionHit, ResourceLeakHit } from '../analysis/error_handling';
import { THRESHOLDS } from '../config';

export interface RuleContext {
  language: SupportedLanguage;
  root: NormalizedNode;
  functions: FunctionMetrics[];
  duplication: DuplicationMatch[];
  magicValues: MagicValueHit[];
  namingIssues: NamingIssue[];
  swallowedExceptions: SwallowedExceptionHit[];
  resourceLeaks: ResourceLeakHit[];
  deadCode: DeadCodeHit[];
  unusedVariables: UnusedHit[];
  unusedImports: UnusedHit[];
  comments: NormalizedNode[];
  thresholds: typeof THRESHOLDS;
  ruleVersion: string;
}
