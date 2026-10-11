import { RecurrenceRules } from './recurrence-rules';

describe('RecurrenceRules', () => {
  const items = [
    { id: 'a', recurrence: null },
    { id: 'b', recurrence: 'on' as const },
  ];

  it('lista com um item normal é válida', () => {
    expect(RecurrenceRules.isValid(items)).toBe(true);
  });
  it('recurrence omitido conta como normal', () => {
    expect(RecurrenceRules.isValid([{}, { recurrence: 'on' }])).toBe(true);
  });
  it('todos on/off é inválido; lista vazia é inválida', () => {
    expect(RecurrenceRules.isValid([{ recurrence: 'on' }, { recurrence: 'off' }])).toBe(false);
    expect(RecurrenceRules.isValid([])).toBe(false);
  });
  it('não permite tornar o último item normal em 60 dias', () => {
    expect(RecurrenceRules.canChange(items, 'a', 'on')).toBe(false);
    expect(RecurrenceRules.canChange(items, 'a', 'off')).toBe(false);
  });
  it('permite voltar um item para normal ou alternar item quando há outro normal', () => {
    expect(RecurrenceRules.canChange(items, 'b', null)).toBe(true);
    expect(RecurrenceRules.canChange(items, 'b', 'off')).toBe(true);
  });
  it('item inexistente não pode ser alterado', () => {
    expect(RecurrenceRules.canChange(items, 'zzz', null)).toBe(false);
  });
  it('toggle alterna on/off e mantém null', () => {
    expect(RecurrenceRules.toggle('on')).toBe('off');
    expect(RecurrenceRules.toggle('off')).toBe('on');
    expect(RecurrenceRules.toggle(null)).toBeNull();
  });
});
