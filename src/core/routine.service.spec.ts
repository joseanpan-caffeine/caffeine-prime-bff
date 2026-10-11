import { Bill, CatalogProduct, CheckIn, ProductItem, RoutinePlan } from '../contracts/api';
import {
  buildDefaultPlan,
  computeRoutineSummary,
  computeStockForecast,
  computeStreaks,
  defaultSlotFor,
  startOfWeek,
} from './routine.service';

const plan = (ids: string[], timezone = 'America/Sao_Paulo', weeklyGoalDays = 5): RoutinePlan => ({
  timezone,
  weeklyGoalDays,
  items: ids.map((id) => ({
    id,
    productHandle: id,
    title: id,
    slot: 'morning',
    reminderEnabled: false,
    dosesPerDay: 1,
  })),
});

const ci = (routineItemId: string, date: string): CheckIn => ({
  id: `${routineItemId}-${date}`,
  routineItemId,
  date,
  doneAt: `${date}T12:00:00.000Z`,
  source: 'manual',
});

const doneMap = (checkIns: CheckIn[]) => {
  const m = new Map<string, Set<string>>();
  for (const c of checkIns) {
    if (!m.has(c.date)) m.set(c.date, new Set());
    m.get(c.date)!.add(c.routineItemId);
  }
  return m;
};

describe('routine core: streaks', () => {
  it('conta dias consecutivos completos terminando hoje', () => {
    const p = plan(['a']);
    const d = doneMap([ci('a', '2026-10-09'), ci('a', '2026-10-10'), ci('a', '2026-10-11')]);
    expect(computeStreaks(p, d, '2026-10-11')).toEqual({ current: 3, longest: 3 });
  });

  it('hoje ainda não feito não quebra a sequência (conta até ontem)', () => {
    const p = plan(['a']);
    const d = doneMap([ci('a', '2026-10-09'), ci('a', '2026-10-10')]);
    expect(computeStreaks(p, d, '2026-10-11').current).toBe(2);
  });

  it('buraco de um dia zera a sequência atual mas mantém a maior', () => {
    const p = plan(['a']);
    const d = doneMap([
      ci('a', '2026-10-01'),
      ci('a', '2026-10-02'),
      ci('a', '2026-10-03'),
      ci('a', '2026-10-05'), // 04 ficou sem
    ]);
    // hoje = 06 (não feito) → ontem 05 completo, 04 não → current 1; longest 3
    expect(computeStreaks(p, d, '2026-10-06')).toEqual({ current: 1, longest: 3 });
    // hoje = 07: ontem (06) não feito → current 0
    expect(computeStreaks(p, d, '2026-10-07').current).toBe(0);
  });

  it('dia só conta como completo quando todos os itens do plano foram marcados', () => {
    const p = plan(['a', 'b']);
    const d = doneMap([ci('a', '2026-10-10'), ci('b', '2026-10-10'), ci('a', '2026-10-11')]);
    const s = computeStreaks(p, d, '2026-10-11');
    expect(s.current).toBe(1); // 10 completo; 11 parcial não quebra
    expect(s.longest).toBe(1);
  });

  it('fuso do plano decide o "hoje": 01:00 em São Paulo ainda é 04:00 UTC do mesmo dia', () => {
    // 2026-10-12T02:30Z = 2026-10-11 23:30 em São Paulo (UTC-3)
    const now = new Date('2026-10-12T02:30:00.000Z');
    const p = plan(['a']);
    const summary = computeRoutineSummary({
      plan: p,
      checkIns: [ci('a', '2026-10-10'), ci('a', '2026-10-11')],
      now,
    });
    expect(summary.today.date).toBe('2026-10-11');
    expect(summary.today.completion).toBe(1);
    expect(summary.currentStreakDays).toBe(2);

    // Mesmo instante num plano em Lisboa (UTC+1): já é dia 12, hoje não feito, streak segue 2.
    const lisbon = computeRoutineSummary({
      plan: plan(['a'], 'Europe/Lisbon'),
      checkIns: [ci('a', '2026-10-10'), ci('a', '2026-10-11')],
      now,
    });
    expect(lisbon.today.date).toBe('2026-10-12');
    expect(lisbon.today.completion).toBe(0);
    expect(lisbon.currentStreakDays).toBe(2);
  });

  it('plano vazio: tudo zero e sem exceção', () => {
    const summary = computeRoutineSummary({
      plan: plan([]),
      checkIns: [],
      now: new Date('2026-10-11T15:00:00Z'),
    });
    expect(summary.currentStreakDays).toBe(0);
    expect(summary.longestStreakDays).toBe(0);
    expect(summary.today.completion).toBe(0);
    expect(summary.last28Days).toHaveLength(28);
  });
});

describe('routine core: semana, histórico e plano padrão', () => {
  it('startOfWeek devolve a segunda-feira', () => {
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05'); // domingo → segunda anterior
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-07')).toBe('2026-10-05');
  });

  it('weekCompletion = dias completos na semana / meta, limitado a 1', () => {
    const p = plan(['a'], 'America/Sao_Paulo', 2);
    const now = new Date('2026-10-08T15:00:00Z'); // quinta 08/10; semana começa 05/10
    const s = computeRoutineSummary({
      plan: p,
      checkIns: [
        ci('a', '2026-10-04'),
        ci('a', '2026-10-05'),
        ci('a', '2026-10-06'),
        ci('a', '2026-10-07'),
      ],
      now,
    });
    expect(s.weekCompletion).toBe(1); // 3 dias na semana ≥ meta 2
    const s2 = computeRoutineSummary({ plan: p, checkIns: [ci('a', '2026-10-06')], now });
    expect(s2.weekCompletion).toBe(0.5);
  });

  it('last28Days termina em hoje e tem 28 entradas ordenadas', () => {
    const s = computeRoutineSummary({
      plan: plan(['a']),
      checkIns: [ci('a', '2026-10-11')],
      now: new Date('2026-10-11T15:00:00Z'),
    });
    expect(s.last28Days).toHaveLength(28);
    expect(s.last28Days[27]).toEqual({ date: '2026-10-11', completion: 1 });
    expect(s.last28Days[0].date).toBe('2026-09-14');
  });

  it('slots padrão por tipo de produto', () => {
    expect(defaultSlotFor('supercoffee-3-0-original-380g')).toBe('morning');
    expect(defaultSlotFor('morning-shot')).toBe('pre_workout');
    expect(defaultSlotFor('whey-isolado-chocolate-900g')).toBe('evening');
    expect(defaultSlotFor('creatine-300g')).toBe('morning');
  });

  it('plano padrão: um item por produto da caixa, brinde fora, usageHint do catálogo', () => {
    const box: ProductItem[] = [
      item('supercoffee-3-0-original-380g', 2),
      item('morning-shot', 1),
      { ...item('copo-termico-prime', 1), isGift: true },
    ];
    const products: CatalogProduct[] = [
      product('supercoffee-3-0-380g', ['supercoffee-3-0-original-380g'], 25, 'Energia e foco'),
      product('morning-shot', [], 15, 'Pré-treino'),
    ];
    const p = buildDefaultPlan(box, products);
    expect(p.items.map((i) => i.productHandle)).toEqual([
      'supercoffee-3-0-original-380g',
      'morning-shot',
    ]);
    expect(p.items[0]).toMatchObject({
      slot: 'morning',
      usageHint: 'Energia e foco',
      reminderEnabled: false,
    });
    expect(p.items[1].slot).toBe('pre_workout');
    expect(p.timezone).toBe('America/Sao_Paulo');
  });
});

describe('routine core: previsão de estoque', () => {
  const products: CatalogProduct[] = [
    product('supercoffee-3-0-380g', ['supercoffee-3-0-original-380g'], 25),
    product('morning-shot', [], 15),
  ];
  const paidBill = (paidAt: string, items: ProductItem[]): Bill => ({
    id: 'bill-1',
    cycle: 3,
    status: 'paid',
    issuedAt: paidAt,
    dueAt: paidAt,
    paidAt,
    amount: { amount: 100, currency: 'BRL' },
    items,
  });

  it('doses = quantidade × dosesPerUnit menos check-ins desde a fatura; projeta pelo ritmo', () => {
    const p: RoutinePlan = {
      timezone: 'America/Sao_Paulo',
      weeklyGoalDays: 5,
      items: [
        {
          id: 'sc',
          productHandle: 'supercoffee-3-0-original-380g',
          title: 'SC',
          slot: 'morning',
          reminderEnabled: false,
          dosesPerDay: 1,
        },
        {
          id: 'ms',
          productHandle: 'morning-shot',
          title: 'MS',
          slot: 'pre_workout',
          reminderEnabled: false,
          dosesPerDay: 1,
        },
      ],
    };
    const now = new Date('2026-10-11T15:00:00Z');
    const bills = [
      paidBill('2026-10-01T12:00:00Z', [
        item('supercoffee-3-0-original-380g', 2),
        item('morning-shot', 1),
      ]),
    ];
    const checkIns = [
      ...['02', '03', '04', '05', '06', '07', '08', '09', '10', '11'].map((d) =>
        ci('sc', `2026-10-${d}`),
      ),
      ci('sc', '2026-09-30'), // antes da fatura: não conta
      ci('ms', '2026-10-05'),
    ];
    const forecast = computeStockForecast(
      p,
      checkIns,
      bills,
      products,
      now,
      '2026-10-23T12:00:00Z',
    );
    const sc = forecast.find((f) => f.productHandle === 'supercoffee-3-0-original-380g')!;
    expect(sc.dosesLeft).toBe(50 - 10);
    expect(sc.nextBoxAt).toBe('2026-10-23T12:00:00Z');
    // ritmo 10 doses / 10 dias = 1/dia → acaba em ~40 dias
    const days = (new Date(sc.runsOutAt!).getTime() - now.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(40);
    const ms = forecast.find((f) => f.productHandle === 'morning-shot')!;
    expect(ms.dosesLeft).toBe(14);
  });

  it('sem fatura paga ou sem dosesPerUnit não há previsão', () => {
    const p = plan(['x']);
    expect(computeStockForecast(p, [], [], products, new Date())).toEqual([]);
    const bills = [paidBill('2026-10-01T12:00:00Z', [item('produto-sem-dose', 1)])];
    expect(computeStockForecast(p, [], bills, products, new Date())).toEqual([]);
  });
});

function item(handle: string, quantity: number): ProductItem {
  return {
    id: `item-${handle}`,
    handle,
    title: handle,
    quantity,
    price: { amount: 10, currency: 'BRL' },
    discountPercentage: 0,
    finalPrice: { amount: 10, currency: 'BRL' },
    recurrence: null,
  };
}

function product(
  handle: string,
  flavorHandles: string[],
  dosesPerUnit?: number,
  usageHint?: string,
): CatalogProduct {
  return {
    handle,
    title: handle,
    category: 'x',
    price: { amount: 10, currency: 'BRL' },
    inStock: true,
    minQuantity: 1,
    maxQuantity: 5,
    ...(flavorHandles.length
      ? { flavors: flavorHandles.map((h) => ({ handle: h, title: h, inStock: true })) }
      : {}),
    ...(dosesPerUnit ? { dosesPerUnit } : {}),
    ...(usageHint ? { usageHint } : {}),
  };
}
