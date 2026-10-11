import { SubscriptionStatus } from '../contracts/api';

/** Status conhecidos da Prime API (docs/contexto-prime.md §5.2). */
export const KNOWN_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'future',
  'paused',
  'canceled',
  'fraud_review',
];

export function isKnownSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return (
    typeof value === 'string' && (KNOWN_SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Na Prime API `status` é uma string livre, não um enum (§5.2). Um valor desconhecido nunca
 * pode derrubar o BFF nem o app (§8 item 5): normalizamos para um estado genérico "ativo-like"
 * e preservamos o valor original em `rawStatus`, para o app exibir "Status: {rawStatus}".
 */
export function normalizeSubscriptionStatus(raw: unknown): {
  status: SubscriptionStatus;
  rawStatus?: string;
} {
  if (isKnownSubscriptionStatus(raw)) return { status: raw };
  const rawStatus = raw === undefined || raw === null ? 'unknown' : String(raw);
  return { status: 'active', rawStatus };
}
