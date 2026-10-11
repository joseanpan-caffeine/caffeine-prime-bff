import { Bill, Capabilities, Capability, Frequency, Subscription } from '../contracts/api';
import { normalizeSubscriptionStatus } from './subscription-status';
import { addDays, addMonths, startOfDayInSaoPaulo, toSaoPauloIso } from './timezone';

/** Créditos de pausa por frequência (docs/contexto-prime.md §6.2). */
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

/**
 * Dias antes da cobrança em que a edição da caixa fica bloqueada.
 *
 * Regra oficial [REGRA]: D-3 (docs/contexto-prime.md §6.1). A Prime API, por sua vez, só
 * bloqueia em D-2 [SISTEMA] (§6.3, "janela de edição"). O BFF segue a regra oficial e bloqueia
 * em D-3; entre D-3 e D-2 a Prime API aceitaria a edição, mas o app não a oferece.
 */
export const EDIT_WINDOW_DAYS = 3;

/** Pedido de pausa só até D-3 da próxima cobrança (§6.1). */
export const PAUSE_WINDOW_DAYS = 3;

/** Desfazer a pausa só até D-5 da cobrança do ciclo pausado (§6.1). */
export const RESUME_WINDOW_DAYS = 5;

/** Pausa só depois de 3 cobranças pagas, ou seja, a partir da 4ª (§6.1). */
export const MIN_PAID_CYCLES_FOR_PAUSE = 3;

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

/** Resultado de uma janela de bloqueio "de D-n 00:00 (São Paulo) até a cobrança". */
export interface BlockingWindow {
  closed: boolean;
  /** Instante em que a janela abre de novo (ISO com offset de São Paulo). */
  until?: string;
  /** Quando ainda aberta: instante em que vai fechar (D-n 00:00 em São Paulo). */
  closesAt?: string;
}

const allowed = (closesAt?: string): Capability => ({
  allowed: true,
  ...(closesAt ? { closesAt } : {}),
});
const denied = (reason: Capability['reason'], until?: string): Capability => ({
  allowed: false,
  reason,
  ...(until ? { until } : {}),
});

function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Calcula o bloco `capabilities` do dashboard. Regras oficiais em docs/contexto-prime.md §6.1,
 * resumidas em ROUTES.md "Regras". Todas as janelas são calculadas no fuso America/Sao_Paulo,
 * nunca no do aparelho. Serviço puro: sem dependências externas, sem IO; toda a noção de "agora"
 * vem por parâmetro.
 */
export class CapabilitiesService {
  compute(input: CapabilitiesInput): Capabilities {
    const { now } = input;
    const latestBill = input.latestBill ?? undefined;

    const pendingBill = latestBill && latestBill.status === 'pending' ? latestBill : undefined;
    const hasPendingBill = Boolean(pendingBill);

    if (!input.subscription) {
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

    // Status desconhecido vira "ativo-like" com rawStatus, nunca exceção (§8 item 5).
    const subscription: SubscriptionDetail = {
      ...input.subscription,
      ...normalizeSubscriptionStatus(input.subscription.status),
    };

    const window = this.editWindow(subscription, now);

    return {
      canEdit: this.canEdit(subscription, hasPendingBill, window),
      canPause: this.canPause(subscription, now),
      canResume: this.canResume(subscription, now),
      canCancel: this.canCancel(subscription, now),
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
   * Janela genérica: fechada de D-`days` 00:00 (America/Sao_Paulo) até `billingAt`.
   * Devolve `closed=true` e `until` (= billingAt) quando `now` está dentro dela.
   * Exemplo: cobrança em 22/10 12:00Z e days=3 → fecha em 19/10 00:00 SP (= 19/10 03:00Z).
   */
  windowBefore(billingAt: string | undefined, days: number, now: Date): BlockingWindow {
    const billing = parseDate(billingAt);
    if (!billing) return { closed: false };
    const windowStart = startOfDayInSaoPaulo(addDays(billing, -days));
    const closed = now.getTime() >= windowStart.getTime() && now.getTime() < billing.getTime();
    if (closed) return { closed, until: toSaoPauloIso(billing) };
    // Antes da janela: informar quando fecha. Depois da cobrança (nextBillingAt desatualizado)
    // não há o que informar.
    return now.getTime() < windowStart.getTime()
      ? { closed, closesAt: toSaoPauloIso(windowStart) }
      : { closed };
  }

  /** Janela de edição da caixa: de D-3 00:00 (America/Sao_Paulo) até `nextBillingAt`. */
  editWindow(subscription: Subscription, now: Date): BlockingWindow {
    return this.windowBefore(subscription.nextBillingAt, EDIT_WINDOW_DAYS, now);
  }

  /** Janela do pedido de pausa: de D-3 00:00 (America/Sao_Paulo) até `nextBillingAt`. */
  pauseWindow(subscription: Subscription, now: Date): BlockingWindow {
    return this.windowBefore(subscription.nextBillingAt, PAUSE_WINDOW_DAYS, now);
  }

  /**
   * Janela para desfazer a pausa: de D-5 00:00 (America/Sao_Paulo) até a cobrança do ciclo
   * pausado. A referência é `nextBillingAt` (a próxima cobrança, que sairá com R$ 0,00 enquanto
   * a pausa valer); se não vier, cai em `pause.resumeAt`.
   */
  resumeWindow(subscription: Subscription, now: Date): BlockingWindow {
    const reference = parseDate(subscription.nextBillingAt)
      ? subscription.nextBillingAt
      : subscription.pause?.resumeAt;
    return this.windowBefore(reference, RESUME_WINDOW_DAYS, now);
  }

  /**
   * Estimativa do fim da fidelidade: nextBillingAt + meses restantes. Para remaining=0 é a
   * própria próxima cobrança (a janela de cancelamento vai até o dia anterior a ela). Mensal
   * (remaining=-1) não tem fidelidade → undefined.
   */
  commitmentEndsAt(subscription: Subscription): string | undefined {
    const remaining = subscription.remainingCommitmentMonths;
    if (remaining < 0) return undefined;
    const next = parseDate(subscription.nextBillingAt);
    if (!next) return undefined;
    return toSaoPauloIso(addMonths(next, remaining));
  }

  private statusBlock(subscription: Subscription): Capability | null {
    if (subscription.status === 'fraud_review') return denied('UNDER_REVIEW');
    if (subscription.status !== 'active') return denied('SUBSCRIPTION_NOT_ACTIVE');
    return null;
  }

  private canEdit(
    subscription: Subscription,
    hasPendingBill: boolean,
    window: BlockingWindow,
  ): Capability {
    const block = this.statusBlock(subscription);
    if (block) return block;
    if (hasPendingBill) return denied('PENDING_BILL');
    if (window.closed) return denied('EDIT_WINDOW_CLOSED', window.until);
    return allowed(window.closesAt);
  }

  /**
   * Pausa (§6.1 + §6.2): status active; plano Semestral|Anual; crédito disponível; pelo menos
   * 3 cobranças pagas (a partir da 4ª); e pedido até D-3 da próxima cobrança.
   */
  private canPause(subscription: Subscription, now: Date): Capabilities['canPause'] {
    const extra = { creditsLeft: subscription.pauseCreditsLeft, maxCycles: MAX_PAUSE_CYCLES };
    const block = this.statusBlock(subscription);
    if (block) return { ...block, ...extra };
    if (!PAUSE_ELIGIBLE_FREQUENCIES.includes(subscription.frequency)) {
      return { ...denied('FREQUENCY_NOT_ELIGIBLE'), ...extra };
    }
    if (subscription.pauseCreditsLeft <= 0) return { ...denied('NO_PAUSE_CREDITS'), ...extra };
    if (subscription.paidCycles < MIN_PAID_CYCLES_FOR_PAUSE) {
      return { ...denied('MIN_PAID_CYCLES'), ...extra };
    }
    const window = this.pauseWindow(subscription, now);
    if (window.closed) return { ...denied('PAUSE_WINDOW_CLOSED', window.until), ...extra };
    return { ...allowed(window.closesAt), ...extra };
  }

  /** Desfazer a pausa: só com a assinatura pausada e até D-5 da cobrança do ciclo pausado. */
  private canResume(subscription: Subscription, now: Date): Capability {
    if (subscription.status !== 'paused') return denied('NOT_PAUSED');
    const window = this.resumeWindow(subscription, now);
    if (window.closed) return denied('RESUME_WINDOW_CLOSED', window.until);
    return allowed(window.closesAt);
  }

  /**
   * Cancelamento (§6.1 "trava de fidelidade"):
   * - Mensal (remaining=-1): sempre permitido.
   * - remaining > 0: bloqueado (COMMITMENT_ACTIVE) até o pagamento do último ciclo da fidelidade.
   * - remaining = 0: permitido após o último pagamento e até o dia anterior à cobrança seguinte;
   *   a partir de 00:00 (São Paulo) do dia da cobrança → CANCEL_WINDOW_CLOSED (sem cancelar,
   *   renova). `cancellationBlocked` (agendamento ativo) continua como CANCELLATION_BLOCKED.
   */
  private canCancel(subscription: SubscriptionDetail, now: Date): Capabilities['canCancel'] {
    const remaining = subscription.remainingCommitmentMonths;
    const commitmentEndsAt = this.commitmentEndsAt(subscription);
    const extra = {
      remainingCommitmentMonths: remaining,
      // earlyWindow: cancelamento dentro do período de fidelidade (ainda há meses restantes).
      earlyWindow: remaining > 0,
      ...(commitmentEndsAt ? { commitmentEndsAt } : {}),
    };
    if (subscription.status === 'canceled')
      return { ...denied('SUBSCRIPTION_NOT_ACTIVE'), ...extra };
    if (subscription.status === 'fraud_review') return { ...denied('UNDER_REVIEW'), ...extra };
    if (subscription.cancellationBlocked) return { ...denied('CANCELLATION_BLOCKED'), ...extra };
    if (remaining > 0) return { ...denied('COMMITMENT_ACTIVE', commitmentEndsAt), ...extra };
    if (remaining === 0) {
      const next = parseDate(subscription.nextBillingAt);
      if (next) {
        const dayStart = startOfDayInSaoPaulo(next);
        if (now.getTime() >= dayStart.getTime()) {
          return { ...denied('CANCEL_WINDOW_CLOSED', toSaoPauloIso(next)), ...extra };
        }
        return { ...allowed(toSaoPauloIso(dayStart)), ...extra };
      }
    }
    return { ...allowed(), ...extra };
  }

  private canChangeCard(subscription: Subscription): Capability {
    if (subscription.status === 'fraud_review') return denied('UNDER_REVIEW');
    if (subscription.status === 'canceled') return denied('SUBSCRIPTION_NOT_ACTIVE');
    return allowed();
  }

  private canChangeAddress(subscription: Subscription, window: BlockingWindow): Capability {
    if (subscription.status === 'fraud_review') return denied('UNDER_REVIEW');
    if (subscription.status === 'canceled') return denied('SUBSCRIPTION_NOT_ACTIVE');
    // O pedido do ciclo é gerado na cobrança; trocar endereço dentro da janela conflita com ele.
    if (window.closed) return denied('EDIT_WINDOW_CLOSED', window.until);
    return allowed(window.closesAt);
  }
}
