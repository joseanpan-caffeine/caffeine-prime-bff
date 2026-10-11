import { HealthDailySample } from '../contracts/api';
import { buildHealthSuggestions } from './health-suggestions';

const s = (metric: HealthDailySample['metric'], value: number): HealthDailySample => ({
  date: '2026-10-11',
  metric,
  value,
});
const box = ['supercoffee-3-0-original-380g', 'morning-shot', 'whey-isolado-chocolate-900g'];
const ids = (list: ReturnType<typeof buildHealthSuggestions>) => list.map((x) => x.id);

describe('health-suggestions (motor de regras)', () => {
  it('treino hoje + Morning Shot na caixa → dica de pré-treino (e whey pós-treino)', () => {
    const out = buildHealthSuggestions({
      today: [s('workouts', 1)],
      boxHandles: box,
      localHour: 10,
    });
    expect(ids(out)).toEqual(['workout-morning-shot', 'workout-whey']);
    expect(out[0]).toMatchObject({ productHandle: 'morning-shot', deepLink: 'app://routine' });
  });

  it('treino hoje sem Morning Shot na caixa → nenhuma dica de shot', () => {
    const out = buildHealthSuggestions({
      today: [s('workouts', 1)],
      boxHandles: ['supercoffee-3-0-original-380g'],
      localHour: 10,
    });
    expect(ids(out)).toEqual([]);
  });

  it('item já marcado hoje não gera a dica de novo', () => {
    const out = buildHealthSuggestions({
      today: [s('workouts', 1)],
      boxHandles: box,
      localHour: 10,
      doneToday: ['morning-shot', 'whey-isolado-chocolate-900g'],
    });
    expect(ids(out)).toEqual([]);
  });

  it('poucos passos só vira sugestão à tarde', () => {
    expect(
      ids(buildHealthSuggestions({ today: [s('steps', 1200)], boxHandles: box, localHour: 9 })),
    ).toEqual([]);
    expect(
      ids(buildHealthSuggestions({ today: [s('steps', 1200)], boxHandles: box, localHour: 15 })),
    ).toEqual(['low-steps']);
    expect(
      ids(buildHealthSuggestions({ today: [s('steps', 8000)], boxHandles: box, localHour: 15 })),
    ).toEqual([]);
  });

  it('sono < 6h → corte de cafeína e whey à noite; usa o sono de ontem quando hoje não tem', () => {
    const out = buildHealthSuggestions({
      today: [],
      yesterday: [{ ...s('sleep_minutes', 300), date: '2026-10-10' }],
      boxHandles: box,
      localHour: 8,
    });
    expect(ids(out)).toEqual(['short-sleep-caffeine-cutoff', 'short-sleep-evening-whey']);
    expect(out[0].body).toMatch(/16h/);
  });

  it('nunca fala de dose acima do rótulo nem de diagnóstico', () => {
    const out = buildHealthSuggestions({
      today: [s('workouts', 2), s('steps', 500), s('sleep_minutes', 200), s('water_ml', 300)],
      boxHandles: [...box, 'creatine-300g'],
      localHour: 18,
    });
    for (const sug of out) {
      expect(sug.body).not.toMatch(/dobr|duas doses|diagn|sintoma|trat/i);
    }
    expect(ids(out)).toContain('low-water');
  });
});
