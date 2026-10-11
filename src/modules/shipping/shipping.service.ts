import { Inject, Injectable } from '@nestjs/common';
import { AddressQuote, ShippingAddress, UpdateAddressRequest } from '../../contracts/api';
import { CapabilitiesService } from '../../core/capabilities.service';
import { AppError } from '../../common/errors';
import { OwnershipService } from '../../common/ownership.service';
import { latestBill } from '../../common/serializers';
import {
  CLOCK,
  Clock,
  SHIPPING_QUOTER,
  ShippingQuoter,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../../ports';

/** Endereço de entrega: CEP → cotação → salvar (com a opção escolhida congelada na assinatura). */
@Injectable()
export class ShippingService {
  constructor(
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(SHIPPING_QUOTER) private readonly quoter: ShippingQuoter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ownership: OwnershipService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async getAddress(customerId: string): Promise<ShippingAddress> {
    const sub = await this.ownership.requireSubscription(customerId);
    const address = await this.subscriptions.getShippingAddress(sub.id);
    if (!address) throw AppError.notFound('NO_ADDRESS', 'Assinatura sem endereço de entrega.');
    return address;
  }

  quote(postalCode: string): Promise<AddressQuote> {
    return this.quoter.quote(postalCode);
  }

  async updateAddress(customerId: string, request: UpdateAddressRequest): Promise<ShippingAddress> {
    const sub = await this.ownership.requireSubscription(customerId);
    const bills = await this.subscriptions.getBills(customerId);
    const caps = this.capabilities.compute({
      subscription: sub,
      latestBill: latestBill(bills),
      now: this.clock.now(),
    });
    if (!caps.canChangeAddress.allowed) {
      throw AppError.capabilityDenied(
        caps.canChangeAddress.reason!,
        caps.canChangeAddress.until ? { until: caps.canChangeAddress.until } : undefined,
      );
    }
    if (!sub.shippingAddress)
      throw AppError.notFound('NO_ADDRESS', 'Assinatura sem endereço de entrega.');
    // Recota para garantir que a opção escolhida vale para este CEP (o app não é confiável).
    const quote = await this.quoter.quote(request.postalCode);
    const option = quote.options.find((o) => o.id === request.quoteOptionId);
    if (!option)
      throw AppError.unprocessable(
        'INVALID_QUOTE_OPTION',
        'Opção de frete inválida para este CEP. Refaça a cotação.',
      );
    return this.subscriptions.updateShippingAddress(
      sub.id,
      sub.shippingAddress.id,
      request,
      option,
    );
  }
}
