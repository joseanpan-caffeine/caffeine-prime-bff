import { isKnownSubscriptionStatus, normalizeSubscriptionStatus } from './subscription-status';

describe('normalizeSubscriptionStatus', () => {
  it('mantém os status conhecidos sem rawStatus', () => {
    for (const s of ['active', 'future', 'paused', 'canceled', 'fraud_review'] as const) {
      expect(normalizeSubscriptionStatus(s)).toEqual({ status: s });
      expect(isKnownSubscriptionStatus(s)).toBe(true);
    }
  });

  it('status desconhecido vira active + rawStatus, nunca lança', () => {
    expect(normalizeSubscriptionStatus('suspended')).toEqual({
      status: 'active',
      rawStatus: 'suspended',
    });
    expect(normalizeSubscriptionStatus('ACTIVE')).toEqual({
      status: 'active',
      rawStatus: 'ACTIVE',
    });
    expect(normalizeSubscriptionStatus(42)).toEqual({ status: 'active', rawStatus: '42' });
    expect(normalizeSubscriptionStatus(undefined)).toEqual({
      status: 'active',
      rawStatus: 'unknown',
    });
    expect(normalizeSubscriptionStatus(null)).toEqual({ status: 'active', rawStatus: 'unknown' });
  });
});
