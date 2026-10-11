import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { Dashboard } from '../../contracts/api';
import { Env, ENV } from '../../config/env';
import { PointsWallet } from '../../ports';
import { HttpClient } from './http-client';

/**
 * Saldo de pontos no Caffeine X.
 * Env: CAFFEINE_X_BASE_URL, CAFFEINE_X_API_KEY (header `x-api-key`).
 */
@Injectable()
export class CaffeineXWallet implements PointsWallet {
  private readonly http: HttpClient;

  constructor(@Inject(ENV) env: Env) {
    this.http = new HttpClient({
      baseUrl: env.caffeineX.url,
      headers: { 'x-api-key': env.caffeineX.apiKey },
    });
  }

  /** GET /customers/{shopifyCustomerId}/balance (Caffeine X) */
  async getBalance(_customerId: string): Promise<Dashboard['wallet']> {
    throw new NotImplementedException('TODO: conectar Caffeine X GET /customers/{id}/balance');
  }
}
