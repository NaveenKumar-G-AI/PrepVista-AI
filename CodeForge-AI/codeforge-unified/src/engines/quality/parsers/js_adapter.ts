import * as ts from 'typescript';
import { ParsedModule, NormalizedNode, NodeKind } from './ir';
import { LanguageAdapter } from './types';

function calleeText(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const base = calleeText(expr.expression);
    return base ? `${base}.${expr.name.text}` : expr.name.text;
  }
  if (ts.isCallExpression(expr)) return calleeText(expr.expression);
  return undefined;
}

function locOf(node: ts.Node, sf: ts.SourceFile) {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const end = sf.getLineAndCharacterOfPosition(node.getEnd());
  return { startLine: start.line + 1, endLine: end.line + 1, startCol: start.character, endCol: end.character };
}

export const jsAdapter: LanguageAdapter = {
  language: ['javascript', 'typescript'],
  async parse(source: string): Promise<ParsedModule> {
    if (source.length > 500_000) {
      throw new Error('MalformedSource: source exceeds the maximum size accepted by the parser');
    }

    // ts.createSourceFile is intentionally error-tolerant: invalid syntax yields a best-effort
    // tree rather than throwing. Unrecognized/malformed nodes are simply skipped by convert()
    // below (return null) instead of crashing the whole analysis — matches the engine's
    // "safe partial analysis" failure philosophy.
    const sf = ts.createSourceFile('submission.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    function paramsOf(params: ts.NodeArray<ts.ParameterDeclaration>): NormalizedNode[] {
      return params.map((p) => ({ kind: 'Param' as NodeKind, name: p.name.getText(sf), children: [], loc: locOf(p, sf) }));
    }

    function blockFromStatements(stmts: readonly ts.Statement[], fallbackNode: ts.Node): NormalizedNode {
      const children = stmts.map(convert).filter((n): n is NormalizedNode => n !== null);
      return { kind: 'Block', children, loc: locOf(fallbackNode, sf) };
    }

    function statementAsBlock(stmt: ts.Statement): NormalizedNode {
      return ts.isBlock(stmt) ? blockFromStatements(stmt.statements, stmt) : blockFromStatements([stmt], stmt);
    }

    function convert(node: ts.Node): NormalizedNode | null {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
        if (!node.body) return null;
        const block = blockFromStatements(node.body.statements, node.body);
        const name = ts.isConstructorDeclaration(node) ? 'constructor' : node.name?.getText(sf) || 'anonymous';
        return { kind: 'FunctionDecl', name, children: [...paramsOf(node.parameters), block], loc: locOf(node, sf) };
      }
      if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        let block: NormalizedNode;
        if (ts.isBlock(node.body)) {
          block = blockFromStatements(node.body.statements, node.body);
        } else {
          const expr = convert(node.body);
          block = { kind: 'Block', children: [{ kind: 'Return', children: expr ? [expr] : [], loc: locOf(node.body, sf) }], loc: locOf(node.body, sf) };
        }
        const name = ts.isFunctionExpression(node) && node.name ? node.name.text : 'anonymous';
        return { kind: 'FunctionDecl', name, children: [...paramsOf(node.parameters), block], loc: locOf(node, sf) };
      }
      if (ts.isClassDeclaration(node)) {
        const children = node.members.map(convert).filter((n): n is NormalizedNode => n !== null);
        return { kind: 'ClassDecl', name: node.name?.text || 'anonymous', children, loc: locOf(node, sf) };
      }
      if (ts.isIfStatement(node)) {
        const children: NormalizedNode[] = [statementAsBlock(node.thenStatement)];
        if (node.elseStatement) children.push(statementAsBlock(node.elseStatement));
        return { kind: 'If', children, loc: locOf(node, sf), meta: { hasElse: !!node.elseStatement } };
      }
      if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
        return { kind: 'For', children: [statementAsBlock(node.statement)], loc: locOf(node, sf) };
      }
      if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
        return { kind: 'While', children: [statementAsBlock(node.statement)], loc: locOf(node, sf) };
      }
      if (ts.isTryStatement(node)) {
        const tryBlock = blockFromStatements(node.tryBlock.statements, node.tryBlock);
        const children: NormalizedNode[] = [tryBlock];
        if (node.catchClause) {
          const catchBody = node.catchClause.block;
          const catchChildren = blockFromStatements(catchBody.statements, catchBody);
          children.push({
            kind: 'Catch',
            children: catchChildren.children,
            loc: locOf(node.catchClause, sf),
            meta: { exceptionType: null, isBare: false, isEmptyOrTrivial: catchBody.statements.length === 0 },
          });
        }
        return { kind: 'Try', children, loc: locOf(node, sf) };
      }
      if (ts.isReturnStatement(node)) {
        const expr = node.expression ? convert(node.expression) : null;
        return { kind: 'Return', children: expr ? [expr] : [], loc: locOf(node, sf) };
      }
      if (ts.isThrowStatement(node)) return { kind: 'Throw', children: [], loc: locOf(node, sf) };
      if (ts.isBreakStatement(node)) return { kind: 'Break', children: [], loc: locOf(node, sf) };
      if (ts.isContinueStatement(node)) return { kind: 'Continue', children: [], loc: locOf(node, sf) };
      if (ts.isCallExpression(node)) {
        const args = node.arguments.map(convert).filter((n): n is NormalizedNode => n !== null);
        return { kind: 'Call', name: calleeText(node.expression), children: args, loc: locOf(node, sf) };
      }
      if (ts.isBinaryExpression(node)) {
        const opToken = node.operatorToken.kind;
        const left = convert(node.left);
        const right = convert(node.right);
        const children = [left, right].filter((n): n is NormalizedNode => n !== null);
        if (opToken === ts.SyntaxKind.EqualsToken) {
          return { kind: 'Assignment', name: node.left.getText(sf), children: right ? [right] : [], loc: locOf(node, sf) };
        }
        if (
          [ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken].includes(
            opToken
          )
        ) {
          return { kind: 'AugAssignment', name: node.left.getText(sf), operator: ts.SyntaxKind[opToken], children: right ? [right] : [], loc: locOf(node, sf) };
        }
        if (opToken === ts.SyntaxKind.AmpersandAmpersandToken || opToken === ts.SyntaxKind.BarBarToken) {
          return { kind: 'BoolOp', operator: ts.SyntaxKind[opToken], children, loc: locOf(node, sf) };
        }
        return { kind: 'BinaryExpr', operator: ts.SyntaxKind[opToken], children, loc: locOf(node, sf) };
      }
      if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
        const operand = convert(node.operand);
        return { kind: 'UnaryExpr', children: operand ? [operand] : [], loc: locOf(node, sf) };
      }
      if (ts.isVariableStatement(node)) {
        const decls = node.declarationList.declarations.map((d) => {
          const val = d.initializer ? convert(d.initializer) : null;
          return { kind: 'VariableDecl' as NodeKind, name: d.name.getText(sf), children: val ? [val] : [], loc: locOf(d, sf) };
        });
        return decls.length === 1 ? decls[0] : { kind: 'Block', children: decls, loc: locOf(node, sf) };
      }
      if (ts.isNumericLiteral(node)) {
        return { kind: 'Literal', value: Number(node.text), meta: { literalType: 'number' }, children: [], loc: locOf(node, sf) };
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return { kind: 'Literal', value: node.text, meta: { literalType: 'string' }, children: [], loc: locOf(node, sf) };
      }
      if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
        return { kind: 'Literal', value: node.kind === ts.SyntaxKind.TrueKeyword, meta: { literalType: 'bool' }, children: [], loc: locOf(node, sf) };
      }
      if (node.kind === ts.SyntaxKind.NullKeyword) {
        return { kind: 'Literal', value: null, meta: { literalType: 'none' }, children: [], loc: locOf(node, sf) };
      }
      if (ts.isPropertyAccessExpression(node)) {
        return { kind: 'Identifier', name: calleeText(node), children: [], loc: locOf(node, sf) };
      }
      if (ts.isIdentifier(node)) {
        return { kind: 'Identifier', name: node.text, children: [], loc: locOf(node, sf) };
      }
      if (ts.isImportDeclaration(node)) {
        const moduleSpec = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
        const names: NormalizedNode[] = [];
        const clause = node.importClause;
        if (clause?.name) names.push({ kind: 'ImportName', name: clause.name.text, children: [], loc: locOf(clause, sf) });
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) {
            names.push({ kind: 'ImportName', name: el.name.text, children: [], loc: locOf(el, sf) });
          }
        }
        return { kind: 'Import', name: moduleSpec, children: names, loc: locOf(node, sf) };
      }
      if (ts.isExpressionStatement(node)) {
        const expr = convert(node.expression);
        return { kind: 'ExpressionStmt', children: expr ? [expr] : [], loc: locOf(node, sf) };
      }
      return null; // unknown/unsupported construct — safely skipped, never fabricated
    }

    const topLevel = sf.statements.map(convert).filter((n): n is NormalizedNode => n !== null);
    const lastLine = sf.getLineAndCharacterOfPosition(sf.end).line + 1;
    const root: NormalizedNode = { kind: 'Program', children: topLevel, loc: { startLine: 1, endLine: lastLine } };

    const comments = extractComments(source, sf);

    return { language: 'typescript', root, comments, sourceLines: source.split('\n') };
  },
};

function extractComments(sourceText: string, sf: ts.SourceFile): NormalizedNode[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, sourceText);
  const comments: NormalizedNode[] = [];
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const start = scanner.getTokenPos();
      const raw = scanner.getTokenText();
      const startPos = sf.getLineAndCharacterOfPosition(start);
      const endPos = sf.getLineAndCharacterOfPosition(start + raw.length);
      comments.push({ kind: 'Comment', value: raw, children: [], loc: { startLine: startPos.line + 1, endLine: endPos.line + 1 } });
    }
    token = scanner.scan();
  }
  return comments;
}
