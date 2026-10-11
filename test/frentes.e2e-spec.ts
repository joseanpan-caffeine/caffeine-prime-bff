import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, bootTestApp, login } from './helpers';

/** Frentes 2 e 5: consentimento LGPD, rotina, saúde/wearables e Prime IA (adaptadores fake). */
describe('Consentimentos, rotina, saúde e assistente', () => {
  let app: INestApplication;
  let version: string;
  beforeAll(async () => {
    app = await bootTestApp();
    const cfg = await request(app.getHttpServer()).get('/v1/config');
    version = cfg.body.consentVersions.routine_data;
  });
  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());
  const grant = (token: string, kind: string, granted = true) =>
    api().put('/v1/me/consents').set(auth(token)).send({ kind, granted, version });

  it('/config expõe consentVersions e flags routine/health/assistant', async () => {
    const res = await api().get('/v1/config');
    expect(res.status).toBe(200);
    expect(res.body.features).toMatchObject({ routine: true, health: true, assistant: true });
    expect(res.body.consentVersions).toMatchObject({
      push: expect.any(String),
      health_data: expect.any(String),
      routine_data: expect.any(String),
      ai_assistant: expect.any(String),
    });
    expect(res.body.links.healthPrivacy).toBeTruthy();
  });

  it('consentimentos: lista tudo como não concedido; PUT concede; versão errada → 422', async () => {
    const { accessToken } = await login(app, 'mensal@teste.com');
    const list = await api().get('/v1/me/consents').set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(5);
    expect(list.body.every((c: any) => c.granted === false)).toBe(true);

    const upd = await grant(accessToken, 'push');
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ kind: 'push', granted: true, version });
    expect(upd.body.grantedAt).toBeTruthy();

    const bad = await api()
      .put('/v1/me/consents')
      .set(auth(accessToken))
      .send({ kind: 'push', granted: true, version: '1999-01-01' });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('CONSENT_VERSION_OUTDATED');

    const revoked = await grant(accessToken, 'push', false);
    expect(revoked.body).toMatchObject({ kind: 'push', granted: false });
    expect(revoked.body.grantedAt).toBeUndefined();
  });

  it('gating: rotina/saúde/assistente respondem 403 CONSENT_REQUIRED com details.kind', async () => {
    const { accessToken } = await login(app, 'agendada@teste.com');
    const cases: [string, string, string][] = [
      ['get', '/v1/me/routine', 'routine_data'],
      ['get', '/v1/me/routine/summary', 'routine_data'],
      ['get', '/v1/me/health/summary', 'health_data'],
      ['get', '/v1/me/assistant/threads', 'ai_assistant'],
    ];
    for (const [method, path, kind] of cases) {
      const res = await (api() as any)[method](path).set(auth(accessToken));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CONSENT_REQUIRED');
      expect(res.body.details).toMatchObject({ kind, requiredVersion: version });
    }
    const post = await api()
      .post('/v1/me/assistant/messages')
      .set(auth(accessToken))
      .send({ message: 'oi' });
    expect(post.status).toBe(403);
    expect(post.body.details.kind).toBe('ai_assistant');
    // /assistant/config não exige consentimento
    const cfg = await api().get('/v1/assistant/config').set(auth(accessToken));
    expect(cfg.status).toBe(200);
    expect(cfg.body).toMatchObject({ enabled: true, dailyMessageLimit: 30 });
    expect(cfg.body.disclaimer).toMatch(/não substituem/);
    expect(cfg.body.suggestedPrompts.length).toBeGreaterThan(2);
  });

  it('rotina: plano padrão da caixa, edição, check-in idempotente, remoção e resumo', async () => {
    const { accessToken } = await login(app, 'ativa@teste.com');
    await grant(accessToken, 'routine_data');

    const plan = await api().get('/v1/me/routine').set(auth(accessToken));
    expect(plan.status).toBe(200);
    expect(plan.body.timezone).toBe('America/Sao_Paulo');
    expect(plan.body.weeklyGoalDays).toBe(5);
    // caixa da ativa: 2 sabores de Supercoffee + Morning Shot → 3 itens
    expect(plan.body.items).toHaveLength(3);
    const shot = plan.body.items.find((i: any) => i.productHandle === 'morning-shot');
    expect(shot).toMatchObject({ slot: 'pre_workout', reminderEnabled: false, dosesPerDay: 1 });
    expect(shot.usageHint).toMatch(/Pré-treino/);
    const coffee = plan.body.items.find(
      (i: any) => i.productHandle === 'supercoffee-3-0-original-380g',
    );
    expect(coffee.slot).toBe('morning');
    expect(coffee.title).toMatch(/Supercoffee/);

    // edição: liga lembrete, muda meta; item fora da caixa → 422
    const items = plan.body.items.map((i: any) => ({
      id: i.id,
      productHandle: i.productHandle,
      slot: i.slot,
      reminderTime: '07:30',
      reminderEnabled: true,
      dosesPerDay: 1,
    }));
    const upd = await api()
      .put('/v1/me/routine')
      .set(auth(accessToken))
      .send({ items, weeklyGoalDays: 6 });
    expect(upd.status).toBe(200);
    expect(upd.body.weeklyGoalDays).toBe(6);
    expect(upd.body.items[0]).toMatchObject({ reminderEnabled: true, reminderTime: '07:30' });
    expect(upd.body.items[0].title).toMatch(/Supercoffee/); // título vem da caixa, não do body
    const foreign = await api()
      .put('/v1/me/routine')
      .set(auth(accessToken))
      .send({ items: [{ ...items[0], productHandle: 'whey-isolado-chocolate-900g' }] });
    expect(foreign.status).toBe(422);
    expect(foreign.body.code).toBe('ITEM_NOT_IN_BOX');
    expect(
      (await api().put('/v1/me/routine').set(auth(accessToken)).send({ timezone: 'Marte/Olympus' }))
        .body.code,
    ).toBe('INVALID_TIMEZONE');
    expect(
      (
        await api()
          .put('/v1/me/routine')
          .set(auth(accessToken))
          .send({ items: [{ ...items[0], reminderTime: '25:99' }] })
      ).status,
    ).toBe(400);

    // check-in idempotente por item+data
    const summary0 = await api().get('/v1/me/routine/summary').set(auth(accessToken));
    const today = summary0.body.today.date;
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const c1 = await api()
      .post('/v1/me/routine/check-ins')
      .set(auth(accessToken))
      .send({ routineItemId: coffee.id, date: today });
    expect(c1.status).toBe(201);
    expect(c1.body).toMatchObject({ routineItemId: coffee.id, date: today, source: 'manual' });
    const c2 = await api()
      .post('/v1/me/routine/check-ins')
      .set(auth(accessToken))
      .send({ routineItemId: coffee.id, date: today, source: 'reminder' });
    expect(c2.body.id).toBe(c1.body.id);
    expect(
      (
        await api()
          .post('/v1/me/routine/check-ins')
          .set(auth(accessToken))
          .send({ routineItemId: 'nao-existe', date: today })
      ).body.code,
    ).toBe('ROUTINE_ITEM_NOT_FOUND');
    expect(
      (
        await api()
          .post('/v1/me/routine/check-ins')
          .set(auth(accessToken))
          .send({ routineItemId: coffee.id, date: '2999-01-01' })
      ).body.code,
    ).toBe('CHECK_IN_IN_FUTURE');

    // resumo: 1 de 3 feito hoje; streak 0 (hoje ainda não completo); previsão de estoque
    const summary = await api().get('/v1/me/routine/summary?days=7').set(auth(accessToken));
    expect(summary.status).toBe(200);
    expect(summary.body.today.completion).toBeCloseTo(1 / 3, 2);
    expect(summary.body.today.items.find((i: any) => i.routineItemId === coffee.id).done).toBe(
      true,
    );
    expect(summary.body.currentStreakDays).toBe(0);
    expect(summary.body.last28Days).toHaveLength(7);
    expect(summary.body.last28Days[6].date).toBe(today);
    const sc = summary.body.stockForecast.find(
      (f: any) => f.productHandle === 'supercoffee-3-0-original-380g',
    );
    expect(sc).toBeDefined();
    expect(sc.dosesLeft).toBe(2 * 25 - 1);
    expect(sc.nextBoxAt).toBeTruthy();
    expect(
      (await api().get('/v1/me/routine/summary?days=99').set(auth(accessToken))).body.code,
    ).toBe('INVALID_DAYS');

    // completar os 3 itens → streak 1
    for (const it of plan.body.items) {
      await api()
        .post('/v1/me/routine/check-ins')
        .set(auth(accessToken))
        .send({ routineItemId: it.id, date: today });
    }
    const full = await api().get('/v1/me/routine/summary').set(auth(accessToken));
    expect(full.body.today.completion).toBe(1);
    expect(full.body.currentStreakDays).toBe(1);
    expect(full.body.weekCompletion).toBeCloseTo(1 / 6, 2);

    // remover check-in: de outro usuário → 403; próprio → 204
    const other = await login(app, 'mensal@teste.com');
    await grant(other.accessToken, 'routine_data');
    expect(
      (await api().delete(`/v1/me/routine/check-ins/${c1.body.id}`).set(auth(other.accessToken)))
        .status,
    ).toBe(403);
    expect(
      (await api().delete(`/v1/me/routine/check-ins/${c1.body.id}`).set(auth(accessToken))).status,
    ).toBe(204);
    const after = await api().get('/v1/me/routine/summary').set(auth(accessToken));
    expect(after.body.today.completion).toBeCloseTo(2 / 3, 2);

    // sem assinatura → 404
    const none = await login(app, 'semassinatura@teste.com');
    await grant(none.accessToken, 'routine_data');
    expect((await api().get('/v1/me/routine').set(auth(none.accessToken))).status).toBe(404);
  });

  it('saúde: sync valida e faz upsert; resumo traz últimos 7 dias e sugestões por regra', async () => {
    // agendada: caixa com Supercoffee + Morning Shot (sem whey) e nenhum check-in hoje
    const { accessToken } = await login(app, 'agendada@teste.com');
    await grant(accessToken, 'health_data');

    const before = await api().get('/v1/me/health/summary').set(auth(accessToken));
    expect(before.body).toMatchObject({ connected: false, provider: 'none', suggestions: [] });
    expect(before.body.last7Days).toHaveLength(7);
    const today = before.body.last7Days[6].date;

    expect(
      (
        await api()
          .post('/v1/me/health/sync')
          .set(auth(accessToken))
          .send({ samples: [{ date: today, metric: 'passos', value: 1 }] })
      ).status,
    ).toBe(400);
    expect(
      (
        await api()
          .post('/v1/me/health/sync')
          .set(auth(accessToken))
          .send({ samples: [{ date: today, metric: 'steps', value: -5 }] })
      ).status,
    ).toBe(400);
    expect(
      (
        await api()
          .post('/v1/me/health/sync')
          .set(auth(accessToken))
          .send({ samples: [{ date: '11/10/2026', metric: 'steps', value: 5 }] })
      ).status,
    ).toBe(400);

    const sync = await api()
      .post('/v1/me/health/sync')
      .set(auth(accessToken))
      .send({
        provider: 'apple_health',
        samples: [
          { date: today, metric: 'steps', value: 1000 },
          { date: today, metric: 'steps', value: 1500 }, // repetido no payload: último vence
          { date: today, metric: 'workouts', value: 1, source: 'Apple Watch' },
          { date: today, metric: 'sleep_minutes', value: 300 },
        ],
      });
    expect(sync.status).toBe(204);
    // upsert: novo valor para o mesmo dia+métrica
    await api()
      .post('/v1/me/health/sync')
      .set(auth(accessToken))
      .send({ samples: [{ date: today, metric: 'steps', value: 2000 }] });

    const summary = await api().get('/v1/me/health/summary').set(auth(accessToken));
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ connected: true, provider: 'apple_health' });
    expect(summary.body.lastSyncAt).toBeTruthy();
    const todayRow = summary.body.last7Days[6];
    expect(todayRow).toMatchObject({ date: today, steps: 2000, workouts: 1, sleepMinutes: 300 });
    const ids = summary.body.suggestions.map((s: any) => s.id);
    // treinou e tem Morning Shot na caixa; dormiu < 6h
    expect(ids).toContain('workout-morning-shot');
    expect(ids).toContain('short-sleep-caffeine-cutoff');
    expect(ids).not.toContain('workout-whey'); // sem whey na caixa
    for (const s of summary.body.suggestions) expect(s.body).not.toMatch(/diagn/i);
  });

  it('assistente: conversa com o provedor fake, disclaimer na 1ª resposta, threads e limite', async () => {
    const { accessToken } = await login(app, 'ativa@teste.com');
    await grant(accessToken, 'ai_assistant');

    const first = await api()
      .post('/v1/me/assistant/messages')
      .set(auth(accessToken))
      .send({ message: 'Quando posso pausar minha assinatura?' });
    expect(first.status).toBe(200);
    expect(first.body.threadId).toBeTruthy();
    expect(first.body.reply.role).toBe('assistant');
    expect(first.body.reply.content).toMatch(/paus/i);
    expect(first.body.actions).toEqual([
      { label: 'Pausar assinatura', deepLink: 'app://subscription/pause' },
    ]);
    expect(first.body.disclaimer).toMatch(/não substituem orientação médica/);

    const second = await api()
      .post('/v1/me/assistant/messages')
      .set(auth(accessToken))
      .send({ threadId: first.body.threadId, message: 'E trocar o sabor da caixa?' });
    expect(second.status).toBe(200);
    expect(second.body.threadId).toBe(first.body.threadId);
    expect(second.body.disclaimer).toBeUndefined();
    expect(second.body.reply.content).toMatch(/Supercoffee/);

    const threads = await api().get('/v1/me/assistant/threads').set(auth(accessToken));
    expect(threads.body).toHaveLength(1);
    expect(threads.body[0]).toMatchObject({ id: first.body.threadId, messages: [] });
    expect(threads.body[0].title).toMatch(/pausar/i);
    const thread = await api()
      .get(`/v1/me/assistant/threads/${first.body.threadId}`)
      .set(auth(accessToken));
    expect(thread.body.messages).toHaveLength(4);
    expect(thread.body.messages.map((m: any) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);

    // thread de outro cliente → 403 (mesmo com consentimento)
    const other = await login(app, 'mensal@teste.com');
    await grant(other.accessToken, 'ai_assistant');
    expect(
      (
        await api()
          .get(`/v1/me/assistant/threads/${first.body.threadId}`)
          .set(auth(other.accessToken))
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .post('/v1/me/assistant/messages')
          .set(auth(other.accessToken))
          .send({ threadId: first.body.threadId, message: 'oi' })
      ).status,
    ).toBe(403);

    // validação
    expect(
      (await api().post('/v1/me/assistant/messages').set(auth(accessToken)).send({ message: '' }))
        .status,
    ).toBe(400);

    // limite diário (30): já usou 2
    for (let i = 0; i < 28; i++) {
      const r = await api()
        .post('/v1/me/assistant/messages')
        .set(auth(accessToken))
        .send({ threadId: first.body.threadId, message: `pergunta ${i}` });
      expect(r.status).toBe(200);
    }
    const limited = await api()
      .post('/v1/me/assistant/messages')
      .set(auth(accessToken))
      .send({ message: 'mais uma' });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('ASSISTANT_LIMIT');
    expect(limited.body.details).toMatchObject({ limit: 30 });

    expect(
      (
        await api()
          .delete(`/v1/me/assistant/threads/${first.body.threadId}`)
          .set(auth(other.accessToken))
      ).status,
    ).toBe(403);
    expect(
      (await api().delete(`/v1/me/assistant/threads/${first.body.threadId}`).set(auth(accessToken)))
        .status,
    ).toBe(204);
    expect((await api().get('/v1/me/assistant/threads').set(auth(accessToken))).body).toEqual([]);
  });
});
