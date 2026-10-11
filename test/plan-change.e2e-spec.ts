import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, bootTestApp, login } from './helpers';

/**
 * Troca de plano (docs/contexto-prime.md §4.3, caso B): a Prime API cria uma assinatura nova com
 * status `future` e cancela a atual com motivo "Upgrade de Plano". Para o app isso significa que
 * o `id` da assinatura muda; por isso o BFF nunca recebe id do app e resolve sempre a
 * "assinatura corrente do cliente" a cada requisição (OwnershipService/OwnershipGuard).
 */
describe('Troca de plano: id da assinatura muda e as rotas /me continuam funcionando', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootTestApp();
  });
  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());

  it('Mensal → Anual (mensal@teste.com): nasce assinatura future com id novo; a original é cancelada', async () => {
    const { accessToken } = await login(app, 'mensal@teste.com');
    const before = await api().get('/v1/me/subscription').set(auth(accessToken));
    expect(before.status).toBe(200);
    const originalId: string = before.body.id;
    expect(before.body.frequency).toBe('Mensal');
    const originalItemId: string = before.body.items[0].id;

    const sch = await api()
      .post('/v1/me/subscription/scheduling')
      .set(auth(accessToken))
      .send({
        frequency: 'Anual',
        items: [
          { handle: 'supercoffee-3-0-chocolate-economic', quantity: 1 },
          { handle: 'morning-shot', quantity: 1 },
        ],
      });
    expect(sch.status).toBe(201);
    expect(sch.body.frequency).toBe('Anual');

    // GET /me/subscription devolve a assinatura corrente do cliente: a nova, `future`.
    const after = await api().get('/v1/me/subscription').set(auth(accessToken));
    expect(after.status).toBe(200);
    expect(after.body.id).not.toBe(originalId);
    expect(after.body.status).toBe('future');
    expect(after.body.frequency).toBe('Anual');
    expect(after.body.nextBillingAt).toBe(before.body.nextBillingAt);
    expect(after.body.startedAt).toBe(before.body.nextBillingAt);
    expect(after.body.paidCycles).toBe(0);
    expect(after.body.remainingCommitmentMonths).toBe(12);
    expect(after.body.scheduledChange.id).toBe(sch.body.id);

    // Dashboard: continua funcionando, mostra a futura e registra o "cancelamento" automático
    // da original como migração ("Upgrade de Plano"), não como saída do cliente.
    const dash = await api().get('/v1/me/dashboard').set(auth(accessToken));
    expect(dash.status).toBe(200);
    expect(dash.body.subscription.id).toBe(after.body.id);
    expect(dash.body.user.hasSubscription).toBe(true);
    expect(dash.body.lastCanceled).toMatchObject({
      reason: 'Upgrade de Plano',
      subscriptionId: originalId,
    });
    // `future` ainda não pode ser editada nem pausada; o app mostra a mudança agendada.
    expect(dash.body.capabilities.canEdit.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
    expect(dash.body.capabilities.canPause.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');

    // Rotas que dependem do id interno continuam resolvendo por cliente, não por id guardado.
    expect((await api().get('/v1/me/bills').set(auth(accessToken))).status).toBe(200);
    expect((await api().get('/v1/me/shipping-address').set(auth(accessToken))).status).toBe(200);
    expect((await api().get('/v1/me/savings').set(auth(accessToken))).status).toBe(200);

    // Item da assinatura antiga não pertence mais à assinatura corrente → 403 (OwnershipGuard).
    const foreign = await api()
      .patch(`/v1/me/subscription/items/${originalItemId}/recurrence`)
      .set(auth(accessToken))
      .send({ recurrence: null });
    expect(foreign.status).toBe(403);

    // Desfazer o agendamento reativa a original (id antigo volta) e apaga a futura.
    const undo = await api().delete('/v1/me/subscription/scheduling').set(auth(accessToken));
    expect(undo.status).toBe(204);
    const restored = await api().get('/v1/me/subscription').set(auth(accessToken));
    expect(restored.body.id).toBe(originalId);
    expect(restored.body.status).toBe('active');
    expect(restored.body.frequency).toBe('Mensal');
    expect(restored.body.scheduledChange).toBeUndefined();
    const dash2 = await api().get('/v1/me/dashboard').set(auth(accessToken));
    expect(dash2.body.lastCanceled).toBeUndefined();
  });

  it('mesma fidelidade (caso A, ativa@teste.com): o id NÃO muda', async () => {
    const { accessToken } = await login(app, 'ativa@teste.com');
    const before = await api().get('/v1/me/subscription').set(auth(accessToken));
    const sch = await api()
      .post('/v1/me/subscription/scheduling')
      .set(auth(accessToken))
      .send({
        frequency: 'Anual',
        items: [{ handle: 'supercoffee-3-0-vanilla-380g', quantity: 2 }],
      });
    expect(sch.status).toBe(201);
    const after = await api().get('/v1/me/subscription').set(auth(accessToken));
    expect(after.body.id).toBe(before.body.id);
    expect(after.body.status).toBe('active');
    expect(after.body.scheduledChange.id).toBe(sch.body.id);
  });
});
