import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, bootTestApp, login } from './helpers';

describe('Pagamentos: propriedade (403), PIX via webhook, cartões, idempotência', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootTestApp();
  });
  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());

  it('fatura de outro usuário → 403 em GET e em todas as formas de pagamento', async () => {
    const victim = await login(app, 'pendente@teste.com');
    const bills = await api().get('/v1/me/bills').set(auth(victim.accessToken));
    const pendingId = bills.body.find((b: any) => b.status === 'pending').id;

    const attacker = await login(app, 'ativa@teste.com');
    for (const [method, path, body] of [
      ['get', `/v1/me/bills/${pendingId}`, undefined],
      ['post', `/v1/me/bills/${pendingId}/pay/pix`, undefined],
      ['post', `/v1/me/bills/${pendingId}/pay/current-card`, undefined],
      ['post', `/v1/me/bills/${pendingId}/pay/new-card`, { gatewayToken: 'tok_visa_1111' }],
    ] as const) {
      const res = await (api() as any)[method](path).set(auth(attacker.accessToken)).send(body);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    // id inexistente também é 403 (não vaza existência)
    expect(
      (await api().get('/v1/me/bills/bill-nao-existe').set(auth(attacker.accessToken))).status,
    ).toBe(403);
    // e a vítima continua com a fatura pendente
    const check = await api().get(`/v1/me/bills/${pendingId}`).set(auth(victim.accessToken));
    expect(check.status).toBe(200);
    expect(check.body.status).toBe('pending');
  });

  it('cartão de outro usuário → 403 ao remover', async () => {
    const owner = await login(app, 'ativa@teste.com');
    const profiles = await api().get('/v1/me/payment-profiles').set(auth(owner.accessToken));
    const attacker = await login(app, 'mensal@teste.com');
    const res = await api()
      .delete(`/v1/me/payment-profiles/${profiles.body[0].id}`)
      .set(auth(attacker.accessToken));
    expect(res.status).toBe(403);
    expect(
      (await api().get('/v1/me/payment-profiles').set(auth(owner.accessToken))).body,
    ).toHaveLength(2);
  });

  it('PIX: gera cobrança, fica pendente até o webhook bill_paid; webhook duplicado é ignorado', async () => {
    const { accessToken } = await login(app, 'pendente@teste.com');
    const pending = (await api().get('/v1/me/bills').set(auth(accessToken))).body.find(
      (b: any) => b.status === 'pending',
    );

    const pix = await api().post(`/v1/me/bills/${pending.id}/pay/pix`).set(auth(accessToken));
    expect(pix.status).toBe(200);
    expect(pix.body.status).toBe('pending');
    expect(pix.body.pix.qrCodeText).toContain(pending.id);

    // registra um dispositivo para receber o push
    expect(
      (
        await api().post('/v1/me/devices').set(auth(accessToken)).send({
          expoPushToken: 'ExponentPushToken[pendente]',
          platform: 'android',
          appVersion: '1.0.0',
        })
      ).status,
    ).toBe(201);

    // segredo errado
    expect(
      (
        await api()
          .post('/v1/webhooks/vindi?secret=errado')
          .send({ event: { type: 'bill_paid', data: { bill: { id: pending.id } } } })
      ).status,
    ).toBe(401);

    const hook = await api()
      .post('/v1/webhooks/vindi?secret=dev-secret')
      .send({ event: { id: 'evt-1', type: 'bill_paid', data: { bill: { id: pending.id } } } });
    expect(hook.status).toBe(200);
    expect(hook.body).toEqual({ received: true, handled: 'bill_paid' });

    const dup = await api()
      .post('/v1/webhooks/vindi?secret=dev-secret')
      .send({ event: { id: 'evt-1', type: 'bill_paid', data: { bill: { id: pending.id } } } });
    expect(dup.body).toEqual({ received: true, duplicate: true });

    const bill = await api().get(`/v1/me/bills/${pending.id}`).set(auth(accessToken));
    expect(bill.body.status).toBe('paid');
    expect(bill.body.paymentMethod).toBe('pix');
    expect(bill.body.pix).toBeUndefined();
    expect(bill.body.paidAt).toBeTruthy();

    const dash = await api().get('/v1/me/dashboard').set(auth(accessToken));
    expect(dash.body.capabilities.hasPendingBill).toBe(false);
    expect(dash.body.capabilities.canEdit.allowed).toBe(true);

    // paga de novo → 422
    expect(
      (await api().post(`/v1/me/bills/${pending.id}/pay/pix`).set(auth(accessToken))).status,
    ).toBe(422);
  });

  it('webhook Estoca atualiza o rastreio (v1 e v2) e exige Bearer', async () => {
    const { accessToken } = await login(app, 'ativa@teste.com');
    expect(
      (
        await api()
          .post('/v1/webhooks/estoca')
          .send({ url: 'x', macro_status: 'Entregue', order: { external_id: '90017001' } })
      ).status,
    ).toBe(401);

    const v2 = await api()
      .post('/v1/webhooks/estoca')
      .set('Authorization', 'Bearer dev-freight-token')
      .send({
        url: 'https://tracking.estoca.com.br/abc',
        macro_status: 'Em trânsito',
        status: 'Saiu para entrega',
        order: { external_id: '90017001' },
      });
    expect(v2.body).toEqual({ received: true, processed: 1, duplicates: 0, unmatched: 0 });
    expect((await api().get('/v1/me/tracking').set(auth(accessToken))).body.status).toBe(
      'out_for_delivery',
    );

    const v1 = await api()
      .post('/v1/webhooks/estoca')
      .set('Authorization', 'Bearer dev-freight-token')
      .send({
        eventType: 'tracking',
        data: {
          trackings: [
            {
              estocaStatus: 'Entregue',
              trackingCode: '48B155B3292C',
              marketplaceOrderId: '90017001',
              lastStatusDate: '2026-10-12T10:00:00Z',
              carrier: 'loggi',
            },
          ],
        },
      });
    expect(v1.body.processed).toBe(1);
    const tracking = await api().get('/v1/me/tracking').set(auth(accessToken));
    expect(tracking.body.status).toBe('delivered');
    expect(tracking.body.events.at(-1).description).toBe('Entregue');

    // pedido desconhecido
    const unknown = await api()
      .post('/v1/webhooks/estoca')
      .set('Authorization', 'Bearer dev-freight-token')
      .send({ url: 'x', macro_status: 'Entregue', order: { external_id: 'nope' } });
    expect(unknown.body.unmatched).toBe(1);
    // payload irreconhecível
    expect(
      (
        await api()
          .post('/v1/webhooks/estoca')
          .set('Authorization', 'Bearer dev-freight-token')
          .send({ foo: 1 })
      ).status,
    ).toBe(400);
  });

  it('adicionar cartão, pagar com cartão novo (imediato) e remover', async () => {
    const { accessToken } = await login(app, 'mensal@teste.com');
    const added = await api()
      .post('/v1/me/payment-profiles')
      .set(auth(accessToken))
      .send({ gatewayToken: 'tok_mastercard_5555', setAsDefault: true });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ brand: 'Mastercard', lastFour: '5555', isDefault: true });
    const list = await api().get('/v1/me/payment-profiles').set(auth(accessToken));
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((p: any) => p.isDefault)).toHaveLength(1);
    expect(
      (await api().delete(`/v1/me/payment-profiles/${added.body.id}`).set(auth(accessToken)))
        .status,
    ).toBe(204);
    // último cartão da assinatura ativa não pode ser removido
    const last = (await api().get('/v1/me/payment-profiles').set(auth(accessToken))).body[0];
    expect(
      (await api().delete(`/v1/me/payment-profiles/${last.id}`).set(auth(accessToken))).status,
    ).toBe(422);
    // cartão recusado
    expect(
      (
        await api()
          .post('/v1/me/payment-profiles')
          .set(auth(accessToken))
          .send({ gatewayToken: 'tok_declined_0000' })
      ).status,
    ).toBe(422);
  });

  it('cartão: fraud_review não pode trocar cartão (UNDER_REVIEW)', async () => {
    const { accessToken } = await login(app, 'analise@teste.com');
    const res = await api()
      .post('/v1/me/payment-profiles')
      .set(auth(accessToken))
      .send({ gatewayToken: 'tok_visa_4242' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('UNDER_REVIEW');
  });

  it('Idempotency-Key: mesma chave devolve a resposta armazenada sem reexecutar', async () => {
    const { accessToken } = await login(app, 'agendada@teste.com');
    const headers = { ...auth(accessToken), 'Idempotency-Key': 'add-card-001' };
    const first = await api()
      .post('/v1/me/payment-profiles')
      .set(headers)
      .send({ gatewayToken: 'tok_elo_9999' });
    expect(first.status).toBe(201);
    const second = await api()
      .post('/v1/me/payment-profiles')
      .set(headers)
      .send({ gatewayToken: 'tok_elo_9999' });
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    const list = await api().get('/v1/me/payment-profiles').set(auth(accessToken));
    expect(list.body.filter((p: any) => p.lastFour === '9999')).toHaveLength(1);

    // a chave é por cliente: outro cliente com a mesma chave executa normalmente
    const other = await login(app, 'ativa@teste.com');
    const third = await api()
      .post('/v1/me/payment-profiles')
      .set({ ...auth(other.accessToken), 'Idempotency-Key': 'add-card-001' })
      .send({ gatewayToken: 'tok_elo_9999' });
    expect(third.status).toBe(201);
    expect(third.body.id).not.toBe(first.body.id);
    expect(third.headers['idempotent-replayed']).toBeUndefined();
  });
});
