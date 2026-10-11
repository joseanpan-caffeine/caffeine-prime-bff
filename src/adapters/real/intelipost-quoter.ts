import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { AddressQuote } from '../../contracts/api';
import { Env, ENV } from '../../config/env';
import { ShippingQuoter } from '../../ports';
import { HttpClient } from './http-client';

/**
 * Cotação de frete na Intelipost (replica a lógica `delivery/option` da loja).
 * Env: INTELIPOST_API_URL, INTELIPOST_API_KEY (header `api-key`).
 */
@Injectable()
export class IntelipostQuoter implements ShippingQuoter {
  private readonly http: HttpClient;

  constructor(@Inject(ENV) env: Env) {
    this.http = new HttpClient({
      baseUrl: env.intelipost.url,
      headers: { 'api-key': env.intelipost.apiKey },
    });
  }

  /** POST /quote_by_product (Intelipost) + ViaCEP para rua/bairro/cidade/UF */
  async quote(_postalCode: string): Promise<AddressQuote> {
    throw new NotImplementedException(
      'TODO: conectar Intelipost POST /quote_by_product (lógica delivery/option da loja)',
    );
  }
}
