import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import {
  AddCardRequest,
  Bill,
  PaymentProfile,
  PayWithNewCardRequest,
  VindiConfig,
} from '../../contracts/api';
import { Env, ENV } from '../../config/env';
import { PaymentGateway } from '../../ports';
import { HttpClient } from './http-client';

/**
 * Pagamentos: Vindi (perfis a partir de gateway_token) + Prime API (cobranças da fatura).
 * Env: VINDI_API_URL, VINDI_API_KEY (Basic auth), VINDI_PUBLIC_KEY, VINDI_SANDBOX,
 *      PRIME_API_URL, CAFFEINE_PRIME_X_API_KEY.
 */
@Injectable()
export class VindiPaymentGateway implements PaymentGateway {
  private readonly vindi: HttpClient;
  private readonly prime: HttpClient;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.vindi = new HttpClient({
      baseUrl: env.vindi.apiUrl,
      headers: { authorization: `Basic ${Buffer.from(`${env.vindi.apiKey}:`).toString('base64')}` },
    });
    this.prime = new HttpClient({
      baseUrl: env.primeApi.url,
      headers: { 'x-api-key': env.primeApi.apiKey },
    });
  }

  getVindiConfig(): VindiConfig {
    return {
      publicKey: this.env.vindi.publicKey,
      apiUrl: this.env.vindi.apiUrl,
      sandbox: this.env.vindi.sandbox,
    };
  }

  /** Shopify metafield `custom.vindi_payment_profiles` + Vindi GET /payment_profiles?query=customer_id */
  async listProfiles(_customerId: string): Promise<PaymentProfile[]> {
    throw new NotImplementedException(
      'TODO: conectar Vindi GET /payment_profiles (metafield custom.vindi_payment_profiles)',
    );
  }

  /** Vindi POST /payment_profiles {gateway_token, customer_id} → Prime API POST /subscriptions/{id}/createPaymentProfile ou PATCH /subscriptions/{id}/updatePaymentProfile/{pp} */
  async createProfileFromGatewayToken(
    _customerId: string,
    _request: AddCardRequest,
  ): Promise<PaymentProfile> {
    throw new NotImplementedException(
      'TODO: conectar Vindi POST /payment_profiles + Prime API createPaymentProfile',
    );
  }

  /** Vindi DELETE /payment_profiles/{id} (só perfis do próprio cliente) + atualizar metafield */
  async deleteProfile(_customerId: string, _profileId: string): Promise<void> {
    throw new NotImplementedException('TODO: conectar Vindi DELETE /payment_profiles/{id}');
  }

  /** Prime API POST /subscriptions/{id}/bills/{billId}/createPixCharge → qrCode, copiaECola, expiresAt */
  async createPixCharge(_customerId: string, _billId: string, _now: Date): Promise<Bill> {
    throw new NotImplementedException(
      'TODO: conectar POST /subscriptions/{id}/bills/{billId}/createPixCharge da Prime API',
    );
  }

  /** Prime API POST /subscriptions/{id}/bills/{billId}/chargeInstantly */
  async chargeCurrentCard(_customerId: string, _billId: string, _now: Date): Promise<Bill> {
    throw new NotImplementedException(
      'TODO: conectar POST /subscriptions/{id}/bills/{billId}/chargeInstantly da Prime API',
    );
  }

  /** Vindi POST /payment_profiles → Prime API PATCH /subscriptions/{id}/bills/{billId}/updateBillPaymentProfile → POST .../chargeInstantly */
  async chargeNewCard(
    _customerId: string,
    _billId: string,
    _request: PayWithNewCardRequest,
    _now: Date,
  ): Promise<Bill> {
    throw new NotImplementedException(
      'TODO: conectar updateBillPaymentProfile + chargeInstantly da Prime API',
    );
  }
}
