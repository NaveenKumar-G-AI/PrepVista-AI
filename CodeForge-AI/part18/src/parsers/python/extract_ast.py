"""
CodeForge Quality Engine — Python AST extractor.

Reads student source from stdin (never from argv, never via a shell string — this
avoids any shell/argument injection from untrusted source) and emits the normalized
IR (see src/parsers/ir.ts) as a single line of JSON on stdout.

This script only PARSES source with the standard library `ast` module. It never
executes, imports, or evaluates the student's code.
"""

import ast
import io
import json
import sys
import tokenize


def block_loc(stmts, fallback_line):
    if not stmts:
        return {"startLine": fallback_line, "endLine": fallback_line}
    return {
        "startLine": stmts[0].lineno,
        "endLine": getattr(stmts[-1], "end_lineno", stmts[-1].lineno),
    }


def loc(node):
    return {
        "startLine": getattr(node, "lineno", 1),
        "endLine": getattr(node, "end_lineno", getattr(node, "lineno", 1)),
        "startCol": getattr(node, "col_offset", None),
        "endCol": getattr(node, "end_col_offset", None),
    }


def const_kind(value):
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if value is None:
        return "none"
    return "other"


class Converter:
    def convert_body(self, stmts):
        out = []
        for s in stmts:
            c = self.convert(s)
            if c is not None:
                out.append(c)
        return out

    def convert(self, node):
        method = getattr(self, "visit_" + type(node).__name__, None)
        if method:
            return method(node)
        return None  # unknown/unsupported construct: safely skipped, never fabricated

    def visit_Module(self, node):
        return {"kind": "Program", "children": self.convert_body(node.body), "loc": {"startLine": 1, "endLine": (node.body[-1].end_lineno if node.body else 1)}}

    def visit_FunctionDef(self, node):
        return self._function(node, is_async=False)

    def visit_AsyncFunctionDef(self, node):
        return self._function(node, is_async=True)

    def _function(self, node, is_async):
        params = []
        args = node.args
        for a in list(args.posonlyargs) + list(args.args):
            params.append({"kind": "Param", "name": a.arg, "children": [], "loc": loc(a)})
        if args.vararg:
            params.append({"kind": "Param", "name": "*" + args.vararg.arg, "children": [], "loc": loc(args.vararg)})
        for a in args.kwonlyargs:
            params.append({"kind": "Param", "name": a.arg, "children": [], "loc": loc(a)})
        if args.kwarg:
            params.append({"kind": "Param", "name": "**" + args.kwarg.arg, "children": [], "loc": loc(args.kwarg)})

        has_docstring = (
            len(node.body) > 0
            and isinstance(node.body[0], ast.Expr)
            and isinstance(getattr(node.body[0], "value", None), ast.Constant)
            and isinstance(node.body[0].value.value, str)
        )

        block = {"kind": "Block", "children": self.convert_body(node.body), "loc": block_loc(node.body, node.lineno)}

        return {
            "kind": "FunctionDecl",
            "name": node.name,
            "children": params + [block],
            "loc": loc(node),
            "meta": {"isAsync": is_async, "paramCount": len(params), "hasDocstring": has_docstring},
        }

    def visit_ClassDef(self, node):
        return {"kind": "ClassDecl", "name": node.name, "children": self.convert_body(node.body), "loc": loc(node)}

    def visit_If(self, node):
        body = {"kind": "Block", "children": self.convert_body(node.body), "loc": block_loc(node.body, node.lineno)}
        children = [body]
        if node.orelse:
            children.append({"kind": "Block", "children": self.convert_body(node.orelse), "loc": block_loc(node.orelse, node.lineno)})
        return {"kind": "If", "children": children, "loc": loc(node), "meta": {"hasElse": bool(node.orelse)}}

    def visit_For(self, node):
        body = {"kind": "Block", "children": self.convert_body(node.body), "loc": block_loc(node.body, node.lineno)}
        return {"kind": "For", "children": [body], "loc": loc(node)}

    def visit_While(self, node):
        body = {"kind": "Block", "children": self.convert_body(node.body), "loc": block_loc(node.body, node.lineno)}
        return {"kind": "While", "children": [body], "loc": loc(node)}

    def visit_Try(self, node):
        body = {"kind": "Block", "children": self.convert_body(node.body), "loc": block_loc(node.body, node.lineno)}
        handlers = []
        for h in node.handlers:
            h_body = self.convert_body(h.body)
            is_pass_only = len(h.body) == 1 and isinstance(h.body[0], ast.Pass)
            is_trivial = len(h.body) == 1 and isinstance(h.body[0], ast.Expr) and isinstance(getattr(h.body[0], "value", None), ast.Constant)
            handlers.append({
                "kind": "Catch",
                "children": h_body,
                "loc": loc(h),
                "meta": {
                    "exceptionType": self._name_of(h.type) if h.type else None,
                    "isBare": h.type is None,
                    "isEmptyOrTrivial": is_pass_only or is_trivial or len(h.body) == 0,
                },
            })
        return {"kind": "Try", "children": [body] + handlers, "loc": loc(node)}

    def visit_With(self, node):
        body = {"kind": "Block", "children": self.convert_body(node.body), "loc": block_loc(node.body, node.lineno)}
        return {"kind": "With", "children": [body], "loc": loc(node)}

    def visit_Return(self, node):
        val = self.convert(node.value) if node.value is not None else None
        return {"kind": "Return", "children": [val] if val else [], "loc": loc(node)}

    def visit_Raise(self, node):
        return {"kind": "Throw", "children": [], "loc": loc(node)}

    def visit_Break(self, node):
        return {"kind": "Break", "children": [], "loc": loc(node)}

    def visit_Continue(self, node):
        return {"kind": "Continue", "children": [], "loc": loc(node)}

    def visit_Pass(self, node):
        return None

    def visit_Expr(self, node):
        val = self.convert(node.value)
        return {"kind": "ExpressionStmt", "children": [val] if val else [], "loc": loc(node)}

    def visit_Call(self, node):
        callee = self._name_of(node.func)
        args = [a for a in (self.convert(x) for x in node.args) if a is not None]
        return {"kind": "Call", "name": callee, "children": args, "loc": loc(node)}

    def visit_Assign(self, node):
        targets = [self._name_of(t) for t in node.targets]
        targets = [t for t in targets if t]
        val = self.convert(node.value)
        return {"kind": "Assignment", "name": ",".join(targets), "children": [val] if val else [], "loc": loc(node)}

    def visit_AugAssign(self, node):
        val = self.convert(node.value)
        return {"kind": "AugAssignment", "name": self._name_of(node.target), "operator": type(node.op).__name__, "children": [val] if val else [], "loc": loc(node)}

    def visit_AnnAssign(self, node):
        val = self.convert(node.value) if node.value is not None else None
        return {"kind": "VariableDecl", "name": self._name_of(node.target), "children": [val] if val else [], "loc": loc(node)}

    def visit_BinOp(self, node):
        children = [c for c in (self.convert(node.left), self.convert(node.right)) if c]
        return {"kind": "BinaryExpr", "operator": type(node.op).__name__, "children": children, "loc": loc(node)}

    def visit_BoolOp(self, node):
        children = [c for c in (self.convert(v) for v in node.values) if c]
        return {"kind": "BoolOp", "operator": type(node.op).__name__, "children": children, "loc": loc(node)}

    def visit_UnaryOp(self, node):
        operand = self.convert(node.operand)
        return {"kind": "UnaryExpr", "operator": type(node.op).__name__, "children": [operand] if operand else [], "loc": loc(node)}

    def visit_Compare(self, node):
        children = [c for c in ([self.convert(node.left)] + [self.convert(x) for x in node.comparators]) if c]
        ops = ",".join(type(o).__name__ for o in node.ops)
        return {"kind": "BinaryExpr", "operator": ops, "children": children, "loc": loc(node)}

    def visit_Constant(self, node):
        kind = const_kind(node.value)
        if kind == "other":
            return None
        return {"kind": "Literal", "value": node.value, "meta": {"literalType": kind}, "children": [], "loc": loc(node)}

    def visit_Name(self, node):
        return {"kind": "Identifier", "name": node.id, "children": [], "loc": loc(node)}

    def visit_Attribute(self, node):
        full = self._name_of(node)
        return {"kind": "Identifier", "name": full, "children": [], "loc": loc(node)}

    def visit_Import(self, node):
        names = [{"kind": "ImportName", "name": a.name, "children": [], "loc": loc(node)} for a in node.names]
        return {"kind": "Import", "children": names, "loc": loc(node)}

    def visit_ImportFrom(self, node):
        names = [{"kind": "ImportName", "name": a.name, "children": [], "loc": loc(node)} for a in node.names]
        return {"kind": "Import", "name": node.module, "children": names, "loc": loc(node)}

    def _name_of(self, node):
        if node is None:
            return None
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            base = self._name_of(node.value)
            return (base + "." + node.attr) if base else node.attr
        if isinstance(node, ast.Call):
            return self._name_of(node.func)
        if isinstance(node, ast.Tuple):
            parts = [self._name_of(e) for e in node.elts]
            return ",".join(p for p in parts if p)
        return None


def extract_comments(source):
    comments = []
    try:
        tokens = tokenize.generate_tokens(io.StringIO(source).readline)
        for tok in tokens:
            if tok.type == tokenize.COMMENT:
                comments.append({
                    "kind": "Comment",
                    "value": tok.string,
                    "children": [],
                    "loc": {"startLine": tok.start[0], "endLine": tok.end[0]},
                })
    except Exception:
        # Comment extraction is best-effort evidence gathering, not a structural fact.
        # A tokenizer hiccup on unusual source must not take down the whole analysis.
        pass
    return comments


def main():
    source = sys.stdin.read()
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        print(json.dumps({"error": "SyntaxError", "message": str(e), "line": e.lineno}))
        return

    converter = Converter()
    root = converter.visit_Module(tree)
    comments = extract_comments(source)
    print(json.dumps({"root": root, "comments": comments, "sourceLines": source.splitlines()}))


if __name__ == "__main__":
    main()
