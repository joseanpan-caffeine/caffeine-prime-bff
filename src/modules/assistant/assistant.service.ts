import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors';
import { Env, ENV } from '../../config/env';
import {
  AssistantConfig,
  AssistantMessage,
  AssistantSendRequest,
  AssistantSendResponse,
  AssistantThread,
} from '../../contracts/api';
import { CapabilitiesService } from '../../core/capabilities.service';
import { computeRoutineSummary } from '../../core/routine.service';
import { addDays, startOfDayInSaoPaulo } from '../../core/timezone';
import {
  ASSISTANT_PROVIDER,
  ASSISTANT_STORE,
  AssistantCustomerContext,
  AssistantProvider,
  AssistantStore,
  CLOCK,
  Clock,
  ROUTINE_STORE,
  RoutineStore,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../../ports';
import { RoutineService } from '../routine/routine.service';
import { ASSISTANT_DISCLAIMER, SUGGESTED_PROMPTS } from './system-prompt';

const TITLE_MAX = 60;

/**
 * Prime IA (frente 5). O BFF monta o contexto do cliente (caixa, plano, rotina, capabilities)
 * sem PII, aplica o limite diário e persiste a conversa. Logs só com customerId e tamanhos.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject(ASSISTANT_STORE) private readonly store: AssistantStore,
    @Inject(ASSISTANT_PROVIDER) private readonly provider: AssistantProvider,
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(ROUTINE_STORE) private readonly routineStore: RoutineStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    private readonly capabilities: CapabilitiesService,
    private readonly routine: RoutineService,
  ) {}

  config(): AssistantConfig {
    return {
      enabled: this.env.features.assistant,
      disclaimer: ASSISTANT_DISCLAIMER,
      suggestedPrompts: SUGGESTED_PROMPTS,
      dailyMessageLimit: this.env.assistant.dailyMessageLimit,
    };
  }

  listThreads(customerId: string): Promise<AssistantThread[]> {
    return this.store.listThreads(customerId);
  }

  async getThread(customerId: string, threadId: string): Promise<AssistantThread> {
    const t = await this.store.getThread(customerId, threadId);
    if (!t) throw AppError.forbidden();
    const { customerId: _c, ...pub } = t;
    return pub;
  }

  async deleteThread(customerId: string, threadId: string): Promise<void> {
    if (!(await this.store.deleteThread(customerId, threadId))) throw AppError.forbidden();
  }

  async send(customerId: string, request: AssistantSendRequest): Promise<AssistantSendResponse> {
    const now = this.clock.now();
    await this.assertWithinDailyLimit(customerId, now);

    let thread = request.threadId ? await this.store.getThread(customerId, request.threadId) : null;
    if (request.threadId && !thread) throw AppError.forbidden();
    const isNew = !thread;
    if (!thread) {
      thread = await this.store.createThread(customerId, titleFrom(request.message), now);
    }

    const userMessage: AssistantMessage = {
      id: randomUUID(),
      role: 'user',
      content: request.message,
      createdAt: now.toISOString(),
    };
    const context = await this.buildContext(customerId, now, request.context?.screen);
    const reply = await this.provider.reply({
      customerContext: context,
      thread: [...thread.messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
      message: request.message,
    });
    const replyMessage: AssistantMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: reply.content,
      createdAt: this.clock.now().toISOString(),
    };
    await this.store.appendMessages(customerId, thread.id, [userMessage, replyMessage]);
    // Sem PII nem conteúdo: só identificadores e tamanhos (insumo de pesquisa fica no store).
    this.logger.log(
      `assistente customer=${customerId} thread=${thread.id} in=${request.message.length} out=${reply.content.length}`,
    );
    return {
      threadId: thread.id,
      reply: replyMessage,
      ...(reply.actions?.length ? { actions: reply.actions } : {}),
      ...(isNew ? { disclaimer: ASSISTANT_DISCLAIMER } : {}),
    };
  }

  private async assertWithinDailyLimit(customerId: string, now: Date) {
    const from = startOfDayInSaoPaulo(now);
    const to = addDays(from, 1);
    const used = await this.store.countUserMessagesBetween(customerId, from, to);
    const limit = this.env.assistant.dailyMessageLimit;
    if (used >= limit) {
      throw AppError.tooManyRequests(
        'ASSISTANT_LIMIT',
        `Você atingiu o limite de ${limit} mensagens por dia. Volte amanhã!`,
        { limit, resetsAt: to.toISOString() },
      );
    }
  }

  /** Contexto injetado no modelo: nada de nome, CPF, e-mail, endereço ou cartão. */
  private async buildContext(
    customerId: string,
    now: Date,
    screen?: string,
  ): Promise<AssistantCustomerContext> {
    const sub = await this.subscriptions.getByCustomer(customerId);
    const ctx: AssistantCustomerContext = {
      boxItems:
        sub?.items
          .filter((i) => !i.isGift)
          .map((i) => ({
            handle: i.handle,
            title: i.title,
            quantity: i.quantity,
          })) ?? [],
      ...(screen ? { screen } : {}),
    };
    if (sub) {
      ctx.planName = sub.planName;
      ctx.frequency = sub.frequency;
      ctx.status = sub.status;
      ctx.nextBillingAt = sub.nextBillingAt;
      const caps = this.capabilities.compute({ subscription: sub, now });
      ctx.capabilities = {
        canEdit: caps.canEdit.allowed,
        canPause: caps.canPause.allowed,
        canResume: caps.canResume.allowed,
        canCancel: caps.canCancel.allowed,
        hasPendingBill: caps.hasPendingBill,
      };
      const stored = await this.routineStore.getPlan(customerId);
      if (stored) {
        const plan = await this.routine.getPlan(customerId);
        const checkIns = await this.routineStore.listCheckIns(customerId);
        const summary = computeRoutineSummary({ plan, checkIns, now });
        ctx.routine = {
          currentStreakDays: summary.currentStreakDays,
          weekCompletion: summary.weekCompletion,
          todayCompletion: summary.today.completion,
          items: plan.items.map((i) => ({
            title: i.title,
            slot: i.slot,
            done: summary.today.items.find((t) => t.routineItemId === i.id)?.done ?? false,
          })),
        };
      }
    }
    return ctx;
  }
}

function titleFrom(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean;
}
