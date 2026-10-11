import { Bill, Subscription } from '../contracts/api';
import { CapabilitiesService, SubscriptionDetail } from './capabilities.service';
import { brl } from './money';

const base = (over: Partial<SubscriptionDetail> = {}): SubscriptionDetail => ({
  id: 'sub-1',
  status: 'active',
  frequency: 'Anual',
  planName: 'Prime Anual',
  startedAt: '2026-03-01T12:00:00.000Z',
  nextBillingAt: '2026-10-22T12:00:00.000Z',
  currentCycle: 8,
  paidCycles: 7,
  remainingCommitmentMonths: 5,
  pauseCreditsLeft: 2,
  items: [],
  discount: { percentage: 25 },
  subtotal: brl(0),
  totalDiscount: brl(0),
  total: brl(0),
  cancellationBlocked: false,
  ...over,
});

const bill = (status: Bill['status']): Bill => ({
  id: 'bill-1',
  cycle: 8,
  status,
  issuedAt: '2026-10-08T12:00:00.000Z',
  dueAt: '2026-10-11T12:00:00.000Z',
  amount: brl(216.9),
  items: [],
});

describe('CapabilitiesService', () => {
  const service = new CapabilitiesService();
  const now = new Date('2026-10-10T15:00:00.000Z');

  describe('canEdit / janela D-2 (America/Sao_Paulo)', () => {
    // nextBillingAt = 2026-10-22 12:00Z. D-2 = 20/10 00:00 em São Paulo = 20/10 03:00Z.
    const sub = base({ nextBillingAt: '2026-10-22T12:00:00.000Z' });

    it('permite edição antes da janela', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-19T23:00:00.000Z'),
      });
      expect(caps.canEdit).toEqual({ allowed: true });
    });

    it('um segundo antes de D-2 00:00 SP ainda permite', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-20T02:59:59.000Z'),
      });
      expect(caps.canEdit.allowed).toBe(true);
    });

    it('exatamente em D-2 00:00 SP (03:00Z) bloqueia com until = nextBillingAt', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-20T03:00:00.000Z'),
      });
      expect(caps.canEdit).toEqual({
        allowed: false,
        reason: 'EDIT_WINDOW_CLOSED',
        until: '2026-10-22T09:00:00-03:00',
      });
    });

    it('bloqueia no dia anterior à cobrança', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-21T18:00:00.000Z'),
      });
      expect(caps.canEdit.reason).toBe('EDIT_WINDOW_CLOSED');
      expect(caps.canChangeAddress.reason).toBe('EDIT_WINDOW_CLOSED');
    });

    it('reabre a partir de nextBillingAt', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-22T12:00:00.000Z'),
      });
      expect(caps.canEdit.allowed).toBe(true);
    });

    it('fatura pendente bloqueia com PENDING_BILL e expõe pendingBill', () => {
      const caps = service.compute({ subscription: sub, latestBill: bill('pending'), now });
      expect(caps.canEdit).toEqual({ allowed: false, reason: 'PENDING_BILL' });
      expect(caps.hasPendingBill).toBe(true);
      expect(caps.pendingBill).toEqual({
        id: 'bill-1',
        amount: brl(216.9),
        dueAt: '2026-10-11T12:00:00.000Z',
        pixAvailable: true,
      });
    });

    it('fatura paga não marca pendência', () => {
      const caps = service.compute({ subscription: sub, latestBill: bill('paid'), now });
      expect(caps.hasPendingBill).toBe(false);
      expect(caps.pendingBill).toBeUndefined();
    });

    it('assinatura pausada não pode editar (SUBSCRIPTION_NOT_ACTIVE)', () => {
      const caps = service.compute({ subscription: base({ status: 'paused' }), now });
      expect(caps.canEdit.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
    });

    it('fraud_review bloqueia tudo com UNDER_REVIEW', () => {
      const caps = service.compute({ subscription: base({ status: 'fraud_review' }), now });
      expect(caps.canEdit.reason).toBe('UNDER_REVIEW');
      expect(caps.canPause.reason).toBe('UNDER_REVIEW');
      expect(caps.canCancel.reason).toBe('UNDER_REVIEW');
      expect(caps.canChangeCard.reason).toBe('UNDER_REVIEW');
      expect(caps.canChangeAddress.reason).toBe('UNDER_REVIEW');
    });
  });

  describe('canPause', () => {
    it('Anual ativa com créditos pode pausar (maxCycles 2)', () => {
      const caps = service.compute({ subscription: base(), now });
      expect(caps.canPause).toEqual({ allowed: true, creditsLeft: 2, maxCycles: 2 });
    });
    it('Semestral com 1 crédito pode pausar', () => {
      const caps = service.compute({
        subscription: base({ frequency: 'Semestral', pauseCreditsLeft: 1 }),
        now,
      });
      expect(caps.canPause.allowed).toBe(true);
      expect(caps.canPause.creditsLeft).toBe(1);
    });
    it('Trimestral e Mensal não são elegíveis', () => {
      expect(
        service.compute({
          subscription: base({ frequency: 'Trimestral', pauseCreditsLeft: 0 }),
          now,
        }).canPause.reason,
      ).toBe('FREQUENCY_NOT_ELIGIBLE');
      expect(
        service.compute({
          subscription: base({
            frequency: 'Mensal',
            pauseCreditsLeft: 0,
            remainingCommitmentMonths: -1,
          }),
          now,
        }).canPause.reason,
      ).toBe('FREQUENCY_NOT_ELIGIBLE');
    });
    it('sem créditos → NO_PAUSE_CREDITS', () => {
      const caps = service.compute({ subscription: base({ pauseCreditsLeft: 0 }), now });
      expect(caps.canPause).toEqual({
        allowed: false,
        reason: 'NO_PAUSE_CREDITS',
        creditsLeft: 0,
        maxCycles: 2,
      });
    });
    it('já pausada → SUBSCRIPTION_NOT_ACTIVE e canResume permitido', () => {
      const caps = service.compute({ subscription: base({ status: 'paused' }), now });
      expect(caps.canPause.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
      expect(caps.canResume).toEqual({ allowed: true });
    });
    it('ativa não pode retomar (NOT_PAUSED)', () => {
      expect(service.compute({ subscription: base(), now }).canResume.reason).toBe('NOT_PAUSED');
    });
  });

  describe('canCancel / canReactivate', () => {
    it('ativa pode cancelar e informa fidelidade', () => {
      const caps = service.compute({ subscription: base({ remainingCommitmentMonths: 4 }), now });
      expect(caps.canCancel).toEqual({
        allowed: true,
        remainingCommitmentMonths: 4,
        earlyWindow: true,
      });
      expect(caps.canReactivate.reason).toBe('NOT_CANCELED');
    });
    it('Mensal (-1) não está em janela antecipada', () => {
      const caps = service.compute({
        subscription: base({
          frequency: 'Mensal',
          remainingCommitmentMonths: -1,
          pauseCreditsLeft: 0,
        }),
        now,
      });
      expect(caps.canCancel.earlyWindow).toBe(false);
    });
    it('cancelada não pode cancelar de novo, mas pode reativar', () => {
      const caps = service.compute({ subscription: base({ status: 'canceled' }), now });
      expect(caps.canCancel.allowed).toBe(false);
      expect(caps.canCancel.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
      expect(caps.canReactivate).toEqual({ allowed: true });
      expect(caps.canChangeCard.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
    });
    it('cancellationBlocked → CANCELLATION_BLOCKED', () => {
      const caps = service.compute({ subscription: base({ cancellationBlocked: true }), now });
      expect(caps.canCancel.reason).toBe('CANCELLATION_BLOCKED');
    });
  });

  it('sem assinatura: tudo negado e sem pendência', () => {
    const caps = service.compute({ subscription: null, latestBill: bill('pending'), now });
    expect(caps.canEdit.allowed).toBe(false);
    expect(caps.canPause.allowed).toBe(false);
    expect(caps.canReactivate.reason).toBe('NOT_CANCELED');
    expect(caps.hasPendingBill).toBe(false);
  });

  it('nextBillingAt inválido não fecha a janela', () => {
    const sub = base({ nextBillingAt: 'não-é-data' }) as Subscription;
    expect(service.editWindow(sub, now)).toEqual({ closed: false });
  });
});
