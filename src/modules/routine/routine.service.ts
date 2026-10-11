import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors';
import { OwnershipService } from '../../common/ownership.service';
import {
  CheckIn,
  CheckInRequest,
  RoutinePlan,
  RoutineSummary,
  UpdateRoutinePlanRequest,
} from '../../contracts/api';
import {
  buildDefaultPlan,
  enrichPlanItems,
  computeRoutineSummary,
  SUMMARY_DAYS,
} from '../../core/routine.service';
import { addDaysToDateKey, isValidTimeZone, localDateKey, SAO_PAULO_TZ } from '../../core/timezone';
import {
  CATALOG_SOURCE,
  CatalogSource,
  CLOCK,
  Clock,
  ROUTINE_STORE,
  RoutineStore,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../../ports';

/** Dias para trás que um check-in pode ser registrado (corrigir "esqueci de marcar ontem"). */
const MAX_BACKDATE_DAYS = 7;

/**
 * Hub de hábitos (frente 2): plano derivado da caixa, check-ins idempotentes e resumo. Toda data
 * civil é calculada no fuso do plano; o app nunca calcula streak localmente.
 */
@Injectable()
export class RoutineService {
  constructor(
    @Inject(ROUTINE_STORE) private readonly store: RoutineStore,
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(CATALOG_SOURCE) private readonly catalog: CatalogSource,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ownership: OwnershipService,
  ) {}

  /** Plano salvo (enriquecido com a caixa atual) ou o padrão derivado da caixa. */
  async getPlan(customerId: string): Promise<RoutinePlan> {
    const [sub, catalog, stored] = await Promise.all([
      this.ownership.requireSubscription(customerId),
      this.catalog.getCatalog(),
      this.store.getPlan(customerId),
    ]);
    if (stored) {
      const { customerId: _c, updatedAt: _u, ...plan } = stored;
      return enrichPlanItems(plan, sub.items, catalog.products);
    }
    return buildDefaultPlan(sub.items, catalog.products, SAO_PAULO_TZ);
  }

  async updatePlan(customerId: string, request: UpdateRoutinePlanRequest): Promise<RoutinePlan> {
    const current = await this.getPlan(customerId);
    const [sub, catalog] = await Promise.all([
      this.ownership.requireSubscription(customerId),
      this.catalog.getCatalog(),
    ]);
    const timezone = request.timezone ?? current.timezone;
    if (!isValidTimeZone(timezone)) {
      throw AppError.badRequest('INVALID_TIMEZONE', 'Fuso horário inválido (use um nome IANA).');
    }
    let items = current.items;
    if (request.items) {
      const boxHandles = new Set(sub.items.filter((i) => !i.isGift).map((i) => i.handle));
      for (const item of request.items) {
        if (!boxHandles.has(item.productHandle)) {
          throw AppError.unprocessable(
            'ITEM_NOT_IN_BOX',
            'Só produtos da sua caixa podem entrar na rotina.',
            { productHandle: item.productHandle },
          );
        }
      }
      const seen = new Set<string>();
      items = request.items.map((item) => {
        const id = item.id?.trim() || `ri-${randomUUID().slice(0, 8)}`;
        if (seen.has(id)) {
          throw AppError.unprocessable('DUPLICATE_ITEM_ID', 'Itens com id repetido.', { id });
        }
        seen.add(id);
        const previous = current.items.find((i) => i.id === id);
        return {
          id,
          productHandle: item.productHandle,
          title: previous?.title ?? item.productHandle,
          slot: item.slot,
          ...(item.reminderTime ? { reminderTime: item.reminderTime } : {}),
          reminderEnabled: item.reminderEnabled && Boolean(item.reminderTime),
          dosesPerDay: item.dosesPerDay,
        };
      });
    }
    const plan: RoutinePlan = {
      items,
      weeklyGoalDays: request.weeklyGoalDays ?? current.weeklyGoalDays,
      timezone,
    };
    await this.store.savePlan(customerId, enrichPlanItems(plan, sub.items, catalog.products));
    return this.getPlan(customerId);
  }

  async checkIn(customerId: string, request: CheckInRequest): Promise<CheckIn> {
    const plan = await this.getPlan(customerId);
    if (!plan.items.some((i) => i.id === request.routineItemId)) {
      throw AppError.unprocessable('ROUTINE_ITEM_NOT_FOUND', 'Item da rotina não encontrado.', {
        routineItemId: request.routineItemId,
      });
    }
    const now = this.clock.now();
    const today = localDateKey(now, plan.timezone);
    if (request.date > today) {
      throw AppError.unprocessable('CHECK_IN_IN_FUTURE', 'Não dá para marcar um dia futuro.');
    }
    if (request.date < addDaysToDateKey(today, -MAX_BACKDATE_DAYS)) {
      throw AppError.unprocessable(
        'CHECK_IN_TOO_OLD',
        `Só é possível marcar até ${MAX_BACKDATE_DAYS} dias para trás.`,
      );
    }
    // Garante que o plano exista para o scheduler/limpeza mesmo quando era o padrão derivado.
    if (!(await this.store.getPlan(customerId))) await this.store.savePlan(customerId, plan);

    const { checkIn } = await this.store.addCheckIn({
      customerId,
      routineItemId: request.routineItemId,
      date: request.date,
      doneAt: now.toISOString(),
      source: request.source ?? 'manual',
    });
    const { customerId: _c, ...pub } = checkIn;
    return pub;
  }

  async removeCheckIn(customerId: string, checkInId: string): Promise<void> {
    const removed = await this.store.removeCheckIn(customerId, checkInId);
    if (!removed) throw AppError.forbidden();
  }

  async summary(customerId: string, days = SUMMARY_DAYS): Promise<RoutineSummary> {
    const [plan, sub, catalog] = await Promise.all([
      this.getPlan(customerId),
      this.ownership.requireSubscription(customerId),
      this.catalog.getCatalog(),
    ]);
    const now = this.clock.now();
    const today = localDateKey(now, plan.timezone);
    // Lê um histórico maior que a janela para o maior streak e para o estoque desde a última fatura.
    const from = addDaysToDateKey(today, -Math.max(days, 120));
    const [checkIns, bills] = await Promise.all([
      this.store.listCheckIns(customerId, from),
      this.subscriptions.getBills(customerId),
    ]);
    const summary = computeRoutineSummary({
      plan,
      checkIns,
      now,
      bills,
      products: catalog.products,
      nextBillingAt: sub.nextBillingAt,
    });
    if (days !== SUMMARY_DAYS) {
      summary.last28Days = summary.last28Days.slice(-Math.min(days, SUMMARY_DAYS));
    }
    return summary;
  }
}
