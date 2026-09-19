import { jsAdapter } from '@/modules/coding/engines/quality/parsers/js_adapter';
import { extractFunctions, detectUnreachableCode, detectUnusedImports, detectUnusedVariables } from '@/modules/coding/engines/quality/analysis/structural';
import { detectDuplication } from '@/modules/coding/engines/quality/analysis/duplication';
import { detectMagicValues } from '@/modules/coding/engines/quality/analysis/magic_values';
import { detectNamingIssues } from '@/modules/coding/engines/quality/analysis/naming';
import { detectSwallowedExceptions, detectResourceLeaks } from '@/modules/coding/engines/quality/analysis/error_handling';
import { runRules } from '@/modules/coding/engines/quality/rules/engine';
import { THRESHOLDS, RULE_SET_VERSION } from '@/modules/coding/engines/quality/config';
export async function reviewSource(source: string) {
  const parsed = await jsAdapter.parse(source); const functions = extractFunctions(parsed.root);
  return runRules({ language: 'javascript', root: parsed.root, functions, duplication: detectDuplication(functions, THRESHOLDS.DUPLICATION_MIN_STATEMENTS, THRESHOLDS.NEAR_DUP_SIMILARITY), magicValues: detectMagicValues(parsed.root), namingIssues: detectNamingIssues(functions), swallowedExceptions: detectSwallowedExceptions(parsed.root), resourceLeaks: detectResourceLeaks(parsed.root), deadCode: detectUnreachableCode(parsed.root), unusedVariables: detectUnusedVariables(functions), unusedImports: detectUnusedImports(parsed.root), comments: parsed.comments, thresholds: THRESHOLDS, ruleVersion: RULE_SET_VERSION }).slice(0, 30);
}
