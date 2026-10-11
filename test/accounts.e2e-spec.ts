import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, bootTestApp, login } from './helpers';

describe('Login + dashboard das 11 contas fake', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootTestApp();
  });
  afterAll(() => app.close());

  const dashboard = async (email: string) => {
    const { accessToken, user } = await login(app, email);
    const res = await request(app.getHttpServer()).get('/v1/me/dashboard').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.email).toBe(email);
    return res.body;
  };

  it('ativa@teste.com: Anual ativa, 2 créditos, cobrança em ~12 dias, pedido em trânsito', async () => {
    const d = await dashboard('ativa@teste.com');
    expect(d.subscription.status).toBe('active');
    expect(d.subscription.frequency).toBe('Anual');
    expect(d.subscription.pauseCreditsLeft).toBe(2);
    const days = (new Date(d.subscription.nextBillingAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(11);
    expect(days).toBeLessThan(13);
    expect(d.capabilities.canEdit.allowed).toBe(true);
    expect(d.capabilities.canEdit.closesAt).toMatch(/T00:00:00-0[23]:00$/); // D-3 00:00 em São Paulo
    expect(d.capabilities.canPause).toEqual({
      allowed: true,
      closesAt: d.capabilities.canEdit.closesAt,
      creditsLeft: 2,
      maxCycles: 2,
    });
    expect(d.tracking.status).toBe('in_transit');
    expect(d.latestBill.status).toBe('paid');
    expect(d.subscription).not.toHaveProperty('cancellationBlocked');
    expect(d.banners.length).toBeGreaterThan(0);
    expect(d.wallet.points).toBeGreaterThan(0);
  });

  it('janela@teste.com: Semestral com janela D-3 fechada (edição e pedido de pausa)', async () => {
    const d = await dashboard('janela@teste.com');
    expect(d.subscription.frequency).toBe('Semestral');
    expect(d.capabilities.canEdit.allowed).toBe(false);
    expect(d.capabilities.canEdit.reason).toBe('EDIT_WINDOW_CLOSED');
    expect(d.capabilities.canEdit.until).toMatch(/-03:00$/);
    expect(d.capabilities.canPause).toMatchObject({
      allowed: false,
      reason: 'PAUSE_WINDOW_CLOSED',
      creditsLeft: 1,
    });
    expect(d.capabilities.canPause.until).toBe(d.capabilities.canEdit.until);
  });

  it('pausada@teste.com: Anual pausada, 1 ciclo pausado já faturado em R$ 0, falta 1', async () => {
    const d = await dashboard('pausada@teste.com');
    expect(d.subscription.status).toBe('paused');
    expect(d.subscription.pause.remainingCycles).toBe(1);
    expect(d.subscription.pauseCreditsLeft).toBe(0);
    expect(d.capabilities.canResume.allowed).toBe(true); // cobrança em 18 dias: antes de D-5
    expect(d.capabilities.canPause.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
    expect(d.latestBill).toMatchObject({
      pausedCycle: true,
      status: 'paid',
      amount: { amount: 0 },
    });
  });

  it('pendente@teste.com: Trimestral com fatura pendente e PIX', async () => {
    const d = await dashboard('pendente@teste.com');
    expect(d.subscription.frequency).toBe('Trimestral');
    expect(d.capabilities.hasPendingBill).toBe(true);
    expect(d.capabilities.pendingBill.pixAvailable).toBe(true);
    expect(d.latestBill.status).toBe('pending');
    expect(d.latestBill.pix.qrCodeText).toBeTruthy();
    expect(d.capabilities.canEdit.reason).toBe('PENDING_BILL');
    expect(d.capabilities.canPause.reason).toBe('FREQUENCY_NOT_ELIGIBLE');
  });

  it('agendada@teste.com: Anual com mudança agendada', async () => {
    const d = await dashboard('agendada@teste.com');
    expect(d.subscription.scheduledChange).toBeDefined();
    expect(d.subscription.scheduledChange.appliesAt).toBe(d.subscription.nextBillingAt);
    expect(d.subscription.scheduledChange.items.length).toBe(3);
  });

  it('cancelada@teste.com: cancelada há 20 dias, pode reativar', async () => {
    const d = await dashboard('cancelada@teste.com');
    expect(d.subscription.status).toBe('canceled');
    expect(d.user.hasSubscription).toBe(false);
    expect(d.lastCanceled.subscriptionId).toBe(d.subscription.id);
    const days = (Date.now() - new Date(d.lastCanceled.canceledAt).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(20);
    expect(d.capabilities.canReactivate.allowed).toBe(true);
    expect(d.capabilities.canCancel.allowed).toBe(false);
  });

  it('analise@teste.com: fraud_review sem ações', async () => {
    const d = await dashboard('analise@teste.com');
    expect(d.subscription.status).toBe('fraud_review');
    for (const key of ['canEdit', 'canPause', 'canCancel', 'canChangeCard', 'canChangeAddress']) {
      expect(d.capabilities[key]).toMatchObject({ allowed: false, reason: 'UNDER_REVIEW' });
    }
    expect(d.latestBill.status).toBe('review');
  });

  it('mensal@teste.com: Mensal sem créditos de pausa', async () => {
    const d = await dashboard('mensal@teste.com');
    expect(d.subscription.frequency).toBe('Mensal');
    expect(d.subscription.remainingCommitmentMonths).toBe(-1);
    expect(d.capabilities.canPause).toMatchObject({
      allowed: false,
      reason: 'FREQUENCY_NOT_ELIGIBLE',
      creditsLeft: 0,
    });
    expect(d.capabilities.canCancel.earlyWindow).toBe(false);
  });

  it('novata@teste.com: Anual com 1 cobrança paga, ainda não pode pausar', async () => {
    const d = await dashboard('novata@teste.com');
    expect(d.subscription.frequency).toBe('Anual');
    expect(d.subscription.paidCycles).toBe(1);
    expect(d.capabilities.canPause).toEqual({
      allowed: false,
      reason: 'MIN_PAID_CYCLES',
      creditsLeft: 2,
      maxCycles: 2,
    });
    expect(d.capabilities.canEdit.allowed).toBe(true);
    expect(d.capabilities.canCancel.reason).toBe('COMMITMENT_ACTIVE');
  });

  it('fim-fidelidade@teste.com: Anual com fidelidade cumprida, pode cancelar', async () => {
    const d = await dashboard('fim-fidelidade@teste.com');
    expect(d.subscription.remainingCommitmentMonths).toBe(0);
    expect(d.capabilities.canCancel).toMatchObject({
      allowed: true,
      remainingCommitmentMonths: 0,
      earlyWindow: false,
    });
    expect(d.capabilities.canCancel.commitmentEndsAt).toMatch(/-03:00$/);
    expect(d.capabilities.canPause.allowed).toBe(true);
  });

  it('semassinatura@teste.com: sem assinatura', async () => {
    const d = await dashboard('semassinatura@teste.com');
    expect(d.subscription).toBeNull();
    expect(d.user.hasSubscription).toBe(false);
    expect(d.capabilities.canEdit.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
    const { accessToken } = await login(app, 'semassinatura@teste.com');
    const sub = await request(app.getHttpServer())
      .get('/v1/me/subscription')
      .set(auth(accessToken));
    expect(sub.status).toBe(404);
    expect(sub.body.code).toBe('NO_SUBSCRIPTION');
  });

  it('senha errada → 401 no formato {code,message}', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'ativa@teste.com', password: 'errada' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS', message: expect.any(String) });
  });

  it('body inválido → 400 VALIDATION_ERROR com details', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'não-é-email', password: 'x', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('sem token → 401; rotas públicas funcionam', async () => {
    expect((await request(app.getHttpServer()).get('/v1/me')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/v1/health')).body).toEqual({ status: 'ok' });
    expect((await request(app.getHttpServer()).get('/v1/config')).body.links.privacy).toBeTruthy();
    expect((await request(app.getHttpServer()).get('/v1/payments/vindi-config')).body.sandbox).toBe(
      true,
    );
  });
});
