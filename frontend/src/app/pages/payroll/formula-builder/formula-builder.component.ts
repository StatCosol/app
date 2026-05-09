/**
 * No-code Visual Formula Builder.
 *
 * Authors a structured `FormulaNode` tree which the backend serializes
 * to the engine's text grammar. Designed to be embedded inside a modal.
 *
 * Supported node types map 1:1 to formula-serializer.ts.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type FormulaNode =
  | { type: 'FIXED'; value: number | null }
  | { type: 'VARIABLE'; name: string }
  | { type: 'PERCENT'; base: string; value: number | null }
  | { type: 'OP'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode }
  | { type: 'MAX' | 'MIN'; values: FormulaNode[] }
  | { type: 'BALANCE'; total: string; subtract: string[] }
  | {
      type: 'IF';
      condition: {
        left: FormulaNode;
        op: '>' | '<' | '>=' | '<=' | '==' | '!=';
        right: FormulaNode;
      };
      then: FormulaNode;
      else: FormulaNode;
    }
  | { type: 'RAW'; expr: string };

@Component({
  selector: 'app-formula-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./formula-builder.component.scss'],
  templateUrl: './formula-builder.component.html',
})
export class FormulaBuilderComponent implements OnChanges {
  /** Variables the user can pick (component codes + GROSS, BASIC, MIN_WAGE, etc.) */
  @Input() variables: string[] = [
    'GROSS', 'BASIC', 'HRA', 'CONVEYANCE', 'SPECIAL',
    'CTC', 'PF_WAGE', 'ESI_WAGE', 'MIN_WAGE',
    'WORKED_DAYS', 'PAYABLE_DAYS', 'LOP_DAYS', 'PRESENT_DAYS', 'OT_HOURS',
  ];
  @Input() value: FormulaNode | null = null;
  @Output() valueChange = new EventEmitter<FormulaNode | null>();

  readonly nodeTypes: Array<{ key: FormulaNode['type']; label: string }> = [
    { key: 'FIXED',    label: 'Fixed Amount' },
    { key: 'VARIABLE', label: 'Variable' },
    { key: 'PERCENT',  label: '% of …' },
    { key: 'OP',       label: 'Arithmetic ( + − × ÷ )' },
    { key: 'MAX',      label: 'Greater Of (MAX)' },
    { key: 'MIN',      label: 'Lower Of (MIN)' },
    { key: 'BALANCE',  label: 'Balance (Total − parts)' },
    { key: 'IF',       label: 'IF / THEN / ELSE' },
    { key: 'RAW',      label: 'Raw expression (advanced)' },
  ];
  readonly compareOps = ['>', '<', '>=', '<=', '==', '!='] as const;
  readonly arithOps = ['+', '-', '*', '/'] as const;

  ngOnChanges(c: SimpleChanges): void {
    if (c['value'] && !this.value) {
      this.value = this.blankNode('FIXED');
    }
  }

  blankNode(type: FormulaNode['type']): FormulaNode {
    switch (type) {
      case 'FIXED':    return { type: 'FIXED', value: 0 };
      case 'VARIABLE': return { type: 'VARIABLE', name: this.variables[0] || 'GROSS' };
      case 'PERCENT':  return { type: 'PERCENT', base: 'GROSS', value: 50 };
      case 'OP':       return { type: 'OP', op: '+', left: { type: 'FIXED', value: 0 }, right: { type: 'FIXED', value: 0 } };
      case 'MAX':      return { type: 'MAX', values: [this.blankNode('PERCENT'), this.blankNode('VARIABLE')] };
      case 'MIN':      return { type: 'MIN', values: [this.blankNode('VARIABLE'), this.blankNode('FIXED')] };
      case 'BALANCE':  return { type: 'BALANCE', total: 'GROSS', subtract: ['BASIC', 'HRA'] };
      case 'IF':       return {
        type: 'IF',
        condition: {
          left:  { type: 'VARIABLE', name: 'GROSS' },
          op: '>',
          right: { type: 'FIXED', value: 30000 },
        },
        then: { type: 'PERCENT', base: 'BASIC', value: 50 },
        else: { type: 'FIXED', value: 0 },
      };
      case 'RAW':      return { type: 'RAW', expr: '' };
    }
  }

  // Track-by helper for *ngFor over array elements (so [(ngModel)] is stable)
  trackByIndex = (_i: number, _item: unknown) => _i;

  changeType(holder: { current: FormulaNode }, newType: FormulaNode['type']): void {
    holder.current = this.blankNode(newType);
    this.emit();
  }

  emit(): void {
    this.valueChange.emit(this.value);
  }

  // Helpers used by the template -------------------------------------------

  addValue(node: { values: FormulaNode[] }): void {
    node.values.push(this.blankNode('FIXED'));
    this.emit();
  }
  removeValue(node: { values: FormulaNode[] }, idx: number): void {
    if (node.values.length <= 2) return;
    node.values.splice(idx, 1);
    this.emit();
  }
  addSubtract(node: { subtract: string[] }): void {
    node.subtract.push(this.variables[0] || 'BASIC');
    this.emit();
  }
  removeSubtract(node: { subtract: string[] }, idx: number): void {
    if (node.subtract.length <= 1) return;
    node.subtract.splice(idx, 1);
    this.emit();
  }

  // Live preview ------------------------------------------------------------

  previewText(node: FormulaNode | null = this.value): string {
    if (!node) return '';
    try {
      return this.serialize(node);
    } catch (err) {
      return `(invalid: ${(err as Error).message})`;
    }
  }

  /** Mirror of backend formula-serializer.ts so users see the engine-ready expression live. */
  private serialize(node: FormulaNode): string {
    switch (node.type) {
      case 'FIXED':
        return node.value == null ? '0' : String(node.value);
      case 'VARIABLE':
        return node.name || '?';
      case 'PERCENT':
        return `(${node.base} * ${node.value ?? 0} / 100)`;
      case 'OP':
        return `(${this.serialize(node.left)} ${node.op} ${this.serialize(node.right)})`;
      case 'MAX':
      case 'MIN':
        return `${node.type}(${node.values.map((v) => this.serialize(v)).join(', ')})`;
      case 'BALANCE':
        return `(${node.total} - ${node.subtract.join(' - ')})`;
      case 'IF':
        return `IF(${this.serialize(node.condition.left)} ${node.condition.op} ${this.serialize(node.condition.right)}, ${this.serialize(node.then)}, ${this.serialize(node.else)})`;
      case 'RAW':
        return node.expr || '';
    }
  }
}
