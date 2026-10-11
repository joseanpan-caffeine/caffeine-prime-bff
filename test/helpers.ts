import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { loadEnv } from '../src/config/env';

export const PASSWORD = 'prime123';

export async function bootTestApp(): Promise<INestApplication> {
  process.env.ADAPTERS = 'fake';
  delete process.env.DATABASE_URL;
  const env = { ...loadEnv(), nodeEnv: 'test', throttleDisabled: true };
  const { app } = await createApp({ env });
  await app.init();
  return app;
}

export async function login(app: INestApplication, email: string, password = PASSWORD) {
  const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
