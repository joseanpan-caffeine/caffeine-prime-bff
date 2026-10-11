import { ItemRecurrence } from '../contracts/api';

export interface RecurrenceItem {
  id: string;
  recurrence: ItemRecurrence;
}

/**
 * Regra dos 60 dias (Prime API §4.6): pelo menos um item precisa ser "normal" (recurrence null),
 * ou seja, nunca todos os itens em on/off. Vale na criação, na edição de recorrência e no preview.
 */
export class RecurrenceRules {
  /** Verdadeiro quando a lista é válida (há ao menos um item com recurrence null). */
  static isValid(items: Array<{ recurrence?: ItemRecurrence }>): boolean {
    if (items.length === 0) return false;
    return items.some((i) => (i.recurrence ?? null) === null);
  }

  /**
   * Simula a troca de recorrência de um item e diz se o resultado continua válido.
   */
  static canChange(items: RecurrenceItem[], itemId: string, next: ItemRecurrence): boolean {
    const exists = items.some((i) => i.id === itemId);
    if (!exists) return false;
    const after = items.map((i) => (i.id === itemId ? { ...i, recurrence: next } : i));
    return RecurrenceRules.isValid(after);
  }

  /** Próxima posição do ciclo on/off após um ciclo pago (on → off → on…). */
  static toggle(recurrence: ItemRecurrence): ItemRecurrence {
    if (recurrence === 'on') return 'off';
    if (recurrence === 'off') return 'on';
    return null;
  }
}
