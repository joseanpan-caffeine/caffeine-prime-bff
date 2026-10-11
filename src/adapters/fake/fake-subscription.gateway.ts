import { Injectable } from '@nestjs/common';
import {
  AddressQuote,
  Bill,
  CancelRequest,
  Dashboard,
  Fulfillment,
  ItemRecurrence,
  PauseRequest,
  PauseType,
  ProductItem,
  ScheduledChange,
  SchedulingRequest,
  ShippingAddress,
  UpdateAddressRequest,
} from '../../contracts/api';
import { PAUSE_CREDITS_BY_FREQUENCY, SubscriptionDetail } from '../../core/capabilities.service';
import { brl, roundToCents, roundUpToCents } from '../../core/money';
import { PricingService } from '../../core/pricing.service';
import { addDays, addMonths } from '../../core/timezone';
import { LastCanceled, SubscriptionGateway, TrackingUpdate } from '../../ports';
import { AppError } from '../../common/errors';
import { FakeState } from './fake-state';

/**
 * Implementação em memória da porta SubscriptionGateway. Todas as mutações alteram o estado
 * compartilhado (`FakeState`), de modo que leituras seguintes refletem a mudança.
 *
 * Reproduz os comportamentos da Prime API que importam para o app (docs/contexto-prime.md):
 * - §4.3 caso A/B do agendamento: mudar o plano cria uma assinatura `future` com id novo e
 *   cancela a atual ("Upgrade de Plano"); `getByCustomer` sempre devolve a assinatura viva.
 * - §5.3/§6.2 pausa: cada ciclo pausado vira fatura de R$ 0,00, não conta para a fidelidade; a
 *   pausa `Offer` (retenção) não consome crédito.
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

  /**
   * "Assinatura corrente do cliente": a única viva (active|future|fraud_review|paused) ou, se
   * não houver, a última cancelada (para a tela de reativação). Nunca procurar por id guardado:
   * depois de uma troca de plano o id muda (§4.3 caso B).
   */
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
    const { customerId, sub } = this.subscriptionById(subscriptionId);
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

    // Caso A (§4.3): mesma fidelidade → a Prime API recria os itens na própria assinatura e
    // registra o agendamento já `Finished`. O id não muda.
    if (request.frequency === sub.frequency) {
      sub.scheduledChange = change;
      return this.clone(change);
    }

    // Caso B (§4.3): mudou o plano → nasce uma assinatura NOVA com status `future`, que começa
    // na próxima cobrança, e a atual é cancelada com motivo automático "Upgrade de Plano".
    // Na Prime API o mesmo acontece quando muda o cupom ("Upgrade de Oferta"); aqui só o plano.
    // Consequência para o app: o `id` da assinatura muda; GET /me/subscription passa a devolver
    // a futura. Cancelar o agendamento reativa a original e apaga a futura (deleteScheduling).
    const now = new Date();
    const future: SubscriptionDetail = {
      ...this.clone(sub),
      id: this.state.newSubscriptionId(customerId),
      status: 'future',
      frequency: request.frequency,
      planName: change.planName,
      startedAt: sub.nextBillingAt,
      nextBillingAt: sub.nextBillingAt,
      currentCycle: 1,
      paidCycles: 0,
      remainingCommitmentMonths:
        request.frequency === 'Mensal' ? -1 : (plan?.commitmentMonths ?? 0),
      pauseCreditsLeft: PAUSE_CREDITS_BY_FREQUENCY[request.frequency],
      items,
      discount: coupon
        ? coupon.temporaryCycles
          ? {
              ...sub.discount,
              temporaryCode: coupon.code,
              temporaryPercentage: coupon.percentage,
              temporaryCycles: coupon.temporaryCycles,
            }
          : { code: coupon.code, percentage: coupon.percentage }
        : sub.discount,
      scheduledChange: change,
      cancellationBlocked: false,
    };
    delete future.pause;
    this.state.recalcTotals(future);

    const original = this.clone(sub);
    original.status = 'canceled';
    delete original.scheduledChange;
    this.state.replacedByScheduling.set(future.id, {
      customerId,
      original,
      previousLastCanceled: this.state.lastCanceled.get(customerId) ?? null,
    });
    this.state.lastCanceled.set(customerId, {
      canceledAt: now.toISOString(),
      reason: 'Upgrade de Plano',
      subscriptionId: original.id,
    });
    this.state.subscriptions.set(customerId, future);
    return this.clone(change);
  }

  async deleteScheduling(subscriptionId: string, scheduleId: string): Promise<void> {
    const { customerId, sub } = this.subscriptionById(subscriptionId);
    if (!sub.scheduledChange || sub.scheduledChange.id !== scheduleId) {
      throw AppError.notFound('SCHEDULING_NOT_FOUND', 'Não há mudança agendada para desfazer.');
    }
    // Caso B desfeito (§4.3): reativa a original e apaga a assinatura futura. O id volta ao antigo.
    const replaced = this.state.replacedByScheduling.get(sub.id);
    if (replaced) {
      const restored = this.clone(replaced.original);
      restored.status = 'active';
      delete restored.scheduledChange;
      this.state.subscriptions.set(customerId, restored);
      this.state.replacedByScheduling.delete(sub.id);
      if (replaced.previousLastCanceled) {
        this.state.lastCanceled.set(customerId, replaced.previousLastCanceled);
      } else {
        this.state.lastCanceled.delete(customerId);
      }
      return;
    }
    delete sub.scheduledChange;
  }

  async pause(
    subscriptionId: string,
    request: PauseRequest,
    now: Date,
    pauseType: PauseType = 'User',
  ): Promise<SubscriptionDetail> {
    const { customerId, sub } = this.subscriptionById(subscriptionId);
    const nextBilling = new Date(sub.nextBillingAt);
    sub.status = 'paused';
    // Pausa `Offer` (retenção, oferecida pelo CS) não consome crédito (§6.2). A rota pública do
    // app só cria `User`; `Offer` entra apenas por `pauseAsRetentionOffer` (caminho interno).
    if (pauseType === 'User') {
      sub.pauseCreditsLeft = Math.max(0, sub.pauseCreditsLeft - request.cycles);
    }
    sub.pause = {
      cycles: request.cycles,
      remainingCycles: request.cycles,
      pausedAt: now.toISOString(),
      // Retomada = primeira cobrança após os ciclos pausados.
      resumeAt: addMonths(nextBilling, request.cycles).toISOString(),
      pauseType,
    };
    // Cada ciclo pausado pula exatamente 1 cobrança: a Vindi gera a fatura do ciclo com R$ 0,00
    // (100% de desconto), já paga, sem pedido e sem contar para a fidelidade (§5.3/§6.2).
    const bills = this.state.bills.get(customerId) ?? [];
    for (let i = 0; i < request.cycles; i++) {
      bills.unshift(
        this.state.buildPausedCycleBill(sub, sub.currentCycle + i, addMonths(nextBilling, i)),
      );
    }
    this.state.bills.set(customerId, bills);
    return this.clone(sub);
  }

  /**
   * Caminho interno de retenção (CS oferece a pausa; LC-05 — governança em aberto). Não há rota
   * pública: o app nunca chama isto. Ignora elegibilidade e não consome crédito.
   */
  async pauseAsRetentionOffer(
    subscriptionId: string,
    request: PauseRequest,
    now: Date,
  ): Promise<SubscriptionDetail> {
    return this.pause(subscriptionId, request, now, 'Offer');
  }

  async resume(subscriptionId: string): Promise<SubscriptionDetail> {
    const { customerId, sub } = this.subscriptionById(subscriptionId);
    const pause = sub.pause;
    sub.status = 'active';
    delete sub.pause;
    // Desfazer a pausa devolve os créditos dos ciclos ainda não pausados (só para `User`) e
    // remove as faturas R$ 0,00 dos ciclos que ainda não aconteceram.
    if (pause && (pause.pauseType ?? 'User') === 'User') {
      sub.pauseCreditsLeft += pause.remainingCycles;
    }
    const bills = this.state.bills.get(customerId) ?? [];
    const nowMs = Date.now();
    this.state.bills.set(
      customerId,
      bills.filter((b) => !(b.pausedCycle && new Date(b.issuedAt).getTime() > nowMs)),
    );
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
      // Fatura de ciclo pausado (R$ 0,00) não conta como cobrança paga nem para a fidelidade.
      if (!bill.pausedCycle) sub.paidCycles += 1;
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
