import { addMonths, startOfDayInSaoPaulo, toSaoPauloIso } from './timezone';

describe('timezone', () => {
  it('00:00 em São Paulo é 03:00Z', () => {
    expect(startOfDayInSaoPaulo(new Date('2026-10-20T12:00:00.000Z')).toISOString()).toBe(
      '2026-10-20T03:00:00.000Z',
    );
  });
  it('instante antes das 03:00Z pertence ao dia civil anterior em SP', () => {
    expect(startOfDayInSaoPaulo(new Date('2026-10-20T02:30:00.000Z')).toISOString()).toBe(
      '2026-10-19T03:00:00.000Z',
    );
  });
  it('formata com offset -03:00', () => {
    expect(toSaoPauloIso(new Date('2026-10-22T12:00:00.000Z'))).toBe('2026-10-22T09:00:00-03:00');
  });
  it('addMonths respeita fim de mês', () => {
    expect(addMonths(new Date('2026-01-31T12:00:00.000Z'), 1).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });
});
