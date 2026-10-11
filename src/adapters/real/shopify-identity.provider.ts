import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { RegisterRequest, UpdateProfileRequest } from '../../contracts/api';
import { Env, ENV } from '../../config/env';
import { IdentityProfile, IdentityProvider } from '../../ports';
import { HttpClient } from './http-client';

/**
 * Identidade via Shopify Storefront API (+ Multipass para login social/link mágico).
 * Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_STOREFRONT_TOKEN, SHOPIFY_ADMIN_ACCESS_TOKEN,
 *      SHOPIFY_MULTIPASS_CLOUD_FUNCTION_URL, SHOPIFY_MULTIPASS_SECRET, GOOGLE_CLIENT_ID,
 *      APPLE_CLIENT_ID, SENDGRID_API_KEY, MAGIC_LINK_BASE_URL.
 */
@Injectable()
export class ShopifyIdentityProvider implements IdentityProvider {
  private readonly storefront: HttpClient;
  private readonly multipass: HttpClient;

  constructor(@Inject(ENV) env: Env) {
    this.storefront = new HttpClient({
      baseUrl: env.shopify.storeDomain ? `https://${env.shopify.storeDomain}/api/2025-01` : '',
      headers: { 'X-Shopify-Storefront-Access-Token': env.shopify.storefrontToken },
    });
    this.multipass = new HttpClient({ baseUrl: env.shopify.multipassUrl });
  }

  /** Storefront `customerAccessTokenCreate` → `customer { id email firstName lastName phone }` */
  async loginWithPassword(_email: string, _password: string): Promise<IdentityProfile> {
    throw new NotImplementedException(
      'TODO: conectar Storefront customerAccessTokenCreate + query customer',
    );
  }

  /** Validar id_token Google (GOOGLE_CLIENT_ID) → Cloud Function Multipass → `customerAccessTokenCreateWithMultipass` */
  async loginWithGoogleIdToken(_idToken: string, _fullName?: string): Promise<IdentityProfile> {
    throw new NotImplementedException(
      'TODO: conectar validação Google + Multipass (SHOPIFY_MULTIPASS_CLOUD_FUNCTION_URL)',
    );
  }

  /** Validar identityToken Apple (JWKS da Apple, APPLE_CLIENT_ID) → Multipass. Apple só envia nome no 1º login: guardar. */
  async loginWithAppleIdentityToken(
    _identityToken: string,
    _fullName?: string,
  ): Promise<IdentityProfile> {
    throw new NotImplementedException('TODO: conectar validação Apple + Multipass');
  }

  /** Gera token Multipass e envia e-mail via SendGrid com deep link `MAGIC_LINK_BASE_URL/{token}` */
  async sendMagicLink(_email: string): Promise<{ debugToken?: string }> {
    throw new NotImplementedException(
      'TODO: conectar SendGrid (SENDGRID_API_KEY) para o link mágico',
    );
  }

  /** `customerAccessTokenCreateWithMultipass(multipassToken)` → customer */
  async exchangeMagicLink(_token: string): Promise<IdentityProfile> {
    throw new NotImplementedException(
      'TODO: conectar Storefront customerAccessTokenCreateWithMultipass',
    );
  }

  /** Espelha `auth/register` da loja: Storefront `customerCreate` + metafields (CPF, nascimento) */
  async register(_request: RegisterRequest): Promise<IdentityProfile> {
    throw new NotImplementedException(
      'TODO: conectar Storefront customerCreate (auth/register da loja)',
    );
  }

  /** Admin API `customer(id)` (ou Storefront com o customerAccessToken guardado na sessão) */
  async getProfile(_customerId: string): Promise<IdentityProfile | null> {
    throw new NotImplementedException('TODO: conectar Shopify Admin customer(id)');
  }

  /** Storefront `customerUpdate` + Prime API PATCH /subscriptions/customers/{id}/updateSubscriptionCustomer */
  async updateProfile(
    _customerId: string,
    _request: UpdateProfileRequest,
  ): Promise<IdentityProfile> {
    throw new NotImplementedException('TODO: conectar customerUpdate + updateSubscriptionCustomer');
  }
}
