import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, bootTestApp, login } from './helpers';

describe('Perfil, endereço, dispositivos, preferências, exclusão', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootTestApp();
  });
  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());

  it('perfil: GET /me e PATCH /me/profile', async () => {
    const { accessToken } = await login(app, 'ativa@teste.com');
    const me = await api().get('/v1/me').set(auth(accessToken));
    expect(me.body).toMatchObject({ id: '7001', cpf: '***.***.789-01', hasSubscription: true });
    const upd = await api()
      .patch('/v1/me/profile')
      .set(auth(accessToken))
      .send({ firstName: 'Mari', gender: 'Feminino' });
    expect(upd.status).toBe(200);
    expect(upd.body.firstName).toBe('Mari');
    expect(
      (await api().patch('/v1/me/profile').set(auth(accessToken)).send({ email: 'x@y.com' }))
        .status,
    ).toBe(400);
  });

  it('endereço: cotação por CEP e atualização com opção válida; janela fechada bloqueia', async () => {
    const { accessToken } = await login(app, 'mensal@teste.com');
    const current = await api().get('/v1/me/shipping-address').set(auth(accessToken));
    expect(current.body.city).toBe('Salvador');

    const quote = await api()
      .post('/v1/me/shipping-address/quote')
      .set(auth(accessToken))
      .send({ postalCode: '01311000' });
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ postalCode: '01311-000', city: 'São Paulo', state: 'SP' });
    expect(quote.body.options.length).toBeGreaterThanOrEqual(2);

    const body = {
      recipient: 'Thiago Lima',
      postalCode: '01311-000',
      street: 'Avenida Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      quoteOptionId: quote.body.options[0].id,
    };
    const upd = await api().patch('/v1/me/shipping-address').set(auth(accessToken)).send(body);
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({
      city: 'São Paulo',
      deliveryMethod: quote.body.options[0].method,
    });
    expect(
      (
        await api()
          .patch('/v1/me/shipping-address')
          .set(auth(accessToken))
          .send({ ...body, quoteOptionId: 'q-falsa' })
      ).status,
    ).toBe(422);
    expect(
      (
        await api()
          .post('/v1/me/shipping-address/quote')
          .set(auth(accessToken))
          .send({ postalCode: '123' })
      ).status,
    ).toBe(400);

    const janela = await login(app, 'janela@teste.com');
    const blocked = await api()
      .patch('/v1/me/shipping-address')
      .set(auth(janela.accessToken))
      .send(body);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EDIT_WINDOW_CLOSED');
  });

  it('dispositivos e preferências; dispositivo de outro usuário → 403', async () => {
    const a = await login(app, 'ativa@teste.com');
    const dev = await api().post('/v1/me/devices').set(auth(a.accessToken)).send({
      expoPushToken: 'ExponentPushToken[a1]',
      platform: 'ios',
      appVersion: '1.0.0',
      deviceName: 'iPhone',
    });
    expect(dev.status).toBe(201);
    expect(dev.body.id).toBeTruthy();
    // mesmo token (agora pelo campo novo `pushToken`) → mesmo id
    const again = await api()
      .post('/v1/me/devices')
      .set(auth(a.accessToken))
      .send({ pushToken: 'ExponentPushToken[a1]', platform: 'ios', appVersion: '1.0.1' });
    expect(again.body.id).toBe(dev.body.id);
    // token FCM (Flutter) com provedor explícito
    const fcm = await api().post('/v1/me/devices').set(auth(a.accessToken)).send({
      pushToken: 'fcm-token-android-1',
      pushProvider: 'fcm',
      platform: 'android',
      appVersion: '2.0.0',
    });
    expect(fcm.status).toBe(201);
    expect(fcm.body.id).not.toBe(dev.body.id);
    // sem nenhum token → 400
    expect(
      (
        await api()
          .post('/v1/me/devices')
          .set(auth(a.accessToken))
          .send({ platform: 'ios', appVersion: '1.0.0' })
      ).status,
    ).toBe(400);

    const b = await login(app, 'mensal@teste.com');
    expect(
      (await api().delete(`/v1/me/devices/${dev.body.id}`).set(auth(b.accessToken))).status,
    ).toBe(403);
    expect(
      (await api().delete(`/v1/me/devices/${dev.body.id}`).set(auth(a.accessToken))).status,
    ).toBe(204);

    const prefs = await api().get('/v1/me/notification-preferences').set(auth(a.accessToken));
    expect(prefs.body).toEqual({
      billing: true,
      shipping: true,
      renewal: true,
      marketing: false,
      routine: true,
    });
    const patched = await api()
      .patch('/v1/me/notification-preferences')
      .set(auth(a.accessToken))
      .send({ marketing: true, shipping: false, routine: false });
    expect(patched.body).toEqual({
      billing: true,
      shipping: false,
      renewal: true,
      marketing: true,
      routine: false,
    });
  });

  it('savings, wallet, tracking 404 quando não há', async () => {
    const a = await login(app, 'ativa@teste.com');
    expect(
      (await api().get('/v1/me/savings').set(auth(a.accessToken))).body.sinceStart.amount,
    ).toBeGreaterThan(0);
    expect((await api().get('/v1/me/wallet').set(auth(a.accessToken))).body.label).toMatch(
      /pontos/,
    );
    const none = await login(app, 'semassinatura@teste.com');
    expect((await api().get('/v1/me/tracking').set(auth(none.accessToken))).status).toBe(404);
    expect((await api().get('/v1/me/shipping-address').set(auth(none.accessToken))).status).toBe(
      404,
    );
  });

  it('delete-request: 202, revoga sessões', async () => {
    const s = await login(app, 'cancelada@teste.com');
    const res = await api()
      .post('/v1/me/delete-request')
      .set(auth(s.accessToken))
      .send({ reason: 'Não uso mais' });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(true);
    expect(
      (await api().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status,
    ).toBe(401);
  });
});
