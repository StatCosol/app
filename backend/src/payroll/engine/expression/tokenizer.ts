// ──────────────────────────────────────────────────────────────────────────────
// Tokenizer for the Paydek formula expression language.
//
// Converts a raw formula string into a flat array of typed tokens that the
// parser can consume via simple index-based look-ahead.
// ──────────────────────────────────────────────────────────────────────────────

export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENT'
  | 'OP'
  | 'COMP'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
}

/**
 * Tokenize a formula string into an array of tokens.
 *
 * Supported token types:
 *  - NUMBER:  integer or decimal  (e.g. 123, 0.5, 15000.00)
 *  - STRING:  double-quoted text  (e.g. "BASIC_CAP")
 *  - IDENT:   uppercase variable / function names  (e.g. GROSS, IF, PARAM)
 *  - OP:      arithmetic operators  + - * /
 *  - COMP:    comparison operators  < <= > >= == !=
 *  - LPAREN / RPAREN / COMMA
 *  - EOF:     end sentinel
 *
 * Whitespace is silently skipped.
 */
export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  const len = formula.length;

  while (pos < len) {
    const ch = formula[pos];

    // ── Skip whitespace ─────────────────────────────────────────────────
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      pos++;
      continue;
    }

    // ── Number literal ──────────────────────────────────────────────────
    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (pos < len && formula[pos] >= '0' && formula[pos] <= '9') {
        num += formula[pos++];
      }
      if (pos < len && formula[pos] === '.') {
        num += formula[pos++];
        while (pos < len && formula[pos] >= '0' && formula[pos] <= '9') {
          num += formula[pos++];
        }
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // ── String literal (double-quoted) ──────────────────────────────────
    if (ch === '"') {
      let str = '';
      pos++; // skip opening quote
      while (pos < len && formula[pos] !== '"') {
        str += formula[pos++];
      }
      if (pos >= len) {
        throw new Error(
          `Unterminated string literal in formula at position ${pos}`,
        );
      }
      pos++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // ── Identifier (variable or function name) ──────────────────────────
    // Starts with A-Z or _, followed by A-Z, 0-9, _
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
      let ident = '';
      while (
        pos < len &&
        ((formula[pos] >= 'A' && formula[pos] <= 'Z') ||
          (formula[pos] >= 'a' && formula[pos] <= 'z') ||
          (formula[pos] >= '0' && formula[pos] <= '9') ||
          formula[pos] === '_')
      ) {
        ident += formula[pos++];
      }
      tokens.push({ type: 'IDENT', value: ident });
      continue;
    }

    // ── Comparison operators (multi-char first) ─────────────────────────
    if (ch === '<') {
      if (pos + 1 < len && formula[pos + 1] === '=') {
        tokens.push({ type: 'COMP', value: '<=' });
        pos += 2;
      } else {
        tokens.push({ type: 'COMP', value: '<' });
        pos++;
      }
      continue;
    }
    if (ch === '>') {
      if (pos + 1 < len && formula[pos + 1] === '=') {
        tokens.push({ type: 'COMP', value: '>=' });
        pos += 2;
      } else {
        tokens.push({ type: 'COMP', value: '>' });
        pos++;
      }
      continue;
    }
    if (ch === '=' && pos + 1 < len && formula[pos + 1] === '=') {
      tokens.push({ type: 'COMP', value: '==' });
      pos += 2;
      continue;
    }
    if (ch === '!' && pos + 1 < len && formula[pos + 1] === '=') {
      tokens.push({ type: 'COMP', value: '!=' });
      pos += 2;
      continue;
    }

    // ── Arithmetic operators ────────────────────────────────────────────
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'OP', value: ch });
      pos++;
      continue;
    }

    // ── Parentheses & comma ─────────────────────────────────────────────
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      pos++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      pos++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      pos++;
      continue;
    }

    throw new Error(
      `Unexpected character '${ch}' at position ${pos} in formula`,
    );
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}
