import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import {
  AddressQuote,
  Bill,
  CancelRequest,
  Dashboard,
  ItemRecurrence,
  PauseRequest,
  ScheduledChange,
  SchedulingRequest,
  ShippingAddress,
  UpdateAddressRequest,
} from '../../contracts/api';
import { SubscriptionDetail } from '../../core/capabilities.service';
import { Env, ENV } from '../../config/env';
import { LastCanceled, SubscriptionGateway, TrackingUpdate } from '../../ports';
import { HttpClient } from './http-client';

/**
 * Adaptador real para a Prime API (NestJS, autenticação por header `x-api-key`).
 * Env: PRIME_API_URL, CAFFEINE_PRIME_X_API_KEY.
 * Cada método indica o endpoint da Prime API que irá chamar (docs-arquitetura.md §5 e doc 01 §8).
 */
@Injectable()
export class PrimeApiSubscriptionGateway implements SubscriptionGateway {
  private readonly http: HttpClient;

  constructor(@Inject(ENV) env: Env) {
    this.http = new HttpClient({
      baseUrl: env.primeApi.url,
      headers: { 'x-api-key': env.primeApi.apiKey },
    });
  }

  /** GET /subscriptions/customers/{shopifyCustomerId} → mapear para SubscriptionDetail (inclui cancellationBlocked do scheduling ativo via GET /subscriptions/schedulings/{vindiSubscriptionId}). */
  async getByCustomer(_customerId: string): Promise<SubscriptionDetail | null> {
    throw new NotImplementedException(
      'TODO: conectar GET /subscriptions/customers/{shopifyCustomerId} da Prime API',
    );
  }

  /** GET /subscriptions/customers/{shopifyCustomerId}/lastcanceled */
  async getLastCanceled(_customerId: string): Promise<LastCanceled | null> {
    throw new NotImplementedException(
      'TODO: conectar GET /subscriptions/customers/{id}/lastcanceled da Prime API',
    );
  }

  /** GET /subscriptions/customers/{shopifyCustomerId}/bills (inclui order.fulfillment para o rastreio) */
  async getBills(_customerId: string): Promise<Bill[]> {
    throw new NotImplementedException(
      'TODO: conectar GET /subscriptions/customers/{id}/bills da Prime API',
    );
  }

  /** GET /subscriptions/{subscriptionId}/bills/{billId} */
  async getBill(_customerId: string, _billId: string): Promise<Bill | null> {
    throw new NotImplementedException(
      'TODO: conectar GET /subscriptions/{id}/bills/{billId} da Prime API',
    );
  }

  /** GET /bills/{vindiBillId} (uso interno dos webhooks) */
  async findBill(_billId: string): Promise<{ customerId: string; bill: Bill } | null> {
    throw new NotImplementedException('TODO: conectar GET /bills/{vindiBillId} da Prime API');
  }

  /** POST /subscriptions/{subscriptionId}/scheduling (editionScope: next_cycle_only quando nextCycleOnly) */
  async createScheduling(
    _subscriptionId: string,
    _request: SchedulingRequest,
  ): Promise<ScheduledChange> {
    throw new NotImplementedException(
      'TODO: conectar POST /subscriptions/{id}/scheduling da Prime API',
    );
  }

  /** DELETE /subscriptions/schedulings/{scheduleId} */
  async deleteScheduling(_subscriptionId: string, _scheduleId: string): Promise<void> {
    throw new NotImplementedException(
      'TODO: conectar DELETE /subscriptions/schedulings/{scheduleId} da Prime API',
    );
  }

  /** POST /subscriptions/{subscriptionId}/pause com `{cycles, reason, listResponse, pauseType: 'User'}` */
  async pause(
    _subscriptionId: string,
    _request: PauseRequest,
    _now: Date,
  ): Promise<SubscriptionDetail> {
    throw new NotImplementedException('TODO: conectar POST /subscriptions/{id}/pause da Prime API');
  }

  /** POST /subscriptions/{subscriptionId}/cancelSubscriptionPause */
  async resume(_subscriptionId: string): Promise<SubscriptionDetail> {
    throw new NotImplementedException(
      'TODO: conectar POST /subscriptions/{id}/cancelSubscriptionPause da Prime API',
    );
  }

  /** DELETE /subscriptions/{subscriptionId} (+ remover tag `Prime` do cliente na Shopify Admin) */
  async cancel(
    _subscriptionId: string,
    _request: CancelRequest,
    _now: Date,
  ): Promise<SubscriptionDetail> {
    throw new NotImplementedException('TODO: conectar DELETE /subscriptions/{id} da Prime API');
  }

  /** POST /subscriptions/{subscriptionId}/reactivate (+ tag `Prime` na Shopify Admin) */
  async reactivate(_subscriptionId: string): Promise<SubscriptionDetail> {
    throw new NotImplementedException(
      'TODO: conectar POST /subscriptions/{id}/reactivate da Prime API',
    );
  }

  /** PATCH /subscriptions/{subscriptionId}/product-items/{itemId}/edit-recurrence */
  async updateItemRecurrence(
    _subscriptionId: string,
    _itemId: string,
    _recurrence: ItemRecurrence,
  ): Promise<SubscriptionDetail> {
    throw new NotImplementedException(
      'TODO: conectar PATCH /subscriptions/{id}/product-items/{itemId}/edit-recurrence da Prime API',
    );
  }

  /** PATCH /subscriptions/{subscriptionId}/updateDiscount */
  async updateDiscount(_subscriptionId: string, _code: string): Promise<SubscriptionDetail> {
    throw new NotImplementedException(
      'TODO: conectar PATCH /subscriptions/{id}/updateDiscount da Prime API',
    );
  }

  /** GET /subscriptions/{subscriptionId}/shippingAddress */
  async getShippingAddress(_subscriptionId: string): Promise<ShippingAddress | null> {
    throw new NotImplementedException(
      'TODO: conectar GET /subscriptions/{id}/shippingAddress da Prime API',
    );
  }

  /** PATCH /subscriptions/{subscriptionId}/updateShippingAddress/{shippingAddressId} (inclui campos da cotação Intelipost) */
  async updateShippingAddress(
    _subscriptionId: string,
    _addressId: string,
    _request: UpdateAddressRequest,
    _quote: AddressQuote['options'][number],
  ): Promise<ShippingAddress> {
    throw new NotImplementedException(
      'TODO: conectar PATCH /subscriptions/{id}/updateShippingAddress/{addrId} da Prime API',
    );
  }

  /** GET /subscriptions/customers/{shopifyCustomerId}/discount-tracker */
  async getSavings(_customerId: string): Promise<Dashboard['savings']> {
    throw new NotImplementedException(
      'TODO: conectar GET /subscriptions/customers/{id}/discount-tracker da Prime API',
    );
  }

  /** Webhook Vindi bill_paid: a Prime API já processa; aqui só GET /bills/{vindiBillId} para localizar o cliente e invalidar cache. */
  async applyBillPaid(
    _billId: string,
    _paidAt: Date,
  ): Promise<{ customerId: string; bill: Bill } | null> {
    throw new NotImplementedException(
      'TODO: conectar GET /bills/{vindiBillId} da Prime API (webhook bill_paid)',
    );
  }

  /** Webhook Estoca: localizar a fatura por Bill.integrationCode (= order external_id) via GET /bills?integrationCode= */
  async applyTrackingUpdate(
    _orderExternalId: string,
    _update: TrackingUpdate,
  ): Promise<{ customerId: string; bill: Bill } | null> {
    throw new NotImplementedException(
      'TODO: conectar GET /bills por integrationCode da Prime API (webhook Estoca)',
    );
  }
}
