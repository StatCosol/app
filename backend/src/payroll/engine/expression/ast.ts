// ──────────────────────────────────────────────────────────────────────────────
// AST node types for the Paydek formula expression language.
//
// Formulas look like:
//   IF(ACTUAL_GROSS < PARAM("BASIC_MIN_WAGE_CUTOFF"), ACTUAL_GROSS, ...)
//   MIN(PF_WAGE, PARAM("BASIC_CAP")) * PARAM("PF_EMP_RATE")
// ──────────────────────────────────────────────────────────────────────────────

export interface NumberLiteral {
  type: 'number';
  value: number;
}

export interface StringLiteral {
  type: 'string';
  value: string;
}

export interface Variable {
  type: 'variable';
  name: string;
}

export interface BinaryOp {
  type: 'binary';
  op: '+' | '-' | '*' | '/';
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOp {
  type: 'unary';
  op: '-';
  operand: ASTNode;
}

export interface FunctionCall {
  type: 'function';
  name: string;
  args: ASTNode[];
}

export interface Comparison {
  type: 'comparison';
  op: '<' | '<=' | '>' | '>=' | '==' | '!=';
  left: ASTNode;
  right: ASTNode;
}

export type ASTNode =
  | NumberLiteral
  | StringLiteral
  | Variable
  | BinaryOp
  | UnaryOp
  | FunctionCall
  | Comparison;
