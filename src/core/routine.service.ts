/**
 * Domínio puro da rotina (frente 2, docs/contexto-prime.md §2.5): plano padrão derivado da caixa,
 * streaks, meta semanal, histórico de 28 dias e previsão de estoque. Sem dependências externas;
 * todas as datas civis são calculadas no fuso do plano (`RoutinePlan.timezone`), nunca no do
 * servidor.
 */
import {
  Bill,
  CatalogProduct,
  CheckIn,
  ProductItem,
  RoutineItem,
  RoutinePlan,
  RoutineSlot,
  RoutineSummary,
} from '../contracts/api';
import { addDaysToDateKey, localDateKey, SAO_PAULO_TZ, weekdayOfDateKey } from './timezone';

export const DEFAULT_WEEKLY_GOAL_DAYS = 5;
export const SUMMARY_DAYS = 28;

/** Encontra o produto do catálogo pelo handle do produto ou de um dos seus sabores. */
export function findCatalogProduct(
  products: CatalogProduct[],
  handle: string,
): CatalogProduct | undefined {
  return (
    products.find((p) => p.handle === handle) ??
    products.find((p) => p.flavors?.some((f) => f.handle === handle))
  );
}

/**
 * Horário sugerido por tipo de produto: Supercoffee e creatina de manhã, Morning Shot no
 * pré-treino, whey à noite. Decidido pelo handle (os metaobjects não têm esse campo ainda).
 */
export function defaultSlotFor(handle: string): RoutineSlot {
  const h = handle.toLowerCase();
  if (h.includes('morning-shot')) return 'pre_workout';
  if (h.includes('whey')) return 'evening';
  if (h.includes('creatin')) return 'morning';
  if (h.includes('supercoffee') || h.includes('coffee')) return 'morning';
  return 'afternoon';
}

const DEFAULT_REMINDER_BY_SLOT: Record<RoutineSlot, string> = {
  morning: '07:30',
  pre_workout: '17:30',
  afternoon: '15:00',
  evening: '21:00',
};

/** Plano padrão: um item de rotina por produto da caixa (brindes ficam de fora). */
export function buildDefaultPlan(
  boxItems: ProductItem[],
  products: CatalogProduct[],
  timezone = SAO_PAULO_TZ,
): RoutinePlan {
  const items: RoutineItem[] = boxItems
    .filter((i) => !i.isGift)
    .map((i) => {
      const product = findCatalogProduct(products, i.handle);
      const slot = defaultSlotFor(i.handle);
      return {
        id: `ri-${i.handle}`,
        productHandle: i.handle,
        title: i.title,
        ...(i.imageUrl ? { imageUrl: i.imageUrl } : {}),
        slot,
        reminderTime: DEFAULT_REMINDER_BY_SLOT[slot],
        reminderEnabled: false,
        dosesPerDay: 1,
        ...(product?.usageHint ? { usageHint: product.usageHint } : {}),
      };
    });
  return { items, weeklyGoalDays: DEFAULT_WEEKLY_GOAL_DAYS, timezone };
}

/** Reaplica título/imagem/dica (campos não editáveis) da caixa e do catálogo nos itens salvos. */
export function enrichPlanItems(
  plan: RoutinePlan,
  boxItems: ProductItem[],
  products: CatalogProduct[],
): RoutinePlan {
  return {
    ...plan,
    items: plan.items.map((item) => {
      const box = boxItems.find((b) => b.handle === item.productHandle);
      const product = findCatalogProduct(products, item.productHandle);
      return {
        ...item,
        title: box?.title ?? item.title ?? product?.title ?? item.productHandle,
        ...((box?.imageUrl ?? item.imageUrl ?? product?.imageUrl)
          ? { imageUrl: box?.imageUrl ?? item.imageUrl ?? product?.imageUrl }
          : {}),
        ...(product?.usageHint ? { usageHint: product.usageHint } : {}),
      };
    }),
  };
}

export interface RoutineSummaryInput {
  plan: RoutinePlan;
  checkIns: CheckIn[];
  now: Date;
  /** Faturas do cliente (a última paga alimenta a previsão de estoque). */
  bills?: Bill[];
  products?: CatalogProduct[];
  nextBillingAt?: string;
}

/** Fração de itens do plano com check-in no dia (0–1). Plano vazio → 0. */
function completionOn(plan: RoutinePlan, doneByDate: Map<string, Set<string>>, date: string) {
  if (plan.items.length === 0) return 0;
  const done = doneByDate.get(date);
  if (!done) return 0;
  const count = plan.items.filter((i) => done.has(i.id)).length;
  return count / plan.items.length;
}

function isComplete(completion: number) {
  return completion >= 1 - 1e-9;
}

/**
 * Streak atual: dias consecutivos completos terminando hoje ou, se hoje ainda não foi concluído,
 * terminando ontem (o dia em curso não quebra a sequência). Maior streak: sobre todo o histórico.
 */
export function computeStreaks(
  plan: RoutinePlan,
  doneByDate: Map<string, Set<string>>,
  today: string,
): { current: number; longest: number } {
  const complete = (d: string) => isComplete(completionOn(plan, doneByDate, d));

  let current = 0;
  let cursor = complete(today) ? today : addDaysToDateKey(today, -1);
  while (complete(cursor)) {
    current++;
    cursor = addDaysToDateKey(cursor, -1);
  }

  const dates = [...doneByDate.keys()].filter((d) => d <= today).sort();
  let longest = 0;
  let run = 0;
  let prev: string | undefined;
  for (const d of dates) {
    if (!complete(d)) {
      run = 0;
      prev = undefined;
      continue;
    }
    run = prev && addDaysToDateKey(prev, 1) === d ? run + 1 : 1;
    prev = d;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current) };
}

/** Segunda-feira da semana (ISO) que contém a data. */
export function startOfWeek(dateKey: string): string {
  const weekday = weekdayOfDateKey(dateKey); // 0 = domingo
  const offset = (weekday + 6) % 7; // segunda = 0
  return addDaysToDateKey(dateKey, -offset);
}

/**
 * Previsão de estoque: doses recebidas na última fatura paga (quantidade × doses por unidade)
 * menos check-ins desde o pagamento. `runsOutAt` projeta pelo ritmo médio observado; sem ritmo
 * não há projeção. `nextBoxAt` = próxima cobrança (a caixa seguinte).
 */
export function computeStockForecast(
  plan: RoutinePlan,
  checkIns: CheckIn[],
  bills: Bill[],
  products: CatalogProduct[],
  now: Date,
  nextBillingAt?: string,
): NonNullable<RoutineSummary['stockForecast']> {
  const lastPaid = bills
    .filter((b) => b.status === 'paid' && !b.pausedCycle && b.items.length > 0)
    .sort(
      (a, b) =>
        new Date(b.paidAt ?? b.issuedAt).getTime() - new Date(a.paidAt ?? a.issuedAt).getTime(),
    )[0];
  if (!lastPaid) return [];
  const since = new Date(lastPaid.paidAt ?? lastPaid.issuedAt);
  const sinceKey = localDateKey(since, plan.timezone);
  const daysSince = Math.max(1, Math.floor((now.getTime() - since.getTime()) / 86_400_000));

  const forecast: NonNullable<RoutineSummary['stockForecast']> = [];
  for (const billItem of lastPaid.items) {
    if (billItem.isGift) continue;
    const product = findCatalogProduct(products, billItem.handle);
    if (!product?.dosesPerUnit) continue;
    const received = billItem.quantity * product.dosesPerUnit;
    const itemIds = new Set(
      plan.items.filter((i) => i.productHandle === billItem.handle).map((i) => i.id),
    );
    const consumed = checkIns.filter(
      (c) => itemIds.has(c.routineItemId) && c.date >= sinceKey,
    ).length;
    const dosesLeft = Math.max(0, received - consumed);
    const rate = consumed / daysSince;
    const entry: NonNullable<RoutineSummary['stockForecast']>[number] = {
      productHandle: billItem.handle,
      dosesLeft,
      ...(nextBillingAt ? { nextBoxAt: nextBillingAt } : {}),
    };
    if (rate > 0 && dosesLeft > 0) {
      entry.runsOutAt = new Date(now.getTime() + (dosesLeft / rate) * 86_400_000).toISOString();
    } else if (dosesLeft === 0) {
      entry.runsOutAt = now.toISOString();
    }
    forecast.push(entry);
  }
  return forecast;
}

export function computeRoutineSummary(input: RoutineSummaryInput): RoutineSummary {
  const { plan, checkIns, now } = input;
  const today = localDateKey(now, plan.timezone);

  const doneByDate = new Map<string, Set<string>>();
  for (const c of checkIns) {
    if (!doneByDate.has(c.date)) doneByDate.set(c.date, new Set());
    doneByDate.get(c.date)!.add(c.routineItemId);
  }

  const todayDone = doneByDate.get(today) ?? new Set<string>();
  const todayItems = plan.items.map((i) => ({ routineItemId: i.id, done: todayDone.has(i.id) }));
  const { current, longest } = computeStreaks(plan, doneByDate, today);

  // Meta semanal: dias completos na semana corrente (segunda a hoje) sobre a meta.
  const weekStart = startOfWeek(today);
  let completeDays = 0;
  for (let d = weekStart; d <= today; d = addDaysToDateKey(d, 1)) {
    if (isComplete(completionOn(plan, doneByDate, d))) completeDays++;
  }
  const goal = Math.min(7, Math.max(1, plan.weeklyGoalDays || DEFAULT_WEEKLY_GOAL_DAYS));
  const weekCompletion = Math.min(1, completeDays / goal);

  const last28Days: RoutineSummary['last28Days'] = [];
  for (let i = SUMMARY_DAYS - 1; i >= 0; i--) {
    const d = addDaysToDateKey(today, -i);
    last28Days.push({ date: d, completion: round2(completionOn(plan, doneByDate, d)) });
  }

  const stockForecast = computeStockForecast(
    plan,
    checkIns,
    input.bills ?? [],
    input.products ?? [],
    now,
    input.nextBillingAt,
  );

  return {
    today: {
      date: today,
      items: todayItems,
      completion: round2(completionOn(plan, doneByDate, today)),
    },
    currentStreakDays: current,
    longestStreakDays: longest,
    weekCompletion: round2(weekCompletion),
    last28Days,
    ...(stockForecast.length > 0 ? { stockForecast } : {}),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
