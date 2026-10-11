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

  describe('canEdit / janela D-3 (America/Sao_Paulo)', () => {
    // nextBillingAt = 2026-10-22 12:00Z. D-3 = 19/10 00:00 em São Paulo = 19/10 03:00Z.
    const sub = base({ nextBillingAt: '2026-10-22T12:00:00.000Z' });

    it('permite edição antes da janela e informa quando ela fecha (D-3 00:00 SP)', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-18T23:00:00.000Z'),
      });
      expect(caps.canEdit).toEqual({ allowed: true, closesAt: '2026-10-19T00:00:00-03:00' });
      expect(caps.canChangeAddress.closesAt).toBe('2026-10-19T00:00:00-03:00');
    });

    it('um segundo antes de D-3 00:00 SP ainda permite', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-19T02:59:59.000Z'),
      });
      expect(caps.canEdit.allowed).toBe(true);
    });

    it('exatamente em D-3 00:00 SP (03:00Z) bloqueia com until = nextBillingAt', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-19T03:00:00.000Z'),
      });
      expect(caps.canEdit).toEqual({
        allowed: false,
        reason: 'EDIT_WINDOW_CLOSED',
        until: '2026-10-22T09:00:00-03:00',
      });
    });

    it('em D-2 (onde a Prime API ainda deixaria) o BFF já bloqueia: regra oficial é D-3', () => {
      const caps = service.compute({
        subscription: sub,
        now: new Date('2026-10-20T15:00:00.000Z'),
      });
      expect(caps.canEdit.reason).toBe('EDIT_WINDOW_CLOSED');
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
    it('Anual ativa com créditos, 3+ cobranças pagas e fora da janela pode pausar (maxCycles 2)', () => {
      const caps = service.compute({ subscription: base(), now });
      expect(caps.canPause).toEqual({
        allowed: true,
        closesAt: '2026-10-19T00:00:00-03:00',
        creditsLeft: 2,
        maxCycles: 2,
      });
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

    describe('mínimo de 3 cobranças pagas (a partir da 4ª)', () => {
      it('0, 1 e 2 cobranças pagas → MIN_PAID_CYCLES', () => {
        for (const paidCycles of [0, 1, 2]) {
          const caps = service.compute({
            subscription: base({ paidCycles, currentCycle: paidCycles + 1 }),
            now,
          });
          expect(caps.canPause).toEqual({
            allowed: false,
            reason: 'MIN_PAID_CYCLES',
            creditsLeft: 2,
            maxCycles: 2,
          });
        }
      });
      it('exatamente 3 cobranças pagas já permite', () => {
        const caps = service.compute({
          subscription: base({ paidCycles: 3, currentCycle: 4 }),
          now,
        });
        expect(caps.canPause.allowed).toBe(true);
      });
      it('créditos zerados vencem o mínimo de ciclos na ordem das razões', () => {
        const caps = service.compute({
          subscription: base({ paidCycles: 1, pauseCreditsLeft: 0 }),
          now,
        });
        expect(caps.canPause.reason).toBe('NO_PAUSE_CREDITS');
      });
    });

    describe('pedido de pausa só até D-3 (America/Sao_Paulo)', () => {
      // nextBillingAt = 22/10 12:00Z → janela fecha em 19/10 00:00 SP = 19/10 03:00Z.
      const sub = base({ nextBillingAt: '2026-10-22T12:00:00.000Z' });
      it('um segundo antes de D-3 00:00 SP permite', () => {
        const caps = service.compute({
          subscription: sub,
          now: new Date('2026-10-19T02:59:59.000Z'),
        });
        expect(caps.canPause.allowed).toBe(true);
      });
      it('em D-3 00:00 SP → PAUSE_WINDOW_CLOSED com until = nextBillingAt', () => {
        const caps = service.compute({
          subscription: sub,
          now: new Date('2026-10-19T03:00:00.000Z'),
        });
        expect(caps.canPause).toEqual({
          allowed: false,
          reason: 'PAUSE_WINDOW_CLOSED',
          until: '2026-10-22T09:00:00-03:00',
          creditsLeft: 2,
          maxCycles: 2,
        });
      });
      it('na véspera da cobrança continua fechada; reabre em nextBillingAt', () => {
        expect(
          service.compute({ subscription: sub, now: new Date('2026-10-21T23:00:00.000Z') }).canPause
            .reason,
        ).toBe('PAUSE_WINDOW_CLOSED');
        expect(
          service.compute({ subscription: sub, now: new Date('2026-10-22T12:00:00.000Z') }).canPause
            .allowed,
        ).toBe(true);
      });
    });

    it('já pausada → SUBSCRIPTION_NOT_ACTIVE e canResume permitido (fora da janela D-5)', () => {
      const caps = service.compute({ subscription: base({ status: 'paused' }), now });
      expect(caps.canPause.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
      expect(caps.canResume).toEqual({ allowed: true, closesAt: '2026-10-17T00:00:00-03:00' });
    });
    it('ativa não pode retomar (NOT_PAUSED)', () => {
      expect(service.compute({ subscription: base(), now }).canResume.reason).toBe('NOT_PAUSED');
    });
  });

  describe('canResume / desfazer a pausa só até D-5 (America/Sao_Paulo)', () => {
    // Cobrança do ciclo pausado = nextBillingAt = 22/10 12:00Z → D-5 = 17/10 00:00 SP = 17/10 03:00Z.
    const paused = base({
      status: 'paused',
      nextBillingAt: '2026-10-22T12:00:00.000Z',
      pause: {
        cycles: 1,
        remainingCycles: 1,
        pausedAt: '2026-10-01T12:00:00.000Z',
        resumeAt: '2026-11-22T12:00:00.000Z',
      },
    });

    it('um segundo antes de D-5 00:00 SP permite desfazer e informa o fechamento', () => {
      const caps = service.compute({
        subscription: paused,
        now: new Date('2026-10-17T02:59:59.000Z'),
      });
      expect(caps.canResume).toEqual({ allowed: true, closesAt: '2026-10-17T00:00:00-03:00' });
    });

    it('exatamente em D-5 00:00 SP → RESUME_WINDOW_CLOSED com until = cobrança', () => {
      const caps = service.compute({
        subscription: paused,
        now: new Date('2026-10-17T03:00:00.000Z'),
      });
      expect(caps.canResume).toEqual({
        allowed: false,
        reason: 'RESUME_WINDOW_CLOSED',
        until: '2026-10-22T09:00:00-03:00',
      });
    });

    it('D-4 e véspera continuam fechadas; a partir da cobrança reabre para o ciclo seguinte', () => {
      expect(
        service.compute({ subscription: paused, now: new Date('2026-10-18T12:00:00.000Z') })
          .canResume.reason,
      ).toBe('RESUME_WINDOW_CLOSED');
      expect(
        service.compute({ subscription: paused, now: new Date('2026-10-22T11:59:59.000Z') })
          .canResume.reason,
      ).toBe('RESUME_WINDOW_CLOSED');
      expect(
        service.compute({ subscription: paused, now: new Date('2026-10-22T12:00:00.000Z') })
          .canResume.allowed,
      ).toBe(true);
    });

    it('sem nextBillingAt válido usa pause.resumeAt como referência', () => {
      const sub = base({
        ...paused,
        nextBillingAt: 'inválida',
      });
      // resumeAt 22/11 12:00Z → D-5 = 17/11 00:00 SP (03:00Z).
      expect(
        service.compute({ subscription: sub, now: new Date('2026-11-17T02:00:00.000Z') }).canResume
          .allowed,
      ).toBe(true);
      expect(
        service.compute({ subscription: sub, now: new Date('2026-11-17T03:00:00.000Z') }).canResume
          .reason,
      ).toBe('RESUME_WINDOW_CLOSED');
    });
  });

  describe('canCancel / canReactivate', () => {
    it('fidelidade em vigor (remaining > 0) → COMMITMENT_ACTIVE com commitmentEndsAt estimado', () => {
      const caps = service.compute({ subscription: base({ remainingCommitmentMonths: 4 }), now });
      // nextBillingAt 22/10 12:00Z + 4 meses = 22/02/2027 12:00Z = 09:00 em São Paulo.
      expect(caps.canCancel).toEqual({
        allowed: false,
        reason: 'COMMITMENT_ACTIVE',
        until: '2027-02-22T09:00:00-03:00',
        remainingCommitmentMonths: 4,
        earlyWindow: true,
        commitmentEndsAt: '2027-02-22T09:00:00-03:00',
      });
      expect(caps.canReactivate.reason).toBe('NOT_CANCELED');
    });

    describe('fidelidade cumprida (remaining = 0): janela até o dia anterior à cobrança', () => {
      // nextBillingAt = 22/10 12:00Z. 00:00 SP do dia da cobrança = 22/10 03:00Z.
      const done = base({ remainingCommitmentMonths: 0, paidCycles: 12, currentCycle: 13 });
      it('depois do último pagamento e antes do dia da cobrança → permitido', () => {
        const caps = service.compute({
          subscription: done,
          now: new Date('2026-10-21T23:00:00.000Z'),
        });
        expect(caps.canCancel).toEqual({
          allowed: true,
          closesAt: '2026-10-22T00:00:00-03:00',
          remainingCommitmentMonths: 0,
          earlyWindow: false,
          commitmentEndsAt: '2026-10-22T09:00:00-03:00',
        });
      });
      it('um segundo antes de 00:00 SP do dia da cobrança ainda permite', () => {
        const caps = service.compute({
          subscription: done,
          now: new Date('2026-10-22T02:59:59.000Z'),
        });
        expect(caps.canCancel.allowed).toBe(true);
      });
      it('em 00:00 SP do dia da cobrança → CANCEL_WINDOW_CLOSED com until = nextBillingAt', () => {
        const caps = service.compute({
          subscription: done,
          now: new Date('2026-10-22T03:00:00.000Z'),
        });
        expect(caps.canCancel).toMatchObject({
          allowed: false,
          reason: 'CANCEL_WINDOW_CLOSED',
          until: '2026-10-22T09:00:00-03:00',
        });
      });
    });

    it('Mensal (-1) sempre pode cancelar, sem janela antecipada nem commitmentEndsAt', () => {
      const caps = service.compute({
        subscription: base({
          frequency: 'Mensal',
          remainingCommitmentMonths: -1,
          pauseCreditsLeft: 0,
        }),
        now,
      });
      expect(caps.canCancel).toEqual({
        allowed: true,
        remainingCommitmentMonths: -1,
        earlyWindow: false,
      });
    });

    it('pausada com fidelidade cumprida pode cancelar', () => {
      const caps = service.compute({
        subscription: base({ status: 'paused', remainingCommitmentMonths: 0 }),
        now,
      });
      expect(caps.canCancel.allowed).toBe(true);
    });

    it('cancelada não pode cancelar de novo, mas pode reativar', () => {
      const caps = service.compute({ subscription: base({ status: 'canceled' }), now });
      expect(caps.canCancel.allowed).toBe(false);
      expect(caps.canCancel.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
      expect(caps.canReactivate).toEqual({ allowed: true });
      expect(caps.canChangeCard.reason).toBe('SUBSCRIPTION_NOT_ACTIVE');
    });

    it('cancellationBlocked → CANCELLATION_BLOCKED (vence a fidelidade)', () => {
      const caps = service.compute({
        subscription: base({ cancellationBlocked: true, remainingCommitmentMonths: 0 }),
        now,
      });
      expect(caps.canCancel.reason).toBe('CANCELLATION_BLOCKED');
      expect(
        service.compute({ subscription: base({ cancellationBlocked: true }), now }).canCancel
          .reason,
      ).toBe('CANCELLATION_BLOCKED');
    });
  });

  describe('status desconhecido (string livre na Prime API)', () => {
    it('vira ativo-like: não lança, calcula capabilities como active', () => {
      const sub = base({ status: 'suspended' as Subscription['status'] });
      expect(() => service.compute({ subscription: sub, now })).not.toThrow();
      const caps = service.compute({ subscription: sub, now });
      expect(caps.canEdit.allowed).toBe(true);
      expect(caps.canReactivate.reason).toBe('NOT_CANCELED');
    });
  });

  it('sem assinatura: tudo negado e sem pendência', () => {
    const caps = service.compute({ subscription: null, latestBill: bill('pending'), now });
    expect(caps.canEdit.allowed).toBe(false);
    expect(caps.canPause.allowed).toBe(false);
    expect(caps.canReactivate.reason).toBe('NOT_CANCELED');
    expect(caps.hasPendingBill).toBe(false);
  });

  it('nextBillingAt inválido não fecha nenhuma janela e não gera commitmentEndsAt', () => {
    const sub = base({ nextBillingAt: 'não-é-data' }) as Subscription;
    expect(service.editWindow(sub, now)).toEqual({ closed: false });
    expect(service.pauseWindow(sub, now)).toEqual({ closed: false });
    expect(service.commitmentEndsAt(sub)).toBeUndefined();
    const caps = service.compute({ subscription: { ...sub, remainingCommitmentMonths: 0 }, now });
    expect(caps.canCancel.allowed).toBe(true);
  });
});
