import { Inject, Injectable } from '@nestjs/common';
import { SubscriptionDetail } from '../core/capabilities.service';
import {
  DEVICE_STORE,
  DeviceStore,
  PAYMENT_GATEWAY,
  PaymentGateway,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../ports';
import { OwnedResourceKind } from './decorators';
import { AppError } from './errors';

/**
 * Propriedade de segurança central do BFF (docs-arquitetura §4.2): o app nunca envia o
 * `shopifyCustomerId`; todo id de assinatura/fatura/cartão/dispositivo vindo na requisição é
 * conferido contra o que pertence ao cliente do token. Qualquer coisa fora disso → 403.
 */
@Injectable()
export class OwnershipService {
  constructor(
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(PAYMENT_GATEWAY) private readonly payments: PaymentGateway,
    @Inject(DEVICE_STORE) private readonly devices: DeviceStore,
  ) {}

  /** Assinatura do cliente logado; 404 quando não há. */
  async requireSubscription(customerId: string): Promise<SubscriptionDetail> {
    const sub = await this.subscriptions.getByCustomer(customerId);
    if (!sub)
      throw AppError.notFound('NO_SUBSCRIPTION', 'Você ainda não tem uma assinatura Prime.');
    return sub;
  }

  async owns(kind: OwnedResourceKind, customerId: string, id: string): Promise<boolean> {
    switch (kind) {
      case 'bill': {
        const bills = await this.subscriptions.getBills(customerId);
        return bills.some((b) => b.id === id);
      }
      case 'paymentProfile': {
        const profiles = await this.payments.listProfiles(customerId);
        return profiles.some((p) => p.id === id);
      }
      case 'device': {
        const devices = await this.devices.listByCustomer(customerId);
        return devices.some((d) => d.id === id);
      }
      case 'subscriptionItem': {
        const sub = await this.subscriptions.getByCustomer(customerId);
        return Boolean(sub?.items.some((i) => i.id === id));
      }
      default:
        return false;
    }
  }

  async assertOwns(kind: OwnedResourceKind, customerId: string, id: string): Promise<void> {
    if (!(await this.owns(kind, customerId, id))) {
      throw AppError.forbidden('FORBIDDEN', 'Este recurso não pertence à sua conta.', { kind });
    }
  }
}
