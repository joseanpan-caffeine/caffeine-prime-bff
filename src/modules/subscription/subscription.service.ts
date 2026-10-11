import { Inject, Injectable } from '@nestjs/common';
import {
  Capabilities,
  CancelRequest,
  Catalog,
  ItemRecurrence,
  PauseRequest,
  PreviewRequest,
  PricePreview,
  ReasonOption,
  ScheduledChange,
  Subscription,
} from '../../contracts/api';
import {
  CapabilitiesService,
  MAX_PAUSE_CYCLES,
  SubscriptionDetail,
} from '../../core/capabilities.service';
import { PricingService } from '../../core/pricing.service';
import { RecurrenceRules } from '../../core/recurrence-rules';
import { AppError } from '../../common/errors';
import { OwnershipService } from '../../common/ownership.service';
import { latestBill, toPublicSubscription } from '../../common/serializers';
import {
  CATALOG_SOURCE,
  CatalogSource,
  CLOCK,
  Clock,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../../ports';

/**
 * Casos de uso da assinatura. Toda ação passa primeiro pelas `capabilities` calculadas no
 * servidor; quando não permitida, responde 403 com `code` = razão (ex.: EDIT_WINDOW_CLOSED).
 */
@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(CATALOG_SOURCE) private readonly catalog: CatalogSource,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ownership: OwnershipService,
    private readonly capabilities: CapabilitiesService,
    private readonly pricing: PricingService,
  ) {}

  private async context(
    customerId: string,
  ): Promise<{ sub: SubscriptionDetail; caps: Capabilities }> {
    const sub = await this.ownership.requireSubscription(customerId);
    const bills = await this.subscriptions.getBills(customerId);
    const caps = this.capabilities.compute({
      subscription: sub,
      latestBill: latestBill(bills),
      now: this.clock.now(),
    });
    return { sub, caps };
  }

  private assertAllowed(cap: Capabilities[keyof Capabilities]) {
    const c = cap as { allowed: boolean; reason?: any; until?: string };
    if (!c.allowed)
      throw AppError.capabilityDenied(c.reason, c.until ? { until: c.until } : undefined);
  }

  async get(customerId: string): Promise<Subscription> {
    return toPublicSubscription(await this.ownership.requireSubscription(customerId));
  }

  getCatalog(): Promise<Catalog> {
    return this.catalog.getCatalog();
  }

  async preview(customerId: string, request: PreviewRequest): Promise<PricePreview> {
    const [catalog, sub, coupon] = await Promise.all([
      this.catalog.getCatalog(),
      this.subscriptions.getByCustomer(customerId),
      request.couponCode ? this.catalog.getCoupon(request.couponCode) : Promise.resolve(undefined),
    ]);
    const preview = this.pricing.preview({
      request,
      catalog,
      currentDiscount: sub?.discount,
      coupon,
    });
    if (!RecurrenceRules.isValid(request.items)) {
      preview.warnings.push('Pelo menos um item precisa vir em todo ciclo (recorrência normal).');
    }
    return preview;
  }

  async createScheduling(
    customerId: string,
    request: PreviewRequest & { giftHandles?: string[]; nextCycleOnly?: boolean; reason?: string },
  ): Promise<ScheduledChange> {
    const { sub, caps } = await this.context(customerId);
    this.assertAllowed(caps.canEdit);
    if (!RecurrenceRules.isValid(request.items)) {
      throw AppError.unprocessable(
        'ALL_ITEMS_ON_60_DAYS',
        'Pelo menos um item precisa vir em todo ciclo.',
      );
    }
    if (request.couponCode && !(await this.catalog.getCoupon(request.couponCode))) {
      throw AppError.unprocessable('INVALID_COUPON', 'Cupom inválido ou expirado.');
    }
    const catalog = await this.catalog.getCatalog();
    for (const gift of request.giftHandles ?? []) {
      const g = catalog.gifts.find((x) => x.handle === gift);
      if (!g) throw AppError.unprocessable('INVALID_GIFT', `Brinde "${gift}" indisponível.`);
      if (g.requiresPlan && !g.requiresPlan.includes(request.frequency)) {
        throw AppError.unprocessable(
          'GIFT_REQUIRES_PLAN',
          `Brinde "${g.title}" exige plano ${g.requiresPlan.join('/')}.`,
        );
      }
    }
    return this.subscriptions.createScheduling(sub.id, request);
  }

  async deleteScheduling(customerId: string): Promise<void> {
    const sub = await this.ownership.requireSubscription(customerId);
    if (!sub.scheduledChange)
      throw AppError.notFound('SCHEDULING_NOT_FOUND', 'Não há mudança agendada.');
    if (sub.cancellationBlocked) throw AppError.capabilityDenied('CANCELLATION_BLOCKED');
    await this.subscriptions.deleteScheduling(sub.id, sub.scheduledChange.id);
  }

  async updateItemRecurrence(
    customerId: string,
    itemId: string,
    recurrence: ItemRecurrence,
  ): Promise<Subscription> {
    const { sub, caps } = await this.context(customerId);
    await this.ownership.assertOwns('subscriptionItem', customerId, itemId);
    this.assertAllowed(caps.canEdit);
    if (
      !RecurrenceRules.canChange(
        sub.items.filter((i) => !i.isGift),
        itemId,
        recurrence,
      )
    ) {
      throw AppError.unprocessable(
        'ALL_ITEMS_ON_60_DAYS',
        'Pelo menos um item precisa vir em todo ciclo.',
      );
    }
    return toPublicSubscription(
      await this.subscriptions.updateItemRecurrence(sub.id, itemId, recurrence),
    );
  }

  async updateDiscount(customerId: string, code: string): Promise<Subscription> {
    const { sub, caps } = await this.context(customerId);
    this.assertAllowed(caps.canEdit);
    return toPublicSubscription(
      await this.subscriptions.updateDiscount(sub.id, code.trim().toUpperCase()),
    );
  }

  async pause(customerId: string, request: PauseRequest): Promise<Subscription> {
    const { sub, caps } = await this.context(customerId);
    this.assertAllowed(caps.canPause);
    if (request.cycles > (caps.canPause.maxCycles ?? MAX_PAUSE_CYCLES)) {
      throw AppError.unprocessable(
        'TOO_MANY_PAUSE_CYCLES',
        `Máximo de ${caps.canPause.maxCycles} ciclos por pausa.`,
      );
    }
    return toPublicSubscription(await this.subscriptions.pause(sub.id, request, this.clock.now()));
  }

  async resume(customerId: string): Promise<Subscription> {
    const { sub, caps } = await this.context(customerId);
    this.assertAllowed(caps.canResume);
    return toPublicSubscription(await this.subscriptions.resume(sub.id));
  }

  async cancel(customerId: string, request: CancelRequest): Promise<Subscription> {
    const { sub, caps } = await this.context(customerId);
    this.assertAllowed(caps.canCancel);
    return toPublicSubscription(await this.subscriptions.cancel(sub.id, request, this.clock.now()));
  }

  async reactivate(customerId: string): Promise<Subscription> {
    const { sub, caps } = await this.context(customerId);
    this.assertAllowed(caps.canReactivate);
    return toPublicSubscription(await this.subscriptions.reactivate(sub.id));
  }

  cancelReasons(): Promise<ReasonOption[]> {
    return this.catalog.getCancelReasons();
  }

  pauseReasons(): Promise<ReasonOption[]> {
    return this.catalog.getPauseReasons();
  }
}
