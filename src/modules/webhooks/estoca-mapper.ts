import { Fulfillment } from '../../contracts/api';
import { TrackingUpdate } from '../../ports';

/** Payload v1 da Estoca (POST /webhooks/estoca/tracking/v1 na Prime API). */
export interface EstocaV1Payload {
  eventType: string;
  data: {
    trackings: Array<{
      estocaStatus: string;
      trackingCode?: string;
      marketplaceOrderId: string;
      lastStatusDate?: string;
      carrier?: string;
    }>;
  };
}

/** Payload v2 da Estoca (POST /webhooks/estoca/tracking na Prime API). */
export interface EstocaV2Payload {
  url?: string;
  macro_status: string;
  status?: string;
  order: { external_id: string };
  tracking_code?: string;
  carrier?: string;
  event_id?: string;
  occurred_at?: string;
}

export interface NormalizedTrackingEvent {
  externalId: string;
  dedupeKey: string;
  update: TrackingUpdate;
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Mapeia o texto de status da Estoca para o status interno do rastreio. */
export function mapEstocaStatus(status: string): Fulfillment['status'] {
  const s = normalize(status ?? '');
  if (/entregue|delivered/.test(s)) return 'delivered';
  if (/saiu para entrega|rota de entrega|out for delivery/.test(s)) return 'out_for_delivery';
  if (/em transito|transferencia|chegada na filial|in transit/.test(s)) return 'in_transit';
  if (/enviado|despachado|coletado|postado|shipped/.test(s)) return 'shipped';
  if (/extraviad|devolvid|falha|cancelad|insucesso|roubo|avaria|failed/.test(s)) return 'failed';
  if (/separacao|pronto para envio|faturado|processando|processing/.test(s)) return 'processing';
  return 'pending';
}

export function isV1(body: unknown): body is EstocaV1Payload {
  const b = body as Partial<EstocaV1Payload>;
  return Boolean(b && typeof b === 'object' && b.data && Array.isArray(b.data.trackings));
}

export function isV2(body: unknown): body is EstocaV2Payload {
  const b = body as Partial<EstocaV2Payload>;
  return Boolean(
    b &&
      typeof b === 'object' &&
      b.order &&
      typeof b.order.external_id === 'string' &&
      typeof b.macro_status === 'string',
  );
}

/** Converte qualquer um dos dois formatos em uma lista de eventos normalizados. */
export function normalizeEstoca(body: unknown, receivedAt: Date): NormalizedTrackingEvent[] {
  if (isV1(body)) {
    return body.data.trackings
      .filter((t) => t.marketplaceOrderId)
      .map((t) => {
        const occurredAt = t.lastStatusDate ?? receivedAt.toISOString();
        return {
          externalId: String(t.marketplaceOrderId),
          dedupeKey: `v1:${t.marketplaceOrderId}:${normalize(t.estocaStatus)}:${occurredAt}`,
          update: {
            status: mapEstocaStatus(t.estocaStatus),
            description: t.estocaStatus,
            occurredAt,
            carrier: t.carrier,
            trackingCode: t.trackingCode,
          },
        };
      });
  }
  if (isV2(body)) {
    const occurredAt = body.occurred_at ?? receivedAt.toISOString();
    const description = body.status ? `${body.macro_status} — ${body.status}` : body.macro_status;
    return [
      {
        externalId: String(body.order.external_id),
        dedupeKey: body.event_id
          ? `v2:${body.event_id}`
          : `v2:${body.order.external_id}:${normalize(description)}:${occurredAt}`,
        update: {
          status: mapEstocaStatus(body.status ?? body.macro_status),
          description,
          occurredAt,
          carrier: body.carrier,
          trackingCode: body.tracking_code,
          trackingUrl: body.url,
        },
      },
    ];
  }
  return [];
}
