import { mapEstocaStatus, normalizeEstoca } from './estoca-mapper';

describe('estoca-mapper', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');

  it('mapeia status em português', () => {
    expect(mapEstocaStatus('Em trânsito')).toBe('in_transit');
    expect(mapEstocaStatus('Saiu para entrega')).toBe('out_for_delivery');
    expect(mapEstocaStatus('Entregue')).toBe('delivered');
    expect(mapEstocaStatus('Extraviado')).toBe('failed');
    expect(mapEstocaStatus('Chegada na Filial')).toBe('in_transit');
    expect(mapEstocaStatus('???')).toBe('pending');
  });

  it('normaliza payload v1', () => {
    const events = normalizeEstoca(
      {
        eventType: 'tracking',
        data: {
          trackings: [
            {
              estocaStatus: 'Em trânsito',
              trackingCode: '48B',
              marketplaceOrderId: '123',
              lastStatusDate: '2026-04-23T03:14:47Z',
              carrier: 'loggi',
            },
          ],
        },
      },
      now,
    );
    expect(events).toHaveLength(1);
    expect(events[0].externalId).toBe('123');
    expect(events[0].update).toMatchObject({
      status: 'in_transit',
      carrier: 'loggi',
      trackingCode: '48B',
      occurredAt: '2026-04-23T03:14:47Z',
    });
  });

  it('normaliza payload v2', () => {
    const events = normalizeEstoca(
      {
        url: 'https://t/abc',
        macro_status: 'Em trânsito',
        status: 'Chegada na Filial',
        order: { external_id: '999' },
      },
      now,
    );
    expect(events[0]).toMatchObject({
      externalId: '999',
      update: {
        status: 'in_transit',
        trackingUrl: 'https://t/abc',
        description: 'Em trânsito — Chegada na Filial',
      },
    });
  });

  it('payload desconhecido retorna vazio', () => {
    expect(normalizeEstoca({ foo: 1 }, now)).toEqual([]);
  });
});
