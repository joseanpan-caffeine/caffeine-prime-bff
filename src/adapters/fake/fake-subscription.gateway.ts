import { Injectable } from '@nestjs/common';
import {
  AddressQuote,
  Bill,
  CancelRequest,
  Dashboard,
  Fulfillment,
  ItemRecurrence,
  PauseRequest,
  ProductItem,
  ScheduledChange,
  SchedulingRequest,
  ShippingAddress,
  UpdateAddressRequest,
} from '../../contracts/api';
import { SubscriptionDetail } from '../../core/capabilities.service';
import { brl, roundToCents, roundUpToCents } from '../../core/money';
import { PricingService } from '../../core/pricing.service';
import { addDays, addMonths } from '../../core/timezone';
import { LastCanceled, SubscriptionGateway, TrackingUpdate } from '../../ports';
import { AppError } from '../../common/errors';
import { FakeState } from './fake-state';

/**
 * Implementação em memória da porta SubscriptionGateway. Todas as mutações alteram o estado
 * compartilhado (`FakeState`), de modo que leituras seguintes refletem a mudança.
 */
@Injectable()
export class FakeSubscriptionGateway implements SubscriptionGateway {
  private readonly pricing = new PricingService();

  constructor(private readonly state: FakeState) {}

  private subscriptionById(subscriptionId: string): {
    customerId: string;
    sub: SubscriptionDetail;
  } {
    for (const [customerId, sub] of this.state.subscriptions) {
      if (sub.id === subscriptionId) return { customerId, sub };
    }
    throw AppError.notFound('SUBSCRIPTION_NOT_FOUND', 'Assinatura não encontrada.');
  }

  private clone<T>(v: T): T {
    return structuredClone(v);
  }

  async getByCustomer(customerId: string): Promise<SubscriptionDetail | null> {
    const sub = this.state.subscriptions.get(customerId);
    return sub ? this.clone(sub) : null;
  }

  async getLastCanceled(customerId: string): Promise<LastCanceled | null> {
    return this.state.lastCanceled.get(customerId) ?? null;
  }

  async getBills(customerId: string): Promise<Bill[]> {
    return this.clone(this.state.bills.get(customerId) ?? []);
  }

  async getBill(customerId: string, billId: string): Promise<Bill | null> {
    const bill = (this.state.bills.get(customerId) ?? []).find((b) => b.id === billId);
    return bill ? this.clone(bill) : null;
  }

  async findBill(billId: string): Promise<{ customerId: string; bill: Bill } | null> {
    const found = this.state.findBill(billId);
    return found ? { customerId: found.customerId, bill: this.clone(found.bill) } : null;
  }

  async createScheduling(
    subscriptionId: string,
    request: SchedulingRequest,
  ): Promise<ScheduledChange> {
    const { sub } = this.subscriptionById(subscriptionId);
    const coupon = request.couponCode
      ? (this.state.coupons.find(
          (c) => c.code.toUpperCase() === request.couponCode!.toUpperCase(),
        ) ?? null)
      : undefined;
    const preview = this.pricing.preview({
      request,
      catalog: this.state.catalog,
      currentDiscount: sub.discount,
      coupon,
    });
    const items: ProductItem[] = request.items.map((line, idx) =>
      this.state.buildItem(
        { handle: line.handle, quantity: line.quantity, recurrence: line.recurrence ?? null },
        preview.appliedDiscountPercentage,
        idx + 1,
      ),
    );
    for (const giftHandle of request.giftHandles ?? []) {
      const gift = this.state.catalog.gifts.find((g) => g.handle === giftHandle);
      if (!gift) continue;
      items.push({
        id: `gift-${giftHandle}`,
        handle: gift.handle,
        title: gift.title,
        imageUrl: gift.imageUrl,
        quantity: 1,
        price: brl(0),
        discountPercentage: 100,
        finalPrice: brl(0),
        recurrence: null,
        isGift: true,
      });
    }
    const plan = this.state.catalog.plans.find((p) => p.frequency === request.frequency);
    const change: ScheduledChange = {
      id: `sch-${sub.id}-${Date.now()}`,
      appliesAt: sub.nextBillingAt,
      frequency: request.frequency,
      planName: plan?.name ?? sub.planName,
      items,
      total: preview.total,
      nextCycleOnly: Boolean(request.nextCycleOnly),
    };
    sub.scheduledChange = change;
    return this.clone(change);
  }

  async deleteScheduling(subscriptionId: string, scheduleId: string): Promise<void> {
    const { sub } = this.subscriptionById(subscriptionId);
    if (!sub.scheduledChange || sub.scheduledChange.id !== scheduleId) {
      throw AppError.notFound('SCHEDULING_NOT_FOUND', 'Não há mudança agendada para desfazer.');
    }
    delete sub.scheduledChange;
  }

  async pause(
    subscriptionId: string,
    request: PauseRequest,
    now: Date,
  ): Promise<SubscriptionDetail> {
    const { sub } = this.subscriptionById(subscriptionId);
    const nextBilling = new Date(sub.nextBillingAt);
    sub.status = 'paused';
    sub.pauseCreditsLeft = Math.max(0, sub.pauseCreditsLeft - 1);
    sub.pause = {
      cycles: request.cycles,
      remainingCycles: request.cycles,
      pausedAt: now.toISOString(),
      // Retomada = primeira cobrança após os ciclos pausados (Prime API §4.5).
      resumeAt: addMonths(nextBilling, request.cycles).toISOString(),
    };
    return this.clone(sub);
  }

  async resume(subscriptionId: string): Promise<SubscriptionDetail> {
    const { sub } = this.subscriptionById(subscriptionId);
    sub.status = 'active';
    delete sub.pause;
    // Cancelar a pausa devolve o crédito (§4.5).
    sub.pauseCreditsLeft += 1;
    return this.clone(sub);
  }

  async cancel(
    subscriptionId: string,
    request: CancelRequest,
    now: Date,
  ): Promise<SubscriptionDetail> {
    const { customerId, sub } = this.subscriptionById(subscriptionId);
    sub.status = 'canceled';
    delete sub.scheduledChange;
    delete sub.pause;
    this.state.lastCanceled.set(customerId, {
      canceledAt: now.toISOString(),
      reason: request.reason,
      subscriptionId: sub.id,
    });
    return this.clone(sub);
  }

  async reactivate(subscriptionId: string): Promise<SubscriptionDetail> {
    const { customerId, sub } = this.subscriptionById(subscriptionId);
    sub.status = 'active';
    const now = new Date();
    if (new Date(sub.nextBillingAt).getTime() < now.getTime()) {
      sub.nextBillingAt = addDays(now, 30).toISOString();
    }
    this.state.lastCanceled.delete(customerId);
    return this.clone(sub);
  }

  async updateItemRecurrence(
    subscriptionId: string,
    itemId: string,
    recurrence: ItemRecurrence,
  ): Promise<SubscriptionDetail> {
    const { sub } = this.subscriptionById(subscriptionId);
    const item = sub.items.find((i) => i.id === itemId);
    if (!item) throw AppError.notFound('ITEM_NOT_FOUND', 'Item não encontrado na assinatura.');
    item.recurrence = recurrence;
    this.state.recalcTotals(sub);
    return this.clone(sub);
  }

  async updateDiscount(subscriptionId: string, code: string): Promise<SubscriptionDetail> {
    const { sub } = this.subscriptionById(subscriptionId);
    const coupon = this.state.coupons.find((c) => c.code.toUpperCase() === code.toUpperCase());
    if (!coupon) throw AppError.unprocessable('INVALID_COUPON', 'Cupom inválido ou expirado.');
    if (coupon.temporaryCycles) {
      sub.discount = {
        ...sub.discount,
        temporaryCode: coupon.code,
        temporaryPercentage: coupon.percentage,
        temporaryCycles: coupon.temporaryCycles,
      };
    } else {
      sub.discount = { code: coupon.code, percentage: coupon.percentage };
    }
    this.state.reapplyDiscount(sub);
    return this.clone(sub);
  }

  async getShippingAddress(subscriptionId: string): Promise<ShippingAddress | null> {
    const { sub } = this.subscriptionById(subscriptionId);
    return sub.shippingAddress ? this.clone(sub.shippingAddress) : null;
  }

  async updateShippingAddress(
    subscriptionId: string,
    addressId: string,
    request: UpdateAddressRequest,
    quote: AddressQuote['options'][number],
  ): Promise<ShippingAddress> {
    const { sub } = this.subscriptionById(subscriptionId);
    if (!sub.shippingAddress || sub.shippingAddress.id !== addressId) {
      throw AppError.forbidden();
    }
    const { quoteOptionId: _ignored, ...fields } = request;
    sub.shippingAddress = {
      ...sub.shippingAddress,
      ...fields,
      deliveryMethod: quote.method,
      deliveryEstimateDays: quote.estimateDays,
    };
    return this.clone(sub.shippingAddress);
  }

  async getSavings(customerId: string): Promise<Dashboard['savings']> {
    const bills = (this.state.bills.get(customerId) ?? []).filter((b) => b.status === 'paid');
    const sub = this.state.subscriptions.get(customerId);
    const cutoff = addMonths(this.state.seededAt, -12).getTime();
    let last12 = 0;
    let since = 0;
    for (const bill of bills) {
      const saved = bill.items.reduce(
        (s, i) => s + (i.price.amount - i.finalPrice.amount) * i.quantity,
        0,
      );
      since += saved;
      if (new Date(bill.issuedAt).getTime() >= cutoff) last12 += saved;
    }
    // Faturas antigas fora do histórico: estima pelos ciclos pagos restantes.
    if (sub && sub.paidCycles > bills.length) {
      const perCycle = sub.totalDiscount.amount;
      since += perCycle * (sub.paidCycles - bills.length);
    }
    return { last12Months: brl(roundToCents(last12)), sinceStart: brl(roundToCents(since)) };
  }

  async applyBillPaid(
    billId: string,
    paidAt: Date,
  ): Promise<{ customerId: string; bill: Bill } | null> {
    const found = this.state.findBill(billId);
    if (!found) return null;
    const { customerId, bill } = found;
    if (bill.status === 'paid') return { customerId, bill: this.clone(bill) };
    bill.status = 'paid';
    bill.paidAt = paidAt.toISOString();
    if (bill.pix) {
      bill.paymentMethod = 'pix';
      delete bill.pix;
    }
    const sub = this.state.subscriptions.get(customerId);
    if (sub) {
      sub.paidCycles += 1;
      if (sub.status === 'fraud_review') sub.status = 'active';
    }
    if (!bill.fulfillment) {
      bill.fulfillment = {
        status: 'processing',
        events: [
          {
            status: 'processing',
            description: 'Pagamento confirmado; pedido em separação',
            occurredAt: paidAt.toISOString(),
          },
        ],
      };
    }
    return { customerId, bill: this.clone(bill) };
  }

  async applyTrackingUpdate(
    orderExternalId: string,
    update: TrackingUpdate,
  ): Promise<{ customerId: string; bill: Bill } | null> {
    const ref = this.state.orderRefs.get(orderExternalId);
    if (!ref) return null;
    const bill = (this.state.bills.get(ref.customerId) ?? []).find((b) => b.id === ref.billId);
    if (!bill) return null;
    const current: Fulfillment = bill.fulfillment ?? { status: 'pending', events: [] };
    current.status = update.status;
    if (update.carrier) current.carrier = update.carrier;
    if (update.trackingCode) current.trackingCode = update.trackingCode;
    if (update.trackingUrl) current.trackingUrl = update.trackingUrl;
    current.events.push({
      status: update.status,
      description: update.description,
      occurredAt: update.occurredAt,
      ...(update.location ? { location: update.location } : {}),
    });
    bill.fulfillment = current;
    if (update.trackingCode) this.state.orderRefs.set(update.trackingCode, ref);
    return { customerId: ref.customerId, bill: this.clone(bill) };
  }

  /** Usado pelo gateway de pagamento fake para fechar o cartão na hora. */
  computeTotal(items: ProductItem[]): number {
    return roundToCents(
      items.reduce((s, i) => s + roundUpToCents(i.finalPrice.amount) * i.quantity, 0),
    );
  }
}
