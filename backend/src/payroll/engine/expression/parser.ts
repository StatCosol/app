// ──────────────────────────────────────────────────────────────────────────────
// Recursive-descent parser for the Paydek formula expression language.
//
// Grammar (operator precedence, lowest to highest):
//
//   expression     → comparison
//   comparison     → additive ( ( '<' | '<=' | '>' | '>=' | '==' | '!=' ) additive )?
//   additive       → multiplicative ( ( '+' | '-' ) multiplicative )*
//   multiplicative → unary ( ( '*' | '/' ) unary )*
//   unary          → '-' unary | primary
//   primary        → NUMBER
//                   | STRING
//                   | IDENT '(' argList? ')'    ← function call
//                   | IDENT                      ← variable reference
//                   | '(' expression ')'
//
//   argList        → expression ( ',' expression )*
// ──────────────────────────────────────────────────────────────────────────────

import { ASTNode } from './ast';
import { Token } from './tokenizer';

/** Whitelisted built-in functions and their accepted arity ranges. */
const BUILTIN_FUNCTIONS: Record<string, { minArgs: number; maxArgs: number }> =
  {
    IF: { minArgs: 3, maxArgs: 3 },
    MIN: { minArgs: 2, maxArgs: 2 },
    MAX: { minArgs: 2, maxArgs: 2 },
    ROUND: { minArgs: 1, maxArgs: 2 },
    PARAM: { minArgs: 1, maxArgs: 1 },
    EARNINGS_SUM: { minArgs: 0, maxArgs: 0 },
  };

/**
 * Parse an array of tokens into an AST.
 * Throws on syntax errors with a descriptive message.
 */
export function parse(tokens: Token[]): ASTNode {
  let pos = 0;

  // ── Helpers ─────────────────────────────────────────────────────────────

  function peek(): Token {
    return tokens[pos];
  }

  function advance(): Token {
    return tokens[pos++];
  }

  function expect(type: string, value?: string): Token {
    const tok = peek();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new Error(
        `Expected ${type}${value ? ` '${value}'` : ''} but got ${tok.type} '${tok.value}' at token ${pos}`,
      );
    }
    return advance();
  }

  // ── Grammar rules ───────────────────────────────────────────────────────

  function expression(): ASTNode {
    return comparison();
  }

  function comparison(): ASTNode {
    let left = additive();

    const tok = peek();
    if (tok.type === 'COMP') {
      const op = advance().value as '<' | '<=' | '>' | '>=' | '==' | '!=';
      const right = additive();
      left = { type: 'comparison', op, left, right };
    }

    return left;
  }

  function additive(): ASTNode {
    let left = multiplicative();

    while (
      peek().type === 'OP' &&
      (peek().value === '+' || peek().value === '-')
    ) {
      const op = advance().value as '+' | '-';
      const right = multiplicative();
      left = { type: 'binary', op, left, right };
    }

    return left;
  }

  function multiplicative(): ASTNode {
    let left = unary();

    while (
      peek().type === 'OP' &&
      (peek().value === '*' || peek().value === '/')
    ) {
      const op = advance().value as '*' | '/';
      const right = unary();
      left = { type: 'binary', op, left, right };
    }

    return left;
  }

  function unary(): ASTNode {
    if (peek().type === 'OP' && peek().value === '-') {
      advance();
      const operand = unary();
      return { type: 'unary', op: '-', operand };
    }
    return primary();
  }

  function primary(): ASTNode {
    const tok = peek();

    // ── Number literal ────────────────────────────────────────────────
    if (tok.type === 'NUMBER') {
      advance();
      return { type: 'number', value: parseFloat(tok.value) };
    }

    // ── String literal ────────────────────────────────────────────────
    if (tok.type === 'STRING') {
      advance();
      return { type: 'string', value: tok.value };
    }

    // ── Identifier → function call or variable ────────────────────────
    if (tok.type === 'IDENT') {
      const name = advance().value;

      // If followed by '(' it is a function call
      if (peek().type === 'LPAREN') {
        advance(); // consume '('
        const args: ASTNode[] = [];

        // Parse argument list (may be empty)
        if (peek().type !== 'RPAREN') {
          args.push(expression());
          while (peek().type === 'COMMA') {
            advance(); // consume ','
            args.push(expression());
          }
        }

        expect('RPAREN');

        // Validate against whitelist
        const upperName = name.toUpperCase();
        const spec = BUILTIN_FUNCTIONS[upperName];
        if (!spec) {
          throw new Error(`Unknown function '${name}'`);
        }
        if (args.length < spec.minArgs || args.length > spec.maxArgs) {
          throw new Error(
            `Function ${upperName} expects ${spec.minArgs === spec.maxArgs ? spec.minArgs : `${spec.minArgs}-${spec.maxArgs}`} argument(s) but got ${args.length}`,
          );
        }

        return { type: 'function', name: upperName, args };
      }

      // Otherwise it is a variable reference
      return { type: 'variable', name };
    }

    // ── Grouped expression ────────────────────────────────────────────
    if (tok.type === 'LPAREN') {
      advance(); // consume '('
      const node = expression();
      expect('RPAREN');
      return node;
    }

    throw new Error(
      `Unexpected token ${tok.type} '${tok.value}' at token ${pos}`,
    );
  }

  // ── Entry point ─────────────────────────────────────────────────────────

  const ast = expression();

  // Ensure we consumed all tokens (except the trailing EOF)
  if (peek().type !== 'EOF') {
    throw new Error(
      `Unexpected token ${peek().type} '${peek().value}' at token ${pos} — expected end of expression`,
    );
  }

  return ast;
}
