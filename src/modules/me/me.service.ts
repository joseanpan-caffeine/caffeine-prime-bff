import { Inject, Injectable } from '@nestjs/common';
import { Dashboard, Fulfillment, UpdateProfileRequest, UserProfile } from '../../contracts/api';
import { CapabilitiesService } from '../../core/capabilities.service';
import { AppError } from '../../common/errors';
import { latestBill, toPublicSubscription } from '../../common/serializers';
import {
  CATALOG_SOURCE,
  CatalogSource,
  CLOCK,
  Clock,
  DELETE_REQUEST_STORE,
  DeleteRequestStore,
  DEVICE_STORE,
  DeviceStore,
  IDENTITY_PROVIDER,
  IdentityProvider,
  POINTS_WALLET,
  PointsWallet,
  REFRESH_TOKEN_STORE,
  RefreshTokenStore,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../../ports';

/** Perfil, dashboard agregado e extras da conta. */
@Injectable()
export class MeService {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(CATALOG_SOURCE) private readonly catalog: CatalogSource,
    @Inject(POINTS_WALLET) private readonly wallet: PointsWallet,
    @Inject(DELETE_REQUEST_STORE) private readonly deleteRequests: DeleteRequestStore,
    @Inject(REFRESH_TOKEN_STORE) private readonly refreshTokens: RefreshTokenStore,
    @Inject(DEVICE_STORE) private readonly devices: DeviceStore,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async getProfile(customerId: string): Promise<UserProfile> {
    const [profile, sub] = await Promise.all([
      this.identity.getProfile(customerId),
      this.subscriptions.getByCustomer(customerId),
    ]);
    if (!profile) throw AppError.unauthorized('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.');
    return { ...profile, hasSubscription: Boolean(sub && sub.status !== 'canceled') };
  }

  async updateProfile(customerId: string, request: UpdateProfileRequest): Promise<UserProfile> {
    await this.identity.updateProfile(customerId, request);
    return this.getProfile(customerId);
  }

  /** Uma chamada por tela: agrega as fontes e já calcula `capabilities`. */
  async getDashboard(customerId: string): Promise<Dashboard> {
    const [user, sub, lastCanceled, bills, savings, wallet, banners] = await Promise.all([
      this.getProfile(customerId),
      this.subscriptions.getByCustomer(customerId),
      this.subscriptions.getLastCanceled(customerId),
      this.subscriptions.getBills(customerId),
      this.subscriptions.getSavings(customerId),
      this.wallet.getBalance(customerId),
      this.catalog.getBanners(),
    ]);
    const latest = latestBill(bills);
    const capabilities = this.capabilities.compute({
      subscription: sub,
      latestBill: latest,
      now: this.clock.now(),
    });
    return {
      user,
      subscription: sub ? toPublicSubscription(sub) : null,
      ...(lastCanceled ? { lastCanceled } : {}),
      capabilities,
      ...(latest ? { latestBill: latest } : {}),
      ...(latest?.fulfillment ? { tracking: latest.fulfillment } : {}),
      savings,
      wallet,
      banners,
    };
  }

  getSavings(customerId: string) {
    return this.subscriptions.getSavings(customerId);
  }

  getWallet(customerId: string) {
    return this.wallet.getBalance(customerId);
  }

  async getTracking(customerId: string): Promise<Fulfillment> {
    const bills = await this.subscriptions.getBills(customerId);
    const withTracking = bills
      .filter((b) => b.fulfillment)
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
    const current = withTracking[0]?.fulfillment;
    if (!current) throw AppError.notFound('NO_TRACKING', 'Nenhum pedido com rastreio.');
    return current;
  }

  /** LGPD: abre o chamado e anonimiza os dados do BFF (sessões e dispositivos). */
  async requestDeletion(
    customerId: string,
    reason?: string,
  ): Promise<{ accepted: true; requestId: string }> {
    const { id } = await this.deleteRequests.create(customerId, reason);
    await Promise.all([
      this.refreshTokens.revokeAllForCustomer(customerId),
      this.devices.removeAllForCustomer(customerId),
    ]);
    return { accepted: true, requestId: id };
  }
}
