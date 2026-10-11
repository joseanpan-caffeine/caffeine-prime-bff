import { Inject, Injectable } from '@nestjs/common';
import {
  AddCardRequest,
  Bill,
  PaymentProfile,
  PayWithNewCardRequest,
  VindiConfig,
} from '../../contracts/api';
import { CapabilitiesService } from '../../core/capabilities.service';
import { AppError } from '../../common/errors';
import { latestBill } from '../../common/serializers';
import {
  CLOCK,
  Clock,
  PAYMENT_GATEWAY,
  PaymentGateway,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../../ports';

/** Cartões e faturas. Ids de fatura/cartão já passaram pelo OwnershipGuard quando chegam aqui. */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly payments: PaymentGateway,
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly capabilities: CapabilitiesService,
  ) {}

  vindiConfig(): VindiConfig {
    return this.payments.getVindiConfig();
  }

  listProfiles(customerId: string): Promise<PaymentProfile[]> {
    return this.payments.listProfiles(customerId);
  }

  async addProfile(customerId: string, request: AddCardRequest): Promise<PaymentProfile> {
    const sub = await this.subscriptions.getByCustomer(customerId);
    if (sub) {
      const bills = await this.subscriptions.getBills(customerId);
      const caps = this.capabilities.compute({
        subscription: sub,
        latestBill: latestBill(bills),
        now: this.clock.now(),
      });
      if (!caps.canChangeCard.allowed) throw AppError.capabilityDenied(caps.canChangeCard.reason!);
    }
    return this.payments.createProfileFromGatewayToken(customerId, request);
  }

  async deleteProfile(customerId: string, profileId: string): Promise<void> {
    const profiles = await this.payments.listProfiles(customerId);
    const target = profiles.find((p) => p.id === profileId);
    if (!target) throw AppError.forbidden();
    const sub = await this.subscriptions.getByCustomer(customerId);
    if (target.isDefault && profiles.length === 1 && sub && sub.status !== 'canceled') {
      throw AppError.unprocessable(
        'LAST_PAYMENT_PROFILE',
        'Cadastre outro cartão antes de remover o único cartão da assinatura.',
      );
    }
    await this.payments.deleteProfile(customerId, profileId);
  }

  listBills(customerId: string): Promise<Bill[]> {
    return this.subscriptions.getBills(customerId);
  }

  async getBill(customerId: string, billId: string): Promise<Bill> {
    const bill = await this.subscriptions.getBill(customerId, billId);
    if (!bill) throw AppError.forbidden();
    return bill;
  }

  payWithPix(customerId: string, billId: string): Promise<Bill> {
    return this.payments.createPixCharge(customerId, billId, this.clock.now());
  }

  payWithCurrentCard(customerId: string, billId: string): Promise<Bill> {
    return this.payments.chargeCurrentCard(customerId, billId, this.clock.now());
  }

  payWithNewCard(
    customerId: string,
    billId: string,
    request: PayWithNewCardRequest,
  ): Promise<Bill> {
    return this.payments.chargeNewCard(customerId, billId, request, this.clock.now());
  }
}
