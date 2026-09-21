import * as acorn from "acorn";
import { simple as walkSimple } from "acorn-walk";
import { SupportedLanguage } from "../domain/enums.js";
import type { StaticFinding } from "../domain/types.js";
import type { StaticAnalyzer } from "./types.js";

/**
 * Real JS parsing via acorn (the same parser family used by Babel/ESLint
 * under the hood), not a regex-based fake linter.
 */
export class JavaScriptStaticAnalyzer implements StaticAnalyzer {
  availability: "available" | "unavailable" = "available";

  async analyze(sourceCode: string): Promise<StaticFinding[]> {
    const findings: StaticFinding[] = [];
    let ast: acorn.Node;

    try {
      ast = acorn.parse(sourceCode, { ecmaVersion: "latest", sourceType: "script", locations: true });
    } catch (err) {
      const e = err as { message?: string; loc?: { line: number; column: number } };
      findings.push({
        ruleId: "js-syntax-error",
        language: SupportedLanguage.JAVASCRIPT,
        message: `SyntaxError: ${e.message ?? "unknown parse error"}`,
        severity: "error",
        source: "ast-analysis",
        range: {
          startLine: e.loc?.line ?? 1,
          endLine: e.loc?.line ?? 1,
          startCol: e.loc?.column ?? 0,
          endCol: (e.loc?.column ?? 0) + 1,
        },
      });
      return findings;
    }

    walkSimple(ast, {
      BinaryExpression(node: any) {
        if (node.operator === "==" || node.operator === "!=") {
          findings.push({
            ruleId: "js-loose-equality",
            language: SupportedLanguage.JAVASCRIPT,
            message: `Loose equality '${node.operator}' triggers type coercion; '${node.operator}=' avoids surprising comparisons (e.g. '' == 0, null == undefined).`,
            severity: "warning",
            source: "ast-analysis",
            range: { startLine: node.loc.start.line, endLine: node.loc.end.line },
          });
        }
      },
      CallExpression(node: any) {
        if (
          node.callee?.type === "Identifier" &&
          node.callee.name === "parseInt" &&
          node.arguments.length < 2
        ) {
          findings.push({
            ruleId: "js-parseint-no-radix",
            language: SupportedLanguage.JAVASCRIPT,
            message: "parseInt() called without an explicit radix; strings with a leading '0' can be misparsed in some engines/environments.",
            severity: "info",
            source: "ast-analysis",
            range: { startLine: node.loc.start.line, endLine: node.loc.end.line },
          });
        }
      },
      TryStatement(node: any) {
        if (node.handler && node.handler.body?.body?.length === 0) {
          findings.push({
            ruleId: "js-empty-catch",
            language: SupportedLanguage.JAVASCRIPT,
            message: "Empty catch block silently swallows errors.",
            severity: "warning",
            source: "ast-analysis",
            range: { startLine: node.handler.loc.start.line, endLine: node.handler.loc.end.line },
          });
        }
      },
    });

    return findings;
  }
}
