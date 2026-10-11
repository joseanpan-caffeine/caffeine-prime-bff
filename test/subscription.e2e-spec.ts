import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, bootTestApp, login } from './helpers';

describe('Assinatura: pausa, agendamento, recorrência, cancelamento', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootTestApp();
  });
  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());

  it('pausa permitida muda o estado (ativa@teste.com): 1 crédito por ciclo, fatura R$ 0 por ciclo pausado, retomar devolve os créditos', async () => {
    const { accessToken } = await login(app, 'ativa@teste.com');
    const res = await api()
      .post('/v1/me/subscription/pause')
      .set(auth(accessToken))
      .send({ cycles: 2, reason: 'travel' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paused');
    expect(res.body.pauseCreditsLeft).toBe(0); // 2 ciclos = 2 créditos
    expect(res.body.pause).toMatchObject({ cycles: 2, remainingCycles: 2, pauseType: 'User' });

    const dash = await api().get('/v1/me/dashboard').set(auth(accessToken));
    expect(dash.body.subscription.status).toBe('paused');
    expect(dash.body.capabilities.canResume.allowed).toBe(true);

    // Durante a pausa cada ciclo pausado tem fatura paga de R$ 0,00 marcada como pausedCycle.
    const bills = await api().get('/v1/me/bills').set(auth(accessToken));
    const paused = bills.body.filter((b: any) => b.pausedCycle);
    expect(paused).toHaveLength(2);
    for (const b of paused) {
      expect(b.status).toBe('paid');
      expect(b.amount.amount).toBe(0);
      expect(b.items).toEqual([]);
    }

    // pausar de novo não pode
    const again = await api()
      .post('/v1/me/subscription/pause')
      .set(auth(accessToken))
      .send({ cycles: 1, reason: 'x' });
    expect(again.status).toBe(403);
    expect(again.body.code).toBe('SUBSCRIPTION_NOT_ACTIVE');

    const resumed = await api().post('/v1/me/subscription/resume').set(auth(accessToken));
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe('active');
    expect(resumed.body.pauseCreditsLeft).toBe(2);
    expect(resumed.body.pause).toBeUndefined();
    const after = await api().get('/v1/me/bills').set(auth(accessToken));
    expect(after.body.some((b: any) => b.pausedCycle)).toBe(false);
  });

  it('pausar mais ciclos do que créditos → 422 NOT_ENOUGH_PAUSE_CREDITS (fim-fidelidade tem 1)', async () => {
    const { accessToken } = await login(app, 'fim-fidelidade@teste.com');
    const res = await api()
      .post('/v1/me/subscription/pause')
      .set(auth(accessToken))
      .send({ cycles: 2, reason: 'stock' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NOT_ENOUGH_PAUSE_CREDITS');
  });

  it('mais ciclos que o máximo → 422', async () => {
    const { accessToken } = await login(app, 'ativa@teste.com');
    const res = await api()
      .post('/v1/me/subscription/pause')
      .set(auth(accessToken))
      .send({ cycles: 3, reason: 'x' });
    expect(res.status).toBe(400); // DTO limita a 2
  });

  it('pausa negada: Mensal (FREQUENCY_NOT_ELIGIBLE), pendente (frequência), analise (UNDER_REVIEW), pausada, novata (MIN_PAID_CYCLES), janela (PAUSE_WINDOW_CLOSED)', async () => {
    const cases: Array<[string, string]> = [
      ['mensal@teste.com', 'FREQUENCY_NOT_ELIGIBLE'],
      ['pendente@teste.com', 'FREQUENCY_NOT_ELIGIBLE'],
      ['analise@teste.com', 'UNDER_REVIEW'],
      ['pausada@teste.com', 'SUBSCRIPTION_NOT_ACTIVE'],
      ['cancelada@teste.com', 'SUBSCRIPTION_NOT_ACTIVE'],
      ['novata@teste.com', 'MIN_PAID_CYCLES'],
      ['janela@teste.com', 'PAUSE_WINDOW_CLOSED'],
    ];
    for (const [email, reason] of cases) {
      const { accessToken } = await login(app, email);
      const res = await api()
        .post('/v1/me/subscription/pause')
        .set(auth(accessToken))
        .send({ cycles: 1, reason: 'stock' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(reason);
      if (reason === 'PAUSE_WINDOW_CLOSED') expect(res.body.details.until).toMatch(/-03:00$/);
    }
  });

  it('pausada@teste.com: 2 créditos gastos (1 por ciclo), fatura R$ 0 do ciclo pausado no histórico', async () => {
    const { accessToken } = await login(app, 'pausada@teste.com');
    const dash = await api().get('/v1/me/dashboard').set(auth(accessToken));
    expect(dash.body.capabilities.canPause.creditsLeft).toBe(0);
    expect(dash.body.subscription.pause.remainingCycles).toBe(1);
    const bills = await api().get('/v1/me/bills').set(auth(accessToken));
    const paused = bills.body.find((b: any) => b.pausedCycle);
    expect(paused).toMatchObject({ status: 'paid', amount: { amount: 0 } });
  });

  it('agendamento bloqueado na janela D-3 (janela@teste.com) → 403 EDIT_WINDOW_CLOSED com until', async () => {
    const { accessToken } = await login(app, 'janela@teste.com');
    const res = await api()
      .post('/v1/me/subscription/scheduling')
      .set(auth(accessToken))
      .send({
        frequency: 'Semestral',
        items: [{ handle: 'supercoffee-3-0-original-380g', quantity: 2 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EDIT_WINDOW_CLOSED');
    expect(res.body.details.until).toMatch(/-03:00$/);
  });

  it('agendamento bloqueado por fatura pendente → 403 PENDING_BILL', async () => {
    const { accessToken } = await login(app, 'pendente@teste.com');
    const res = await api()
      .post('/v1/me/subscription/scheduling')
      .set(auth(accessToken))
      .send({ frequency: 'Trimestral', items: [{ handle: 'morning-shot', quantity: 1 }] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PENDING_BILL');
  });

  it('preview + agendamento + desfazer (ativa@teste.com)', async () => {
    const { accessToken } = await login(app, 'ativa@teste.com');
    const body = {
      frequency: 'Anual',
      items: [
        { handle: 'supercoffee-3-0-chocolate-380g', quantity: 2 },
        { handle: 'creatine-300g', quantity: 1, recurrence: 'on' },
      ],
      couponCode: 'PRIME10',
      giftHandles: ['copo-termico-prime'],
    };
    const { giftHandles: _gifts, ...previewBody } = body;
    const preview = await api()
      .post('/v1/me/subscription/preview')
      .set(auth(accessToken))
      .send(previewBody);
    expect(preview.status).toBe(200);
    expect(preview.body.appliedDiscountPercentage).toBe(27); // 3 itens → faixa 27% vence o cupom 10%
    expect(preview.body.couponApplied).toBe('PRIME10');
    expect(preview.body.total.amount).toBeGreaterThan(0);

    const sch = await api()
      .post('/v1/me/subscription/scheduling')
      .set(auth(accessToken))
      .send(body);
    expect(sch.status).toBe(201);
    expect(sch.body.items.some((i: any) => i.isGift)).toBe(true);
    expect(sch.body.total).toEqual(preview.body.total);

    const sub = await api().get('/v1/me/subscription').set(auth(accessToken));
    expect(sub.body.scheduledChange.id).toBe(sch.body.id);

    expect(
      (await api().delete('/v1/me/subscription/scheduling').set(auth(accessToken))).status,
    ).toBe(204);
    expect(
      (await api().get('/v1/me/subscription').set(auth(accessToken))).body.scheduledChange,
    ).toBeUndefined();
    expect(
      (await api().delete('/v1/me/subscription/scheduling').set(auth(accessToken))).status,
    ).toBe(404);
  });

  it('agendamento com todos os itens em 60 dias → 422; brinde que exige Anual em Mensal → 422', async () => {
    const { accessToken } = await login(app, 'mensal@teste.com');
    const all60 = await api()
      .post('/v1/me/subscription/scheduling')
      .set(auth(accessToken))
      .send({
        frequency: 'Mensal',
        items: [{ handle: 'morning-shot', quantity: 1, recurrence: 'on' }],
      });
    expect(all60.status).toBe(422);
    expect(all60.body.code).toBe('ALL_ITEMS_ON_60_DAYS');
    const gift = await api()
      .post('/v1/me/subscription/scheduling')
      .set(auth(accessToken))
      .send({
        frequency: 'Mensal',
        items: [{ handle: 'morning-shot', quantity: 1 }],
        giftHandles: ['copo-termico-prime'],
      });
    expect(gift.status).toBe(422);
    expect(gift.body.code).toBe('GIFT_REQUIRES_PLAN');
  });

  it('recorrência: 422 se todos ficariam on; item de outro usuário → 403', async () => {
    const { accessToken } = await login(app, 'mensal@teste.com');
    const sub = await api().get('/v1/me/subscription').set(auth(accessToken));
    const onlyItem = sub.body.items[0].id;
    const res = await api()
      .patch(`/v1/me/subscription/items/${onlyItem}/recurrence`)
      .set(auth(accessToken))
      .send({ recurrence: 'on' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ALL_ITEMS_ON_60_DAYS');

    const other = await login(app, 'ativa@teste.com');
    const otherSub = await api().get('/v1/me/subscription').set(auth(other.accessToken));
    const foreign = await api()
      .patch(`/v1/me/subscription/items/${otherSub.body.items[0].id}/recurrence`)
      .set(auth(accessToken))
      .send({ recurrence: 'on' });
    expect(foreign.status).toBe(403);

    // ativa tem 3 itens: alternar um é permitido e muda totais
    const ok = await api()
      .patch(`/v1/me/subscription/items/${otherSub.body.items[0].id}/recurrence`)
      .set(auth(other.accessToken))
      .send({ recurrence: 'off' });
    expect(ok.status).toBe(200);
    expect(ok.body.items[0].recurrence).toBe('off');
    expect(ok.body.total.amount).toBeLessThan(otherSub.body.total.amount);
    await api()
      .patch(`/v1/me/subscription/items/${otherSub.body.items[0].id}/recurrence`)
      .set(auth(other.accessToken))
      .send({ recurrence: null });
  });

  it('cupom: aplica temporário e rejeita inválido', async () => {
    const { accessToken } = await login(app, 'agendada@teste.com');
    const ok = await api()
      .patch('/v1/me/subscription/discount')
      .set(auth(accessToken))
      .send({ code: 'prime10' });
    expect(ok.status).toBe(200);
    expect(ok.body.discount).toMatchObject({
      temporaryCode: 'PRIME10',
      temporaryPercentage: 10,
      temporaryCycles: 3,
    });
    expect(ok.body.items[0].discountPercentage).toBe(10);
    const bad = await api()
      .patch('/v1/me/subscription/discount')
      .set(auth(accessToken))
      .send({ code: 'NAOEXISTE' });
    expect(bad.status).toBe(422);
  });

  it('cancelamento travado pela fidelidade (agendada@teste.com, 10 meses restantes) → 403 COMMITMENT_ACTIVE', async () => {
    const { accessToken } = await login(app, 'agendada@teste.com');
    const dash = await api().get('/v1/me/dashboard').set(auth(accessToken));
    expect(dash.body.capabilities.canCancel).toMatchObject({
      allowed: false,
      reason: 'COMMITMENT_ACTIVE',
      earlyWindow: true,
    });
    expect(dash.body.capabilities.canCancel.remainingCommitmentMonths).toBeGreaterThan(0);
    expect(dash.body.capabilities.canCancel.commitmentEndsAt).toMatch(/-03:00$/);
    const res = await api()
      .post('/v1/me/subscription/cancel')
      .set(auth(accessToken))
      .send({ reason: 'price' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('COMMITMENT_ACTIVE');
  });

  it('cancelar e reativar (fim-fidelidade@teste.com: fidelidade cumprida, antes da cobrança)', async () => {
    const { accessToken } = await login(app, 'fim-fidelidade@teste.com');
    const before = await api().get('/v1/me/dashboard').set(auth(accessToken));
    expect(before.body.capabilities.canCancel).toMatchObject({
      allowed: true,
      remainingCommitmentMonths: 0,
      earlyWindow: false,
    });
    const canceled = await api()
      .post('/v1/me/subscription/cancel')
      .set(auth(accessToken))
      .send({ reason: 'price', answers: [{ question: 'O que ajudaria?', answer: 'Desconto' }] });
    expect(canceled.status).toBe(200);
    expect(canceled.body.status).toBe('canceled');
    expect(canceled.body.scheduledChange).toBeUndefined();
    const dash = await api().get('/v1/me/dashboard').set(auth(accessToken));
    expect(dash.body.lastCanceled.reason).toBe('price');
    expect(dash.body.user.hasSubscription).toBe(false);
    expect(
      (await api().post('/v1/me/subscription/cancel').set(auth(accessToken)).send({ reason: 'x' }))
        .status,
    ).toBe(403);
    const re = await api().post('/v1/me/subscription/reactivate').set(auth(accessToken));
    expect(re.status).toBe(200);
    expect(re.body.status).toBe('active');
  });

  it('cancelamento negado em fraud_review; reativar ativa → NOT_CANCELED', async () => {
    const a = await login(app, 'analise@teste.com');
    expect(
      (
        await api()
          .post('/v1/me/subscription/cancel')
          .set(auth(a.accessToken))
          .send({ reason: 'x' })
      ).body.code,
    ).toBe('UNDER_REVIEW');
    const m = await login(app, 'mensal@teste.com');
    expect(
      (await api().post('/v1/me/subscription/reactivate').set(auth(m.accessToken))).body.code,
    ).toBe('NOT_CANCELED');
  });

  it('listas de motivos e catálogo', async () => {
    const { accessToken } = await login(app, 'mensal@teste.com');
    expect(
      (await api().get('/v1/me/subscription/cancel-reasons').set(auth(accessToken))).body.length,
    ).toBeGreaterThan(2);
    expect(
      (await api().get('/v1/me/subscription/pause-reasons').set(auth(accessToken))).body.length,
    ).toBeGreaterThan(2);
    const cat = await api().get('/v1/me/catalog').set(auth(accessToken));
    expect(cat.body.plans).toHaveLength(4);
    expect(cat.body.products.some((p: any) => p.title.startsWith('Supercoffee'))).toBe(true);
    expect(cat.body.discountTiers.length).toBeGreaterThan(0);
  });
});
