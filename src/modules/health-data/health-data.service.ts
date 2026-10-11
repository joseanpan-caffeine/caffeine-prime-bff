import { Inject, Injectable } from '@nestjs/common';
import { OwnershipService } from '../../common/ownership.service';
import { HealthDailySample, HealthSummary, HealthSyncRequest } from '../../contracts/api';
import { buildHealthSuggestions } from '../../core/health-suggestions';
import { addDaysToDateKey, localDateKey, SAO_PAULO_TZ } from '../../core/timezone';
import {
  CLOCK,
  Clock,
  HEALTH_STORE,
  HealthStore,
  ROUTINE_STORE,
  RoutineStore,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../../ports';

const CONNECTED_WINDOW_DAYS = 7;

/**
 * Dados de saúde (frente 2): o app envia só agregados diários do HealthKit / Health Connect; o
 * BFF guarda por (dia, métrica) e devolve um resumo com sugestões de uso dos produtos.
 */
@Injectable()
export class HealthDataService {
  constructor(
    @Inject(HEALTH_STORE) private readonly store: HealthStore,
    @Inject(ROUTINE_STORE) private readonly routine: RoutineStore,
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ownership: OwnershipService,
  ) {}

  async sync(customerId: string, request: HealthSyncRequest): Promise<void> {
    const now = this.clock.now();
    // Ignora datas futuras (relógio do aparelho adiantado); o DTO já validou formato e sinal.
    const tz = await this.timezoneOf(customerId);
    const today = localDateKey(now, tz);
    const samples = request.samples.filter((s) => s.date <= today);
    // Última amostra por (date, metric) vence quando o payload repete a chave.
    const dedup = new Map<string, HealthDailySample>();
    for (const s of samples) dedup.set(`${s.date}:${s.metric}`, s);
    await this.store.upsertSamples(customerId, [...dedup.values()]);
    const previous = await this.store.getSyncMeta(customerId);
    await this.store.saveSyncMeta(customerId, {
      ...((request.provider ?? previous?.provider)
        ? { provider: request.provider ?? previous?.provider }
        : {}),
      lastSyncAt: now,
    });
  }

  async summary(customerId: string): Promise<HealthSummary> {
    const now = this.clock.now();
    const tz = await this.timezoneOf(customerId);
    const today = localDateKey(now, tz);
    const from = addDaysToDateKey(today, -(CONNECTED_WINDOW_DAYS - 1));
    const [samples, meta, sub, plan] = await Promise.all([
      this.store.listSamples(customerId, from, today),
      this.store.getSyncMeta(customerId),
      this.subscriptions.getByCustomer(customerId),
      this.routine.getPlan(customerId),
    ]);
    const connected = samples.length > 0;

    const byDate = new Map<string, HealthSummary['last7Days'][number]>();
    for (let i = CONNECTED_WINDOW_DAYS - 1; i >= 0; i--) {
      const d = addDaysToDateKey(today, -i);
      byDate.set(d, { date: d });
    }
    for (const s of samples) {
      const day = byDate.get(s.date);
      if (!day) continue;
      if (s.metric === 'steps') day.steps = s.value;
      if (s.metric === 'active_minutes') day.activeMinutes = s.value;
      if (s.metric === 'workouts') day.workouts = s.value;
      if (s.metric === 'sleep_minutes') day.sleepMinutes = s.value;
    }

    const localHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(now)
        .find((p) => p.type === 'hour')?.value ?? 0,
    );
    const doneTodayIds = new Set(
      (await this.routine.listCheckIns(customerId, today))
        .filter((c) => c.date === today)
        .map((c) => c.routineItemId),
    );
    const suggestions = connected
      ? buildHealthSuggestions({
          today: samples.filter((s) => s.date === today),
          yesterday: samples.filter((s) => s.date === addDaysToDateKey(today, -1)),
          boxHandles: sub?.items.filter((i) => !i.isGift).map((i) => i.handle) ?? [],
          localHour,
          doneToday:
            plan?.items.filter((i) => doneTodayIds.has(i.id)).map((i) => i.productHandle) ?? [],
        })
      : [];

    return {
      connected,
      provider: connected ? (meta?.provider ?? 'none') : 'none',
      ...(meta ? { lastSyncAt: meta.lastSyncAt.toISOString() } : {}),
      last7Days: [...byDate.values()],
      suggestions,
    };
  }

  private async timezoneOf(customerId: string): Promise<string> {
    return (await this.routine.getPlan(customerId))?.timezone ?? SAO_PAULO_TZ;
  }
}
