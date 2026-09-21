import { AnalyzeRequest, QualityReport } from '../types';
import { getAdapter } from '../parsers';
import { findAll } from '../parsers/ir';
import { extractFunctions, detectUnreachableCode, detectUnusedImports, detectUnusedVariables } from '../analysis/structural';
import { detectDuplication } from '../analysis/duplication';
import { detectMagicValues } from '../analysis/magic_values';
import { detectNamingIssues } from '../analysis/naming';
import { detectSwallowedExceptions, detectResourceLeaks } from '../analysis/error_handling';
import { detectPositiveSignals } from '../analysis/positive_signals';
import { evaluateComplexityQuality } from '../analysis/complexity_integration';
import { applyContextualPolicy } from '../analysis/context_policy';
import { runRules, RuleContext } from '../rules/engine';
import { computeScore, pickMostImportantImprovement, summarizeConfidence, compareReports } from '../scoring/engine';
import { AIProvider } from '../ai/provider';
import { buildAIInput, validateAIOutput } from '../ai/prompt';
import { sourceHash } from './hashing';
import { QualityCache } from './cache';
import { logEvent } from './logger';
import { ANALYSIS_VERSION, RULE_SET_VERSION, THRESHOLDS } from '../config';

interface DeterministicCore {
  findings: QualityReport['findings'];
  positiveSignals: QualityReport['positiveSignals'];
  dimensionScores: QualityReport['dimensionScores'];
  overallScore: number;
  overallLabel: string;
  mostImportantImprovement: QualityReport['mostImportantImprovement'];
  confidenceSummary: QualityReport['confidenceSummary'];
  functionCount: number;
}

type CoreResult = { ok: true; core: DeterministicCore } | { ok: false; reason: string; message: string };

// Only the expensive, purely-deterministic part of the pipeline (parse → structural →
// duplication → rules → score) is cached. AI interpretation and before/after comparison
// depend on per-call options (which provider, which previous report) that a cached report
// cannot reflect, so they are deliberately NOT part of this cache and run fresh every call.
const coreCache = new QualityCache<DeterministicCore>(500);

export interface AnalyzeOptions {
  aiProvider?: AIProvider;
  previousReport?: { overallScore: number; dimensionScores: QualityReport['dimensionScores'] } | null;
  persist?: (report: QualityReport) => Promise<void>;
  correlationId?: string;
}

async function computeDeterministicCore(request: AnalyzeRequest, correlationId: string): Promise<CoreResult> {
  let adapter;
  try {
    adapter = getAdapter(request.language);
  } catch (err) {
    return { ok: false, reason: 'UnsupportedLanguage', message: String(err) };
  }

  let parsed;
  try {
    parsed = await adapter.parse(request.source);
  } catch (err) {
    const msg = String(err);
    const reason = msg.includes('MalformedSource') ? 'MalformedSource' : msg.includes('UnsupportedLanguage') ? 'UnsupportedLanguage' : 'ParserFailure';
    logEvent('analysis.parser_failure', { reason }, correlationId);
    return { ok: false, reason, message: msg };
  }

  const t0 = Date.now();
  const functions = extractFunctions(parsed.root);
  const deadCode = detectUnreachableCode(parsed.root);
  const unusedImports = detectUnusedImports(parsed.root);
  const unusedVariables = detectUnusedVariables(functions);
  const thresholds = applyContextualPolicy(THRESHOLDS, request.problemContext, request.roleContext);
  const duplication = detectDuplication(functions, thresholds.DUPLICATION_MIN_STATEMENTS, thresholds.NEAR_DUP_SIMILARITY);
  const magicValues = detectMagicValues(parsed.root);
  const namingIssues = detectNamingIssues(functions.map((f) => ({ name: f.name, node: f.node })));
  const swallowedExceptions = detectSwallowedExceptions(parsed.root);
  const resourceLeaks = detectResourceLeaks(parsed.root);
  logEvent('analysis.structural_complete', { durationMs: Date.now() - t0, functionCount: functions.length }, correlationId);

  const ruleCtx: RuleContext = {
    language: request.language,
    root: parsed.root,
    functions,
    duplication,
    magicValues,
    namingIssues,
    swallowedExceptions,
    resourceLeaks,
    deadCode,
    unusedVariables,
    unusedImports,
    comments: parsed.comments,
    thresholds,
    ruleVersion: RULE_SET_VERSION,
  };

  let findings = runRules(ruleCtx);
  findings = findings.concat(evaluateComplexityQuality(request.complexity, duplication, RULE_SET_VERSION));

  const hasAnyTryExcept = findAll(parsed.root, 'Try').length > 0;
  const hasAnyWithForResources = findAll(parsed.root, 'With').length > 0;

  const positiveSignals = detectPositiveSignals({
    functions,
    duplicationCount: duplication.length,
    magicValueCount: magicValues.length,
    namingIssueCount: namingIssues.length,
    swallowedExceptionCount: swallowedExceptions.length,
    resourceLeakCount: resourceLeaks.length,
    hasAnyTryExcept,
    hasAnyWithForResources,
  });

  const { dimensionScores, overallScore, overallLabel } = computeScore(findings);
  const mostImportantImprovement = pickMostImportantImprovement(findings);
  const confidenceSummary = summarizeConfidence(findings);

  return {
    ok: true,
    core: { findings, positiveSignals, dimensionScores, overallScore, overallLabel, mostImportantImprovement, confidenceSummary, functionCount: functions.length },
  };
}

export async function analyzeSubmission(request: AnalyzeRequest, options: AnalyzeOptions = {}): Promise<QualityReport> {
  const correlationId = options.correlationId || `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const hash = sourceHash(request.source, request.language);
  const cacheKey = `${hash}:${request.language}:${ANALYSIS_VERSION}:${RULE_SET_VERSION}`;

  logEvent('analysis.start', { language: request.language, submissionId: request.submissionId }, correlationId);

  const cachedCore = coreCache.get(cacheKey);
  const cacheHit = !!cachedCore;
  let core: DeterministicCore;

  if (cachedCore) {
    logEvent('analysis.cache_hit', { language: request.language }, correlationId);
    core = cachedCore;
  } else {
    const result = await computeDeterministicCore(request, correlationId);
    if (!result.ok) {
      return buildFailureReport(request, hash, result.reason, result.message);
    }
    core = result.core;
    coreCache.set(cacheKey, core);
  }

  const { findings, positiveSignals, dimensionScores, overallScore, overallLabel, mostImportantImprovement, confidenceSummary, functionCount } = core;

  let aiInterpretation = null;
  let aiStatus: QualityReport['aiStatus'] = 'NOT_CONFIGURED';
  if (options.aiProvider) {
    try {
      const aiInput = buildAIInput({
        problemContext: request.problemContext,
        roleContext: request.roleContext,
        language: request.language,
        deterministicFindings: findings,
        positiveSignals,
        structuralSummary: { functionCount },
        complexity: request.complexity,
        executionEvidence: request.executionEvidence,
        relevantSourceSnippets: [],
      });
      const raw = await options.aiProvider.interpret(aiInput);
      const validated = validateAIOutput(raw);
      if (validated) {
        aiInterpretation = validated;
        aiStatus = 'OK';
      } else {
        aiStatus = 'INVALID_RESPONSE';
        logEvent('ai.invalid_response', {}, correlationId);
      }
    } catch (err) {
      aiStatus = 'UNAVAILABLE';
      logEvent('ai.failure', {}, correlationId);
    }
  }

  let comparison = null;
  if (options.previousReport) {
    comparison = compareReports(options.previousReport, { overallScore, dimensionScores });
  }

  const report: QualityReport = {
    submissionId: request.submissionId,
    language: request.language,
    analysisVersion: ANALYSIS_VERSION,
    ruleSetVersion: RULE_SET_VERSION,
    sourceHash: hash,
    overallScore,
    overallLabel,
    dimensionScores,
    findings,
    positiveSignals,
    mostImportantImprovement,
    aiInterpretation,
    aiStatus,
    comparison,
    confidenceSummary,
    generatedAt: new Date().toISOString(),
    cacheHit,
  };

  logEvent('analysis.complete', { overallScore, findingCount: findings.length, cacheHit }, correlationId);

  if (options.persist) {
    try {
      await options.persist(report);
    } catch (err) {
      logEvent('persist.failure', {}, correlationId);
    }
  }

  return report;
}

function buildFailureReport(request: AnalyzeRequest, hash: string, reason: string, message: string): QualityReport {
  return {
    submissionId: request.submissionId,
    language: request.language,
    analysisVersion: ANALYSIS_VERSION,
    ruleSetVersion: RULE_SET_VERSION,
    sourceHash: hash,
    overallScore: 0,
    overallLabel: 'ANALYSIS_FAILED',
    dimensionScores: [],
    findings: [
      {
        findingId: 'failure_1',
        ruleId: reason,
        ruleVersion: RULE_SET_VERSION,
        category: 'INTERNAL',
        severity: 'INFO',
        confidence: 'UNKNOWN',
        title: `Analysis could not complete: ${reason}`,
        description: message.slice(0, 300),
        impact: 'No quality score could be produced for this submission.',
        sourceLocation: null,
        evidence: [],
        suggestedAction: 'Verify the submitted source is valid and in a supported language.',
        dimensions: {},
        origin: 'DETERMINISTIC',
      },
    ],
    positiveSignals: [],
    mostImportantImprovement: null,
    aiInterpretation: null,
    aiStatus: 'NOT_CONFIGURED',
    comparison: null,
    confidenceSummary: { high: 0, medium: 0, low: 0, unknown: 1 },
    generatedAt: new Date().toISOString(),
    cacheHit: false,
  };
}
