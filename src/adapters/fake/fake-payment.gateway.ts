import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  AddCardRequest,
  Bill,
  PaymentProfile,
  PayWithNewCardRequest,
  VindiConfig,
} from '../../contracts/api';
import { AppError } from '../../common/errors';
import { Env, ENV } from '../../config/env';
import { PaymentGateway } from '../../ports';
import { FakeState } from './fake-state';
import { FakeSubscriptionGateway } from './fake-subscription.gateway';

/**
 * Gateway de pagamento em memória.
 * - PIX: cria a cobrança na fatura; o pagamento só é confirmado por `POST /webhooks/vindi`
 *   com `{event:{type:'bill_paid', data:{bill:{id}}}}` (como na Vindi real).
 * - Cartão (atual ou novo): confirma na hora.
 * - `gatewayToken` fake: `tok_<bandeira>_<4 últimos>` (ex.: `tok_visa_4242`); outros tokens
 *   geram um cartão Visa final 0000.
 */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  constructor(
    private readonly state: FakeState,
    private readonly subscriptions: FakeSubscriptionGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  getVindiConfig(): VindiConfig {
    return {
      publicKey: this.env.vindi.publicKey,
      apiUrl: this.env.vindi.apiUrl,
      sandbox: this.env.vindi.sandbox,
    };
  }

  async listProfiles(customerId: string): Promise<PaymentProfile[]> {
    return structuredClone(this.state.paymentProfiles.get(customerId) ?? []);
  }

  private profileFromToken(customerId: string, token: string, holder: string): PaymentProfile {
    if (token.startsWith('tok_declined')) {
      throw AppError.unprocessable('CARD_DECLINED', 'Cartão recusado pela operadora.');
    }
    const m = /^tok_([a-z]+)_(\d{4})$/i.exec(token);
    const brand = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : 'Visa';
    const lastFour = m ? m[2] : '0000';
    return {
      id: `pp-${customerId}-${lastFour}-${randomBytes(3).toString('hex')}`,
      brand,
      lastFour,
      holderName: holder,
      expiration: '12/2030',
      isDefault: false,
    };
  }

  private holderFor(customerId: string): string {
    const account = this.state.accounts.get(customerId);
    return account ? `${account.firstName} ${account.lastName}`.toUpperCase() : 'TITULAR';
  }

  async createProfileFromGatewayToken(
    customerId: string,
    request: AddCardRequest,
  ): Promise<PaymentProfile> {
    const profiles = this.state.paymentProfiles.get(customerId) ?? [];
    const profile = this.profileFromToken(
      customerId,
      request.gatewayToken,
      this.holderFor(customerId),
    );
    const setDefault = request.setAsDefault || profiles.length === 0;
    if (setDefault) {
      profiles.forEach((p) => (p.isDefault = false));
      profile.isDefault = true;
      const sub = this.state.subscriptions.get(customerId);
      if (sub) sub.paymentProfile = profile;
    }
    profiles.push(profile);
    this.state.paymentProfiles.set(customerId, profiles);
    return structuredClone(profile);
  }

  async deleteProfile(customerId: string, profileId: string): Promise<void> {
    const profiles = this.state.paymentProfiles.get(customerId) ?? [];
    const idx = profiles.findIndex((p) => p.id === profileId);
    if (idx < 0) throw AppError.forbidden();
    const [removed] = profiles.splice(idx, 1);
    if (removed.isDefault && profiles.length > 0) {
      profiles[0].isDefault = true;
      const sub = this.state.subscriptions.get(customerId);
      if (sub) sub.paymentProfile = profiles[0];
    }
  }

  private pendingBill(customerId: string, billId: string): Bill {
    const bill = (this.state.bills.get(customerId) ?? []).find((b) => b.id === billId);
    if (!bill) throw AppError.forbidden();
    if (bill.status !== 'pending') {
      throw AppError.unprocessable(
        'BILL_NOT_PENDING',
        'Esta fatura não está pendente de pagamento.',
      );
    }
    return bill;
  }

  async createPixCharge(customerId: string, billId: string, now: Date): Promise<Bill> {
    const bill = this.pendingBill(customerId, billId);
    // PIX vence à meia-noite; depois disso a Prime API recobra no cartão (§4.11).
    const expires = new Date(now.getTime() + 24 * 60 * 60_000);
    bill.pix = {
      qrCodeImageUrl: `https://sandbox-app.vindi.com.br/pix/qr/${bill.id}.png`,
      qrCodeText: `00020126580014BR.GOV.BCB.PIX0136${bill.id}5204000053039865406${bill.amount.amount.toFixed(2)}5802BR5913CAFFEINE ARMY6009SAO PAULO62070503***6304FAKE`,
      expiresAt: expires.toISOString(),
    };
    return structuredClone(bill);
  }

  async chargeCurrentCard(customerId: string, billId: string, now: Date): Promise<Bill> {
    const bill = this.pendingBill(customerId, billId);
    const profiles = this.state.paymentProfiles.get(customerId) ?? [];
    const current = profiles.find((p) => p.isDefault) ?? profiles[0];
    if (!current) throw AppError.unprocessable('NO_PAYMENT_PROFILE', 'Nenhum cartão cadastrado.');
    bill.paymentProfile = current;
    bill.paymentMethod = 'credit_card';
    delete bill.pix;
    const result = await this.subscriptions.applyBillPaid(bill.id, now);
    return result!.bill;
  }

  async chargeNewCard(
    customerId: string,
    billId: string,
    request: PayWithNewCardRequest,
    now: Date,
  ): Promise<Bill> {
    const bill = this.pendingBill(customerId, billId);
    const profile = await this.createProfileFromGatewayToken(customerId, {
      gatewayToken: request.gatewayToken,
      paymentCompanyCode: request.paymentCompanyCode,
      setAsDefault: false,
    });
    bill.paymentProfile = profile;
    bill.paymentMethod = 'credit_card';
    delete bill.pix;
    const result = await this.subscriptions.applyBillPaid(bill.id, now);
    return result!.bill;
  }
}
