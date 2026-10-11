import { Bill, Subscription } from '../contracts/api';
import { SubscriptionDetail } from '../core/capabilities.service';
import { normalizeSubscriptionStatus } from '../core/subscription-status';

/**
 * Remove campos internos (não contratuais) antes de responder ao app e normaliza o status:
 * a Prime API devolve `status` como string livre; um valor desconhecido vira 'active' +
 * `rawStatus`, nunca exceção (docs/contexto-prime.md §8 item 5).
 */
export function toPublicSubscription(sub: SubscriptionDetail): Subscription {
  const { cancellationBlocked: _internal, ...publicSub } = sub;
  return { ...publicSub, ...normalizeSubscriptionStatus(publicSub.status) };
}

/** Fatura mais recente (por emissão). */
export function latestBill(bills: Bill[]): Bill | undefined {
  return [...bills].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  )[0];
}
