import sanitizeHtml from "sanitize-html";
import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";

/** Commands that are only dangerous if a render block is EVER compiled server-side
 *  (shell-escape during a real pdflatex/xelatex pass) rather than rendered
 *  client-side via KaTeX/MathJax. Flagged defensively either way — cheap to check,
 *  expensive to be wrong about (spec §66). */
const UNSAFE_LATEX_COMMANDS = ["\\write18", "\\input{", "\\include{", "\\immediate\\write", "\\openout", "\\catcode"];

/** Commands KaTeX (ACEAPT's assumed client-side renderer — see TRUTH_TABLE.md)
 *  does not support, so content using them will fail to render even though the
 *  LaTeX itself isn't "wrong" (spec §65: rendering failure is its own category). */
const KATEX_UNSUPPORTED_COMMANDS = ["\\includegraphics", "\\usepackage", "\\newcommand", "\\renewcommand", "\\input{", "\\bibliography"];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["b", "i", "em", "strong", "sub", "sup", "br", "p", "span", "table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li", "img"],
  allowedAttributes: { img: ["src", "alt", "width", "height"], span: ["class"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
  allowedSchemes: ["https", "data"],
  disallowedTagsMode: "discard"
};

const MAX_LATEX_NESTING_DEPTH = 25;

export class RuntimeValidator implements Validator {
  readonly name = "RUNTIME_VALIDATOR";
  readonly category = "RUNTIME" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["SCHEMA_VALIDATOR"];

  isApplicable(): boolean {
    return true;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const blocks = input.questionVersion.renderBlocks;

    for (const block of blocks) {
      if (block.kind === "LATEX") {
        const issue = this.checkLatex(block.content);
        if (issue) {
          return buildResult({
            validator: this.name,
            category: this.category,
            status: "FAIL",
            severity: issue.severity,
            code: issue.code,
            message: issue.message,
            evidence: issue.evidence,
            validatorVersion: this.version,
            startedAt
          });
        }
      }
      if (block.kind === "HTML") {
        const sanitized = sanitizeHtml(block.content, SANITIZE_OPTIONS);
        if (normalizeWhitespace(sanitized) !== normalizeWhitespace(block.content)) {
          return buildResult({
            validator: this.name,
            category: this.category,
            status: "FAIL",
            severity: "CRITICAL",
            code: "UNSAFE_MARKUP",
            message: "HTML render block contains disallowed tags/attributes (script, event handlers, unsafe URL schemes, or similar) that were stripped by sanitization.",
            evidence: { originalLength: block.content.length, sanitizedLength: sanitized.length },
            validatorVersion: this.version,
            startedAt
          });
        }
      }
      if (block.kind === "MARKDOWN") {
        const fenceCount = (block.content.match(/```/g) ?? []).length;
        if (fenceCount % 2 !== 0) {
          return buildResult({
            validator: this.name,
            category: this.category,
            status: "FAIL",
            severity: "MEDIUM",
            code: "LATEX_RENDER_FAILURE",
            message: "Markdown block has an unmatched code fence (```) and will render incorrectly.",
            validatorVersion: this.version,
            startedAt
          });
        }
      }
    }

    return buildResult({
      validator: this.name,
      category: this.category,
      status: "PASS",
      severity: "NONE",
      code: "VALID",
      message: "All render blocks are safe and well-formed.",
      evidence: { blockCount: blocks.length },
      validatorVersion: this.version,
      startedAt
    });
  }

  private checkLatex(content: string): { code: "LATEX_UNSAFE_COMMAND" | "LATEX_RENDER_FAILURE"; severity: "CRITICAL" | "HIGH" | "MEDIUM"; message: string; evidence: Record<string, unknown> } | null {
    for (const cmd of UNSAFE_LATEX_COMMANDS) {
      if (content.includes(cmd)) {
        return { code: "LATEX_UNSAFE_COMMAND", severity: "CRITICAL", message: `LaTeX block uses "${cmd.replace("{", "")}", which is unsafe if ever compiled server-side.`, evidence: { command: cmd } };
      }
    }
    for (const cmd of KATEX_UNSUPPORTED_COMMANDS) {
      if (content.includes(cmd)) {
        return { code: "LATEX_RENDER_FAILURE", severity: "MEDIUM", message: `LaTeX block uses "${cmd.replace("{", "")}", which KaTeX does not support — it will fail to render client-side.`, evidence: { command: cmd } };
      }
    }

    const dollarCount = (content.match(/(?<!\\)\$/g) ?? []).length;
    if (dollarCount % 2 !== 0) {
      return { code: "LATEX_RENDER_FAILURE", severity: "HIGH", message: "Unbalanced $ delimiters.", evidence: { dollarCount } };
    }
    if (!balanced(content, "\\(", "\\)") || !balanced(content, "\\[", "\\]") || !bracesBalanced(content)) {
      return { code: "LATEX_RENDER_FAILURE", severity: "HIGH", message: "Unbalanced \\(\\), \\[\\], or {} delimiters.", evidence: {} };
    }

    const depth = maxBraceNestingDepth(content);
    if (depth > MAX_LATEX_NESTING_DEPTH) {
      return { code: "LATEX_RENDER_FAILURE", severity: "MEDIUM", message: `Brace nesting depth (${depth}) exceeds a sane rendering limit (${MAX_LATEX_NESTING_DEPTH}) — likely to hang or crash the client renderer.`, evidence: { depth } };
    }

    return null;
  }
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function balanced(content: string, open: string, close: string): boolean {
  const openCount = countOccurrences(content, open);
  const closeCount = countOccurrences(content, close);
  return openCount === closeCount;
}

function countOccurrences(content: string, token: string): number {
  let count = 0;
  let idx = content.indexOf(token);
  while (idx !== -1) {
    count += 1;
    idx = content.indexOf(token, idx + token.length);
  }
  return count;
}

function bracesBalanced(content: string): boolean {
  let depth = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\\" ) { i++; continue; } // skip escaped char
    if (content[i] === "{") depth++;
    if (content[i] === "}") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function maxBraceNestingDepth(content: string): number {
  let depth = 0;
  let max = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\\") {
      i++;
      continue;
    }
    if (content[i] === "{") {
      depth++;
      max = Math.max(max, depth);
    }
    if (content[i] === "}") depth--;
  }
  return max;
}
