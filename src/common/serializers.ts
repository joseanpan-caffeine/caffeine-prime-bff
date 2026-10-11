import { Bill, Subscription } from '../contracts/api';
import { SubscriptionDetail } from '../core/capabilities.service';

/** Remove campos internos (não contratuais) antes de responder ao app. */
export function toPublicSubscription(sub: SubscriptionDetail): Subscription {
  const { cancellationBlocked: _internal, ...publicSub } = sub;
  return publicSub;
}

/** Fatura mais recente (por emissão). */
export function latestBill(bills: Bill[]): Bill | undefined {
  return [...bills].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  )[0];
}
