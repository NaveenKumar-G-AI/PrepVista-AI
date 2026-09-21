import { Finding, Severity } from '../types';
import { RuleContext } from './types';
import { RULE_DIMENSIONS } from '../config';

let findingCounter = 0;
function nextFindingId(ruleId: string): string {
  findingCounter++;
  return `${ruleId.toLowerCase()}_${findingCounter}`;
}

function makeFinding(ruleId: string, ruleVersion: string, rest: Omit<Finding, 'findingId' | 'ruleId' | 'ruleVersion' | 'dimensions' | 'origin'>): Finding {
  return {
    findingId: nextFindingId(ruleId),
    ruleId,
    ruleVersion,
    dimensions: RULE_DIMENSIONS[ruleId] || {},
    origin: 'DETERMINISTIC',
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// LONG_FUNCTION — multiple signals, not just a line-count cutoff.
// ---------------------------------------------------------------------------
export function ruleLongFunction(ctx: RuleContext): Finding[] {
  const out: Finding[] = [];
  for (const fn of ctx.functions) {
    const overLines = fn.lineCount > ctx.thresholds.LONG_FUNCTION_LINES;
    const overStatements = fn.statementCount > ctx.thresholds.LONG_FUNCTION_STATEMENTS;
    if (!(overLines || overStatements)) continue;
    const signals = [overLines, overStatements, fn.maxNestingDepth >= 3, fn.paramCount > ctx.thresholds.EXCESSIVE_PARAMS].filter(Boolean).length;
    const severity: Severity = signals >= 3 ? 'HIGH' : 'MEDIUM';
    out.push(
      makeFinding('LONG_FUNCTION', ctx.ruleVersion, {
        category: 'LONG_FUNCTION',
        severity,
        confidence: 'HIGH',
        title: `Function "${fn.name}" is long relative to its responsibilities`,
        description: `"${fn.name}" spans ${fn.lineCount} lines with ${fn.statementCount} statements, nesting depth ${fn.maxNestingDepth}, and ${fn.paramCount} parameter(s).`,
        impact: 'Long functions are harder to read in one pass, harder to test in isolation, and more likely to accumulate unrelated responsibilities over time.',
        sourceLocation: fn.loc,
        evidence: [`lines=${fn.lineCount}`, `statements=${fn.statementCount}`, `maxNestingDepth=${fn.maxNestingDepth}`, `params=${fn.paramCount}`],
        suggestedAction: 'Consider extracting cohesive sections into helper functions, especially any part that could be tested independently.',
      })
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// DEEP_NESTING
// ---------------------------------------------------------------------------
export function ruleDeepNesting(ctx: RuleContext): Finding[] {
  const out: Finding[] = [];
  for (const fn of ctx.functions) {
    if (fn.maxNestingDepth < ctx.thresholds.DEEP_NESTING_DEPTH) continue;
    out.push(
      makeFinding('DEEP_NESTING', ctx.ruleVersion, {
        category: 'DEEP_NESTING',
        severity: fn.maxNestingDepth >= ctx.thresholds.DEEP_NESTING_DEPTH + 2 ? 'HIGH' : 'MEDIUM',
        confidence: 'HIGH',
        title: `Function "${fn.name}" has deeply nested control flow`,
        description: `Nesting reaches depth ${fn.maxNestingDepth} inside "${fn.name}".`,
        impact: 'Deep nesting makes it hard to hold all the surrounding conditions in mind while reading the innermost logic.',
        sourceLocation: fn.loc,
        evidence: [`maxNestingDepth=${fn.maxNestingDepth}`],
        suggestedAction: 'Use guard clauses or early returns to flatten the outer conditions, or extract the inner block into a helper function.',
      })
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// EXCESSIVE_PARAMETERS — flags the count; does not prescribe an object wrapper.
// ---------------------------------------------------------------------------
export function ruleExcessiveParameters(ctx: RuleContext): Finding[] {
  const out: Finding[] = [];
  for (const fn of ctx.functions) {
    if (fn.paramCount <= ctx.thresholds.EXCESSIVE_PARAMS) continue;
    out.push(
      makeFinding('EXCESSIVE_PARAMETERS', ctx.ruleVersion, {
        category: 'EXCESSIVE_PARAMETERS',
        severity: fn.paramCount > ctx.thresholds.EXCESSIVE_PARAMS + 3 ? 'MEDIUM' : 'LOW',
        confidence: 'HIGH',
        title: `Function "${fn.name}" takes ${fn.paramCount} parameters`,
        description: `"${fn.name}" has ${fn.paramCount} parameters, above the ${ctx.thresholds.EXCESSIVE_PARAMS} generally considered easy to call correctly.`,
        impact: 'Call sites with many positional parameters are error-prone and hard to read without checking the signature.',
        sourceLocation: fn.loc,
        evidence: [`paramCount=${fn.paramCount}`],
        suggestedAction: 'Consider whether some parameters are always passed together and could be grouped — though that depends on context.',
      })
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// MAGIC_NUMBER / MAGIC_STRING
// ---------------------------------------------------------------------------
export function ruleMagicValues(ctx: RuleContext): Finding[] {
  return ctx.magicValues.map((hit) => {
    const isRepeated = hit.occurrences >= ctx.thresholds.MAGIC_NUMBER_REPEAT_FOR_MEDIUM;
    const ruleId = hit.kind === 'number' ? 'MAGIC_NUMBER' : 'MAGIC_STRING';
    return makeFinding(ruleId, ctx.ruleVersion, {
      category: ruleId,
      severity: isRepeated ? 'MEDIUM' : 'LOW',
      confidence: 'MEDIUM',
      title: `Unexplained ${hit.kind} literal ${JSON.stringify(hit.value)}${isRepeated ? ' used repeatedly' : ''}`,
      description: `The ${hit.kind} value ${JSON.stringify(hit.value)} appears ${hit.occurrences} time(s) without an explaining name.`,
      impact: 'A named constant documents intent and gives future readers — including the author — one place to change the value.',
      sourceLocation: hit.loc,
      evidence: [`occurrences=${hit.occurrences}`],
      suggestedAction: `Extract ${JSON.stringify(hit.value)} into a named constant that explains what it represents.`,
    });
  });
}

// ---------------------------------------------------------------------------
// DUPLICATED_LOGIC
// ---------------------------------------------------------------------------
export function ruleDuplicatedLogic(ctx: RuleContext): Finding[] {
  return ctx.duplication.map((dup) => {
    const severity: Severity = dup.lineCount > 15 ? 'HIGH' : dup.lineCount >= 5 ? 'MEDIUM' : 'LOW';
    return makeFinding('DUPLICATED_LOGIC', ctx.ruleVersion, {
      category: 'DUPLICATED_LOGIC',
      severity,
      confidence: dup.kind === 'EXACT_STRUCTURAL' ? 'HIGH' : 'MEDIUM',
      title: `"${dup.a.name}" and "${dup.b.name}" share ${dup.kind === 'EXACT_STRUCTURAL' ? 'identical' : 'very similar'} structure`,
      description:
        dup.kind === 'EXACT_STRUCTURAL'
          ? 'These two functions have the same control-flow structure once identifier names are ignored.'
          : `These two functions have an estimated ${Math.round(dup.similarity * 100)}% structural similarity.`,
      impact: 'Duplicated logic means every future fix or behavior change has to be made in more than one place, and it is easy to update one copy and forget the other.',
      sourceLocation: dup.a.loc,
      evidence: [`location_a=L${dup.a.loc.startLine}-${dup.a.loc.endLine}`, `location_b=L${dup.b.loc.startLine}-${dup.b.loc.endLine}`, `similarity=${dup.similarity.toFixed(2)}`],
      suggestedAction: 'Extract the shared structure into a single function that both call sites use.',
    });
  });
}

// ---------------------------------------------------------------------------
// DEAD_CODE / UNUSED_VARIABLE / UNUSED_IMPORT
// ---------------------------------------------------------------------------
export function ruleDeadCode(ctx: RuleContext): Finding[] {
  return ctx.deadCode.map((hit) =>
    makeFinding('DEAD_CODE', ctx.ruleVersion, {
      category: 'DEAD_CODE',
      severity: 'MEDIUM',
      confidence: 'HIGH',
      title: 'Unreachable code detected',
      description: hit.reason,
      impact: 'Code that can never execute is misleading to readers and adds maintenance weight with zero behavioral benefit.',
      sourceLocation: hit.loc,
      evidence: [`line=${hit.loc.startLine}`],
      suggestedAction: 'Remove the unreachable statement(s), or restructure the control flow if they were meant to run.',
    })
  );
}

export function ruleUnusedVariable(ctx: RuleContext): Finding[] {
  return ctx.unusedVariables.map((hit) =>
    makeFinding('UNUSED_VARIABLE', ctx.ruleVersion, {
      category: 'UNUSED_VARIABLE',
      severity: 'LOW',
      confidence: 'MEDIUM',
      title: `Variable "${hit.name}" appears to be unused`,
      description: `"${hit.name}" is assigned but never read again within its enclosing function, based on name matching within that scope.`,
      impact: 'Unused variables add noise and can signal an incomplete edit or a bug where the wrong variable is being used elsewhere.',
      sourceLocation: hit.loc,
      evidence: [`name=${hit.name}`],
      suggestedAction: `Remove "${hit.name}" if it truly is not needed, or use it if this was an oversight.`,
    })
  );
}

export function ruleUnusedImport(ctx: RuleContext): Finding[] {
  return ctx.unusedImports.map((hit) =>
    makeFinding('UNUSED_IMPORT', ctx.ruleVersion, {
      category: 'UNUSED_IMPORT',
      severity: 'LOW',
      confidence: 'MEDIUM',
      title: `Import "${hit.name}" appears to be unused`,
      description: `"${hit.name}" is imported but never referenced elsewhere in the file, based on name matching.`,
      impact: 'Unused imports add noise and can hide a missing dependency or a leftover from refactoring.',
      sourceLocation: hit.loc,
      evidence: [`name=${hit.name}`],
      suggestedAction: `Remove the unused import if "${hit.name}" is not referenced dynamically elsewhere.`,
    })
  );
}

// ---------------------------------------------------------------------------
// SWALLOWED_EXCEPTION / RESOURCE_LEAK
// ---------------------------------------------------------------------------
export function ruleSwallowedException(ctx: RuleContext): Finding[] {
  return ctx.swallowedExceptions.map((hit) =>
    makeFinding('SWALLOWED_EXCEPTION', ctx.ruleVersion, {
      category: 'SWALLOWED_EXCEPTION',
      severity: 'HIGH',
      confidence: 'HIGH',
      title: hit.isBare ? 'Bare except clause silently discards all errors' : 'Exception handler discards the error without acting on it',
      description: `An except/catch block ${hit.isBare ? '(catching all exception types) ' : ''}has an empty or trivial body, so failures pass silently.`,
      impact: 'Swallowed exceptions hide real failures, making bugs far harder to diagnose later since there is no trace that anything went wrong.',
      sourceLocation: hit.loc,
      evidence: [`exceptionType=${hit.exceptionType || 'ANY'}`, `isBare=${hit.isBare}`],
      suggestedAction: 'Handle the specific exception type you expect, and at minimum log it — do not let failures disappear silently.',
    })
  );
}

export function ruleResourceLeak(ctx: RuleContext): Finding[] {
  return ctx.resourceLeaks.map((hit) =>
    makeFinding('RESOURCE_LEAK', ctx.ruleVersion, {
      category: 'RESOURCE_LEAK',
      severity: 'HIGH',
      confidence: 'MEDIUM',
      title: `Resource opened via "${hit.resourceCall}(...)" without a scoped lifecycle`,
      description: `A call to ${hit.resourceCall}(...) was found outside a context-manager (with) block, so it isn't statically evident the resource is always released.`,
      impact: 'Resources that are not reliably closed can leak file handles or connections, especially when an exception is raised between acquisition and release.',
      sourceLocation: hit.loc,
      evidence: [`call=${hit.resourceCall}`],
      suggestedAction: `Use a "with ${hit.resourceCall}(...) as f:" block so the resource is released automatically, including on exceptions.`,
    })
  );
}

// ---------------------------------------------------------------------------
// GOD_FUNCTION — composite signal: long AND touches several unrelated concerns.
// ---------------------------------------------------------------------------
const RESPONSIBILITY_KEYWORDS: Record<string, RegExp> = {
  validate: /valid|check|assert|verify/i,
  compute: /calc|comput|total|process/i,
  persist: /save|write|insert|update|delete|persist|store/i,
  notify: /send|notify|email|publish|alert/i,
  render: /render|print|display|format|log/i,
};

export function ruleGodFunction(ctx: RuleContext): Finding[] {
  const out: Finding[] = [];
  for (const fn of ctx.functions) {
    if (fn.lineCount < ctx.thresholds.LONG_FUNCTION_LINES * 0.75) continue;
    const categoriesHit = new Set<string>();
    for (const call of fn.calledFunctionNames) {
      for (const [cat, re] of Object.entries(RESPONSIBILITY_KEYWORDS)) {
        if (re.test(call)) categoriesHit.add(cat);
      }
    }
    if (categoriesHit.size < ctx.thresholds.GOD_FUNCTION_MIN_CATEGORIES) continue;
    out.push(
      makeFinding('GOD_FUNCTION', ctx.ruleVersion, {
        category: 'GOD_FUNCTION',
        severity: 'HIGH',
        confidence: 'MEDIUM',
        title: `Function "${fn.name}" appears to mix several unrelated responsibilities`,
        description: `Based on the functions it calls, "${fn.name}" touches ${categoriesHit.size} different concerns: ${Array.from(categoriesHit).join(', ')}.`,
        impact: 'Functions that mix unrelated responsibilities are harder to test in isolation and tend to accumulate more changes — and more bugs — over time.',
        sourceLocation: fn.loc,
        evidence: [`responsibility_categories=${Array.from(categoriesHit).join(',')}`, `calls=${fn.calledFunctionNames.slice(0, 8).join(',')}`],
        suggestedAction: 'Separate validation, computation, persistence, and notification into distinct functions that this one coordinates.',
      })
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// COMMENTED_OUT_CODE
// ---------------------------------------------------------------------------
const CODE_LIKE_PATTERN = /[=(){};]|\b(if|for|while|def|function|return|const|let|var|print|console\.log)\b/;
const DOC_LIKE_START = /^(TODO|FIXME|NOTE|HACK|XXX|@|eslint|type:|pylint|noqa)/i;

export function ruleCommentedOutCode(ctx: RuleContext): Finding[] {
  const out: Finding[] = [];
  for (const c of ctx.comments) {
    const raw = typeof c.value === 'string' ? c.value : '';
    const text = raw.replace(/^\/\/|^#|^\/\*|\*\/$/g, '').trim();
    if (text.length < 8) continue;
    if (DOC_LIKE_START.test(text)) continue;
    if (text.split(/\s+/).length > 25) continue;
    if (!CODE_LIKE_PATTERN.test(text)) continue;
    if (/[.!?]\s*$/.test(text)) continue; // ends like a sentence — probably prose

    out.push(
      makeFinding('COMMENTED_OUT_CODE', ctx.ruleVersion, {
        category: 'COMMENTED_OUT_CODE',
        severity: 'LOW',
        confidence: 'MEDIUM',
        title: 'Comment appears to be commented-out source code',
        description: `A comment near line ${c.loc.startLine} looks like disabled code rather than an explanation.`,
        impact: 'Commented-out code adds noise and goes stale; version control already preserves history, so it rarely needs to live in the source.',
        sourceLocation: c.loc,
        evidence: [text.slice(0, 80)],
        suggestedAction: 'Remove the commented-out code and rely on version control history if it needs to be recovered later.',
      })
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// POOR_NAMING
// ---------------------------------------------------------------------------
export function rulePoorNaming(ctx: RuleContext): Finding[] {
  return ctx.namingIssues.map((issue) =>
    makeFinding('POOR_NAMING', ctx.ruleVersion, {
      category: 'POOR_NAMING',
      severity: 'LOW',
      confidence: 'MEDIUM',
      title: `Identifier "${issue.name}" may not communicate its purpose`,
      description: issue.reason,
      impact: 'Unclear names force readers to trace usage to understand intent that a better name could have conveyed immediately.',
      sourceLocation: issue.loc,
      evidence: [`name=${issue.name}`],
      suggestedAction: `Rename "${issue.name}" to describe what it represents or does.`,
    })
  );
}

export const ALL_RULES = [
  ruleLongFunction,
  ruleDeepNesting,
  ruleExcessiveParameters,
  ruleMagicValues,
  ruleDuplicatedLogic,
  ruleDeadCode,
  ruleUnusedVariable,
  ruleUnusedImport,
  ruleSwallowedException,
  ruleResourceLeak,
  ruleGodFunction,
  ruleCommentedOutCode,
  rulePoorNaming,
];
