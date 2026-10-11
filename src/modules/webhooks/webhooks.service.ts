import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationPreferences } from '../../contracts/api';
import { AppError } from '../../common/errors';
import {
  CLOCK,
  Clock,
  DEVICE_STORE,
  DeviceStore,
  NOTIFICATION_PREFERENCES_STORE,
  NotificationPreferencesStore,
  PUSH_SENDER,
  PushMessage,
  PushSender,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
  toPushTargets,
  WEBHOOK_EVENT_STORE,
  WebhookEventStore,
} from '../../ports';
import { normalizeEstoca } from './estoca-mapper';

/** Formato (parcial) do postback da Vindi. */
export interface VindiWebhookPayload {
  event?: {
    id?: string | number;
    type?: string;
    created_at?: string;
    data?: {
      bill?: { id?: string | number; status?: string; customer?: { id?: number } };
      charge?: { id?: string | number; bill?: { id?: string | number } };
    };
  };
}

const STATUS_LABELS: Record<string, { title: string; body: string }> = {
  processing: { title: 'Pedido confirmado', body: 'Seu pedido está em separação.' },
  shipped: { title: 'Pedido enviado', body: 'Seu Supercoffee saiu do centro de distribuição.' },
  in_transit: { title: 'Pedido em trânsito', body: 'Seu pedido está a caminho.' },
  out_for_delivery: { title: 'Saiu para entrega', body: 'Seu pedido chega hoje!' },
  delivered: { title: 'Pedido entregue', body: 'Aproveite seu Supercoffee.' },
  failed: {
    title: 'Problema na entrega',
    body: 'Houve um problema com a entrega. Fale com o suporte.',
  },
  pending: {
    title: 'Atualização do pedido',
    body: 'Há uma atualização no rastreio do seu pedido.',
  },
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(WEBHOOK_EVENT_STORE) private readonly events: WebhookEventStore,
    @Inject(DEVICE_STORE) private readonly devices: DeviceStore,
    @Inject(NOTIFICATION_PREFERENCES_STORE) private readonly prefs: NotificationPreferencesStore,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handleVindi(
    payload: VindiWebhookPayload,
  ): Promise<{ received: true; duplicate?: boolean; handled?: string }> {
    const event = payload?.event;
    if (!event?.type)
      throw AppError.badRequest('INVALID_PAYLOAD', 'Evento Vindi sem `event.type`.');
    const billId = event.data?.bill?.id ?? event.data?.charge?.bill?.id;
    const externalId = String(
      event.id ?? `${event.type}:${billId ?? 'none'}:${event.created_at ?? ''}`,
    );

    const isNew = await this.events.register('vindi', externalId, payload);
    if (!isNew) return { received: true, duplicate: true };

    switch (event.type) {
      case 'bill_paid': {
        if (billId === undefined) break;
        const result = await this.subscriptions.applyBillPaid(String(billId), this.clock.now());
        if (result) {
          await this.notify(result.customerId, 'billing', {
            title: 'Pagamento confirmado',
            body: `Recebemos o pagamento de R$ ${result.bill.amount.amount.toFixed(2).replace('.', ',')}. Seu pedido já está sendo preparado.`,
            data: { type: 'bill_paid', billId: result.bill.id },
          });
        }
        break;
      }
      case 'charge_rejected': {
        if (billId === undefined) break;
        const found = await this.subscriptions.findBill(String(billId));
        if (found) {
          await this.notify(found.customerId, 'billing', {
            title: 'Pagamento não aprovado',
            body: 'Não conseguimos cobrar seu cartão. Pague via PIX ou atualize o cartão no app.',
            data: { type: 'charge_rejected', billId: found.bill.id },
          });
        }
        break;
      }
      default:
        this.logger.log(`Evento Vindi ${event.type} registrado sem ação`);
    }
    await this.events.markProcessed('vindi', externalId);
    return { received: true, handled: event.type };
  }

  async handleEstoca(
    body: unknown,
  ): Promise<{ received: true; processed: number; duplicates: number; unmatched: number }> {
    const now = this.clock.now();
    const events = normalizeEstoca(body, now);
    if (events.length === 0)
      throw AppError.badRequest('INVALID_PAYLOAD', 'Payload Estoca não reconhecido (v1 ou v2).');

    let processed = 0;
    let duplicates = 0;
    let unmatched = 0;
    for (const evt of events) {
      const isNew = await this.events.register('estoca', evt.dedupeKey, body);
      if (!isNew) {
        duplicates++;
        continue;
      }
      const result = await this.subscriptions.applyTrackingUpdate(evt.externalId, evt.update);
      if (!result) {
        unmatched++;
        this.logger.warn(`Estoca: pedido ${evt.externalId} não encontrado`);
        continue;
      }
      const label = STATUS_LABELS[evt.update.status];
      await this.notify(result.customerId, 'shipping', {
        ...label,
        data: { type: 'tracking', billId: result.bill.id, status: evt.update.status },
      });
      await this.events.markProcessed('estoca', evt.dedupeKey);
      processed++;
    }
    return { received: true, processed, duplicates, unmatched };
  }

  private async notify(
    customerId: string,
    channel: keyof NotificationPreferences,
    message: PushMessage,
  ) {
    const prefs = await this.prefs.get(customerId);
    if (!prefs[channel]) return;
    const devices = await this.devices.listByCustomer(customerId);
    await this.push.send(toPushTargets(devices), message);
  }
}
