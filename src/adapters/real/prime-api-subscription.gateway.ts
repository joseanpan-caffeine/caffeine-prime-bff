import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import {
  AddressQuote,
  Bill,
  CancelRequest,
  Dashboard,
  ItemRecurrence,
  PauseRequest,
  PauseType,
  ScheduledChange,
  SchedulingRequest,
  ShippingAddress,
  UpdateAddressRequest,
} from '../../contracts/api';
import { SubscriptionDetail } from '../../core/capabilities.service';
import { Env, ENV } from '../../config/env';
// `normalizeSubscriptionStatus` (src/core/subscription-status.ts) deve ser usado no mapeamento
// de `status` quando este adaptador for conectado (ver comentário de `getByCustomer`).
import { LastCanceled, SubscriptionGateway, TrackingUpdate } from '../../ports';
import { HttpClient } from './http-client';

/**
 * Adaptador real para a Prime API (NestJS, autenticação por header `x-api-key`).
 * Env: PRIME_API_URL, CAFFEINE_PRIME_X_API_KEY.
 * Cada método indica o endpoint da Prime API que irá chamar (docs-arquitetura.md §5 e doc 01 §8).
 *
 * Invariantes (CLAUDE.md / docs/contexto-prime.md):
 * - Só endpoints de cliente (`/subscriptions/*`, leitura de `/bills/*`). NUNCA `/admin`, `/tasks`
 *   ou `/webhooks` da Prime API.
 * - Nenhum preço, produto, plano ou brinde fixo aqui: tudo vem da resposta da API. O valor que o
 *   app mostra é o que a API devolve (o "melhor desconto" é calculado em ~7 pontos do backend e
 *   pode variar levemente entre telas; não recalcular).
 * - `status` da Prime API é string livre (§5.2): mapear com `normalizeSubscriptionStatus`, nunca
 *   lançar em valor desconhecido.
 * - As regras D-3 / D-5 / 4ª cobrança / fidelidade NÃO são validadas pela Prime API (§6.1): quem
 *   bloqueia é o `CapabilitiesService` do BFF, antes de chegar aqui.
 * - Fuso: a Prime API tem `subHours(date, 3)` espalhado (§8 item 7). Converter datas para UTC na
 *   entrada e validar casos perto da meia-noite.
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

  /**
   * GET /subscriptions/customers/{shopifyCustomerId} → mapear para SubscriptionDetail (inclui
   * cancellationBlocked do scheduling ativo via GET /subscriptions/schedulings/{vindiSubscriptionId}).
   *
   * "Assinatura corrente do cliente" (§4.3/§5.3): um shopifyCustomerId só tem UMA assinatura viva
   * (active|future|fraud_review|paused). Depois de uma troca de plano (caso B) o id muda, então
   * sempre resolver por cliente, nunca por id guardado. Mapeamentos (§5.2): `projectCode` →
   * `paidCycles` (o nome engana), `remainingCancelation` → `remainingCommitmentMonths` (-1 para
   * Mensal), `pauseCredit`/`remainingPauseCycles` → `pauseCreditsLeft`/`pause.remainingCycles`,
   * `status` via `normalizeSubscriptionStatus` (string livre → `rawStatus` quando desconhecido).
   * Ignorar `earlyRemainingCancellation` e `vendor` (legados).
   */
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

  /**
   * GET /subscriptions/customers/{shopifyCustomerId}/bills (inclui order.fulfillment para o rastreio).
   * Durante uma pausa a Vindi gera fatura de R$ 0,00 (100% de desconto) por ciclo (§5.3): marcar
   * `pausedCycle: true` (valor 0 + assinatura pausada/pausa vigente na data) para o app mostrar
   * "Ciclo pausado" em vez de erro. Ao nascer a fatura de um ciclo, as pendentes anteriores são
   * canceladas pelo backend; não há histórico de inadimplência a reconstruir aqui.
   */
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

  /**
   * POST /subscriptions/{subscriptionId}/scheduling (editionScope: next_cycle_only quando nextCycleOnly).
   *
   * Dois casos no backend (§4.3):
   * - Caso A (mesma fidelidade e mesmo cupom; 73% das edições): a API remove e recria os itens
   *   na própria assinatura, registra o agendamento já `Finished` e manda e-mail. O id não muda.
   * - Caso B (mudou plano ou cupom): a API cria uma assinatura NOVA com status `future` (começa na
   *   próxima cobrança, `origin = 'scheduling'`) e cancela a atual com motivo automático
   *   ("Upgrade de Plano", "Upgrade de Oferta" ou "Troca de lata e/ou sabor"). O id da assinatura
   *   do cliente MUDA: depois desta chamada, reler via `getByCustomer`, nunca reutilizar o id.
   *   Cancelar esse agendamento (`deleteScheduling`) reativa a original e apaga a futura.
   * A atualização de desconto na Vindi é destrutiva (apaga e recria; §8 item 4): não encadear
   * edições em sequência rápida; o `Idempotency-Key` do app protege contra toque duplo.
   * O total exibido ao cliente é o da resposta desta chamada, não o preview local.
   */
  async createScheduling(
    _subscriptionId: string,
    _request: SchedulingRequest,
  ): Promise<ScheduledChange> {
    throw new NotImplementedException(
      'TODO: conectar POST /subscriptions/{id}/scheduling da Prime API',
    );
  }

  /**
   * DELETE /subscriptions/schedulings/{scheduleId}. No caso B (§4.3) reativa a assinatura original
   * e apaga a `future`: o id volta a ser o antigo → o chamador deve reler via `getByCustomer`.
   */
  async deleteScheduling(_subscriptionId: string, _scheduleId: string): Promise<void> {
    throw new NotImplementedException(
      'TODO: conectar DELETE /subscriptions/schedulings/{scheduleId} da Prime API',
    );
  }

  /**
   * POST /subscriptions/{subscriptionId}/pause com `{cycles, reason, listResponse, pauseType}`.
   * A rota pública do BFF sempre envia `pauseType: 'User'` (consome 1 crédito por ciclo). `Offer`
   * é a pausa de retenção oferecida pelo CS (§6.2): ignora elegibilidade, não consome crédito e
   * NÃO deve ser exposta ao app (governança em aberto, LC-05). As travas de 3 cobranças pagas e
   * D-3 não existem na API (§6.1): o BFF já as aplicou antes de chamar aqui.
   */
  async pause(
    _subscriptionId: string,
    _request: PauseRequest,
    _now: Date,
    _pauseType: PauseType = 'User',
  ): Promise<SubscriptionDetail> {
    throw new NotImplementedException('TODO: conectar POST /subscriptions/{id}/pause da Prime API');
  }

  /**
   * POST /subscriptions/{subscriptionId}/cancelSubscriptionPause. A regra "desfazer até D-5" não
   * é validada pela API (§6.1); o BFF a aplica em `canResume`.
   */
  async resume(_subscriptionId: string): Promise<SubscriptionDetail> {
    throw new NotImplementedException(
      'TODO: conectar POST /subscriptions/{id}/cancelSubscriptionPause da Prime API',
    );
  }

  /**
   * DELETE /subscriptions/{subscriptionId} (+ remover tag `Prime` do cliente na Shopify Admin).
   * A API cancela na Vindi (e aborta se a Vindi falhar), grava o questionário de motivo, avisa
   * Caffeine X (estorno de pontos de brindes) e HubSpot (§4.3). A trava de fidelidade
   * (`remainingCancelation`) é do front/BFF, não da API (§6.1). A taxa de cancelamento antecipado
   * (§6.4) é aplicada caso a caso pelo CS: o BFF não a calcula nem a cobra.
   */
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
