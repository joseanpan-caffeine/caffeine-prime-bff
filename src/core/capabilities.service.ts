import { Bill, Capabilities, Capability, Frequency, Subscription } from '../contracts/api';
import { addDays, startOfDayInSaoPaulo, toSaoPauloIso } from './timezone';

/** Créditos de pausa por frequência (Prime API §4.5). */
export const PAUSE_CREDITS_BY_FREQUENCY: Record<Frequency, number> = {
  Anual: 2,
  Semestral: 1,
  Trimestral: 0,
  Mensal: 0,
};

/** Número máximo de ciclos que o cliente pode pausar de uma vez. */
export const MAX_PAUSE_CYCLES = 2;

/** Frequências que permitem pausa iniciada pelo cliente. */
export const PAUSE_ELIGIBLE_FREQUENCIES: Frequency[] = ['Semestral', 'Anual'];

/** Dias antes da cobrança em que a edição fica bloqueada (D-2). */
export const EDIT_WINDOW_DAYS = 2;

/**
 * Dados internos que a Prime API conhece mas que não fazem parte do contrato público
 * (ex.: `cancellationBlocked` do agendamento).
 */
export interface SubscriptionDetail extends Subscription {
  cancellationBlocked?: boolean;
}

export interface CapabilitiesInput {
  subscription: SubscriptionDetail | null;
  latestBill?: Bill | null;
  now: Date;
}

const allowed = (): Capability => ({ allowed: true });
const denied = (reason: Capability['reason'], until?: string): Capability => ({
  allowed: false,
  reason,
  ...(until ? { until } : {}),
});

/**
 * Calcula o bloco `capabilities` do dashboard. Regras em ROUTES.md "Regras" e docs-arquitetura §6.
 * Serviço puro: sem dependências externas, sem IO; toda a noção de "agora" vem por parâmetro.
 */
export class CapabilitiesService {
  compute(input: CapabilitiesInput): Capabilities {
    const { subscription, now } = input;
    const latestBill = input.latestBill ?? undefined;

    const pendingBill = latestBill && latestBill.status === 'pending' ? latestBill : undefined;
    const hasPendingBill = Boolean(pendingBill);

    if (!subscription) {
      return {
        canEdit: denied('SUBSCRIPTION_NOT_ACTIVE'),
        canPause: denied('SUBSCRIPTION_NOT_ACTIVE'),
        canResume: denied('NOT_PAUSED'),
        canCancel: denied('SUBSCRIPTION_NOT_ACTIVE'),
        canReactivate: denied('NOT_CANCELED'),
        canChangeCard: denied('SUBSCRIPTION_NOT_ACTIVE'),
        canChangeAddress: denied('SUBSCRIPTION_NOT_ACTIVE'),
        hasPendingBill: false,
      };
    }

    const window = this.editWindow(subscription, now);

    return {
      canEdit: this.canEdit(subscription, hasPendingBill, window),
      canPause: this.canPause(subscription),
      canResume: subscription.status === 'paused' ? allowed() : denied('NOT_PAUSED'),
      canCancel: this.canCancel(subscription),
      canReactivate: subscription.status === 'canceled' ? allowed() : denied('NOT_CANCELED'),
      canChangeCard: this.canChangeCard(subscription),
      canChangeAddress: this.canChangeAddress(subscription, window),
      hasPendingBill,
      ...(pendingBill
        ? {
            pendingBill: {
              id: pendingBill.id,
              amount: pendingBill.amount,
              dueAt: pendingBill.dueAt,
              // O PIX pode ser gerado para qualquer fatura pendente (Prime API createPixCharge).
              pixAvailable: true,
            },
          }
        : {}),
    };
  }

  /**
   * Janela de bloqueio: de D-2 00:00 (America/Sao_Paulo) até `nextBillingAt`.
   * Retorna `closed=true` e o instante `until` (= nextBillingAt) quando estamos dentro dela.
   */
  editWindow(subscription: Subscription, now: Date): { closed: boolean; until?: string } {
    if (!subscription.nextBillingAt) return { closed: false };
    const nextBilling = new Date(subscription.nextBillingAt);
    if (Number.isNaN(nextBilling.getTime())) return { closed: false };
    const windowStart = startOfDayInSaoPaulo(addDays(nextBilling, -EDIT_WINDOW_DAYS));
    const closed = now.getTime() >= windowStart.getTime() && now.getTime() < nextBilling.getTime();
    return closed ? { closed, until: toSaoPauloIso(nextBilling) } : { closed };
  }

  private statusBlock(subscription: Subscription): Capability | null {
    if (subscription.status === 'fraud_review') return denied('UNDER_REVIEW');
    if (subscription.status !== 'active') return denied('SUBSCRIPTION_NOT_ACTIVE');
    return null;
  }

  private canEdit(
    subscription: Subscription,
    hasPendingBill: boolean,
    window: { closed: boolean; until?: string },
  ): Capability {
    const block = this.statusBlock(subscription);
    if (block) return block;
    if (hasPendingBill) return denied('PENDING_BILL');
    if (window.closed) return denied('EDIT_WINDOW_CLOSED', window.until);
    return allowed();
  }

  private canPause(subscription: Subscription): Capabilities['canPause'] {
    const extra = { creditsLeft: subscription.pauseCreditsLeft, maxCycles: MAX_PAUSE_CYCLES };
    const block = this.statusBlock(subscription);
    if (block) return { ...block, ...extra };
    if (!PAUSE_ELIGIBLE_FREQUENCIES.includes(subscription.frequency)) {
      return { ...denied('FREQUENCY_NOT_ELIGIBLE'), ...extra };
    }
    if (subscription.pauseCreditsLeft <= 0) return { ...denied('NO_PAUSE_CREDITS'), ...extra };
    return { ...allowed(), ...extra };
  }

  private canCancel(subscription: SubscriptionDetail): Capabilities['canCancel'] {
    const remaining = subscription.remainingCommitmentMonths;
    const extra = {
      remainingCommitmentMonths: remaining,
      // earlyWindow: cancelamento dentro do período de fidelidade (ainda há meses restantes).
      earlyWindow: remaining > 0,
    };
    if (subscription.status === 'canceled')
      return { ...denied('SUBSCRIPTION_NOT_ACTIVE'), ...extra };
    if (subscription.status === 'fraud_review') return { ...denied('UNDER_REVIEW'), ...extra };
    if (subscription.cancellationBlocked) return { ...denied('CANCELLATION_BLOCKED'), ...extra };
    return { ...allowed(), ...extra };
  }

  private canChangeCard(subscription: Subscription): Capability {
    if (subscription.status === 'fraud_review') return denied('UNDER_REVIEW');
    if (subscription.status === 'canceled') return denied('SUBSCRIPTION_NOT_ACTIVE');
    return allowed();
  }

  private canChangeAddress(
    subscription: Subscription,
    window: { closed: boolean; until?: string },
  ): Capability {
    if (subscription.status === 'fraud_review') return denied('UNDER_REVIEW');
    if (subscription.status === 'canceled') return denied('SUBSCRIPTION_NOT_ACTIVE');
    // O pedido do ciclo é gerado na cobrança; trocar endereço dentro da janela conflita com ele.
    if (window.closed) return denied('EDIT_WINDOW_CLOSED', window.until);
    return allowed();
  }
}
