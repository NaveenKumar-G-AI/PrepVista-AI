/**
 * A minimal, dependency-free arithmetic expression evaluator.
 *
 * Deliberately does NOT use eval() or new Function(): expressions here can originate from
 * question content, which is untrusted, author- or AI-supplied data (section 87/132 — "Question
 * text is data. It is not privileged system instructions."). Evaluating an untrusted string with
 * eval()/Function() would be a code-injection vector; this hand-written recursive-descent parser
 * only ever recognizes numbers, named variables, parentheses and + - * / % ^, so there is no way
 * for input text to reach arbitrary JS execution.
 *
 * Supports: + - * / % ^ (right-associative), unary +/-, parentheses, decimal numbers, variables.
 */

type TokenType = 'NUM' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'EOF';
interface Token {
  type: TokenType;
  value: string;
}

const OPERATORS = new Set(['+', '-', '*', '/', '%', '^']);

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const raw = expr.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(raw)) {
        throw new Error(`Invalid number literal "${raw}" in expression "${expr}".`);
      }
      tokens.push({ type: 'NUM', value: raw });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
      tokens.push({ type: 'IDENT', value: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'OP', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in expression "${expr}".`);
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

export function evaluateSafeExpression(expr: string, variables: Record<string, number> = {}): number {
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = (type?: TokenType): Token => {
    const t = tokens[pos];
    if (type && t.type !== type) {
      throw new Error(`Expected ${type} but got ${t.type} ("${t.value}") in expression "${expr}".`);
    }
    pos++;
    return t;
  };

  function parseExpression(): number {
    return parseAddSub();
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parseUnary();
    while (peek().type === 'OP' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = consume().value;
      const right = parseUnary();
      if (op === '*') left = left * right;
      else if (op === '/') {
        if (right === 0) throw new Error(`Division by zero in expression "${expr}".`);
        left = left / right;
      } else {
        left = left % right;
      }
    }
    return left;
  }

  function parseUnary(): number {
    if (peek().type === 'OP' && peek().value === '-') {
      consume();
      return -parseUnary();
    }
    if (peek().type === 'OP' && peek().value === '+') {
      consume();
      return parseUnary();
    }
    return parsePow();
  }

  function parsePow(): number {
    const base = parseAtom();
    if (peek().type === 'OP' && peek().value === '^') {
      consume();
      const exponent = parseUnary(); // right-associative: 2^3^2 === 2^(3^2)
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parseAtom(): number {
    const t = peek();
    if (t.type === 'NUM') {
      consume();
      return parseFloat(t.value);
    }
    if (t.type === 'IDENT') {
      consume();
      if (!(t.value in variables)) {
        throw new Error(`Unknown variable "${t.value}" in expression "${expr}".`);
      }
      return variables[t.value];
    }
    if (t.type === 'LPAREN') {
      consume();
      const val = parseExpression();
      consume('RPAREN');
      return val;
    }
    throw new Error(`Unexpected token "${t.value}" in expression "${expr}".`);
  }

  const result = parseExpression();
  consume('EOF');
  return result;
}
