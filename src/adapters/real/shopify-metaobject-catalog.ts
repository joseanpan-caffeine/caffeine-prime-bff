import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { Banner, Catalog, ReasonOption } from '../../contracts/api';
import { Coupon } from '../../core/pricing.service';
import { Env, ENV } from '../../config/env';
import { CatalogSource } from '../../ports';
import { HttpClient } from './http-client';

/**
 * Catálogo via metaobjects da Shopify Admin API (planos, produtos, faixas de desconto, brindes, motivos).
 * Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN (escopo read_metaobjects). Cache sugerido: 10 min.
 */
@Injectable()
export class ShopifyMetaobjectCatalog implements CatalogSource {
  private readonly admin: HttpClient;

  constructor(@Inject(ENV) env: Env) {
    this.admin = new HttpClient({
      baseUrl: env.shopify.storeDomain
        ? `https://${env.shopify.storeDomain}/admin/api/2025-01`
        : '',
      headers: { 'X-Shopify-Access-Token': env.shopify.adminToken },
    });
  }

  /** Admin GraphQL `metaobjects(type: "prime_plan" | "prime_product" | "prime_discount_tier" | "prime_gift")` */
  async getCatalog(): Promise<Catalog> {
    throw new NotImplementedException(
      'TODO: conectar Shopify Admin metaobjects (planos, produtos, faixas, brindes)',
    );
  }

  /** Admin GraphQL `metaobjects(type: "prime_cancel_reason")` */
  async getCancelReasons(): Promise<ReasonOption[]> {
    throw new NotImplementedException(
      'TODO: conectar Shopify Admin metaobjects (motivos de cancelamento)',
    );
  }

  /** Admin GraphQL `metaobjects(type: "prime_pause_reason")` */
  async getPauseReasons(): Promise<ReasonOption[]> {
    throw new NotImplementedException(
      'TODO: conectar Shopify Admin metaobjects (motivos de pausa)',
    );
  }

  /** Admin GraphQL `metaobjects(type: "prime_app_banner")` */
  async getBanners(): Promise<Banner[]> {
    throw new NotImplementedException('TODO: conectar Shopify Admin metaobjects (banners do app)');
  }

  /** Prime API GET /promos?code= (cupons/promos) ou metaobject `prime_coupon` */
  async getCoupon(_code: string): Promise<Coupon | null> {
    throw new NotImplementedException(
      'TODO: conectar validação de cupom (Prime API /promos ou metaobject)',
    );
  }
}
