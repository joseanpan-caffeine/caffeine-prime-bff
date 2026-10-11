import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, bootTestApp, login } from './helpers';

describe('Auth: social, link mágico, refresh rotativo, logout', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootTestApp();
  });
  afterAll(() => app.close());

  it('Google/Apple com idToken fake:<email>', async () => {
    const g = await request(app.getHttpServer())
      .post('/v1/auth/google')
      .send({ idToken: 'fake:ativa@teste.com' });
    expect(g.status).toBe(200);
    expect(g.body.user.email).toBe('ativa@teste.com');
    const a = await request(app.getHttpServer())
      .post('/v1/auth/apple')
      .send({ idToken: 'fake:novo.cliente@teste.com', fullName: 'Novo Cliente' });
    expect(a.status).toBe(200);
    expect(a.body.user).toMatchObject({
      firstName: 'Novo',
      lastName: 'Cliente',
      hasSubscription: false,
    });
    const bad = await request(app.getHttpServer())
      .post('/v1/auth/google')
      .send({ idToken: 'eyJ.real.token' });
    expect(bad.status).toBe(401);
  });

  it('link mágico devolve debugToken no fake e troca por sessão', async () => {
    const sent = await request(app.getHttpServer())
      .post('/v1/auth/magic-link')
      .send({ email: 'mensal@teste.com' });
    expect(sent.status).toBe(202);
    expect(sent.body.sent).toBe(true);
    expect(sent.body.debugToken).toMatch(/^ml_/);
    const ex = await request(app.getHttpServer())
      .post('/v1/auth/magic-link/exchange')
      .send({ token: sent.body.debugToken });
    expect(ex.status).toBe(200);
    expect(ex.body.user.email).toBe('mensal@teste.com');
    // token de uso único
    expect(
      (
        await request(app.getHttpServer())
          .post('/v1/auth/magic-link/exchange')
          .send({ token: sent.body.debugToken })
      ).status,
    ).toBe(401);
    // e-mail desconhecido não revela nada
    const unknown = await request(app.getHttpServer())
      .post('/v1/auth/magic-link')
      .send({ email: 'ninguem@teste.com' });
    expect(unknown.status).toBe(202);
    expect(unknown.body.debugToken).toBeUndefined();
  });

  it('cadastro cria conta sem assinatura', async () => {
    const res = await request(app.getHttpServer()).post('/v1/auth/register').send({
      firstName: 'Carla',
      lastName: 'Dias',
      email: 'carla.dias@teste.com',
      password: 'senha123',
      cpf: '123.456.789-09',
      phone: '+5511988887777',
      birthDate: '1995-02-10',
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'carla.dias@teste.com',
      cpf: '***.***.789-09',
      hasSubscription: false,
    });
    expect(
      (
        await request(app.getHttpServer()).post('/v1/auth/register').send({
          firstName: 'C',
          lastName: 'D',
          email: 'carla.dias@teste.com',
          password: 'senha123',
          cpf: '12345678909',
          phone: '11988887777',
          birthDate: '1995-02-10',
        })
      ).status,
    ).toBe(409);
  });

  it('refresh rotaciona o token e invalida o anterior', async () => {
    const first = await login(app, 'ativa@teste.com');
    const r1 = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(first.refreshToken);
    expect(r1.body.expiresIn).toBe(900);
    // novo access token funciona
    expect(
      (await request(app.getHttpServer()).get('/v1/me').set(auth(r1.body.accessToken))).status,
    ).toBe(200);
    // reuso do antigo → 401 e derruba a família (o novo também morre)
    expect(
      (
        await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .send({ refreshToken: first.refreshToken })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .send({ refreshToken: r1.body.refreshToken })
      ).status,
    ).toBe(401);
  });

  it('logout revoga o refresh token', async () => {
    const s = await login(app, 'mensal@teste.com');
    expect(
      (
        await request(app.getHttpServer())
          .post('/v1/auth/logout')
          .send({ refreshToken: s.refreshToken })
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .send({ refreshToken: s.refreshToken })
      ).status,
    ).toBe(401);
  });

  it('access token adulterado → 401 INVALID_TOKEN', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/me')
      .set(auth('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3MDAxIn0.xxx'));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});
