import { Injectable } from '@nestjs/common';
import { Banner, Catalog, ReasonOption } from '../../contracts/api';
import { Coupon } from '../../core/pricing.service';
import { CatalogSource } from '../../ports';
import { FAKE_BANNERS, FAKE_CANCEL_REASONS, FAKE_PAUSE_REASONS, FakeState } from './fake-state';

/** Catálogo, motivos e banners fixos em memória (equivalem aos metaobjects da Shopify). */
@Injectable()
export class FakeCatalogSource implements CatalogSource {
  constructor(private readonly state: FakeState) {}

  async getCatalog(): Promise<Catalog> {
    return structuredClone(this.state.catalog);
  }
  async getCancelReasons(): Promise<ReasonOption[]> {
    return FAKE_CANCEL_REASONS;
  }
  async getPauseReasons(): Promise<ReasonOption[]> {
    return FAKE_PAUSE_REASONS;
  }
  async getBanners(): Promise<Banner[]> {
    return FAKE_BANNERS;
  }
  async getCoupon(code: string): Promise<Coupon | null> {
    return (
      this.state.coupons.find((c) => c.code.toUpperCase() === code.trim().toUpperCase()) ?? null
    );
  }
}
