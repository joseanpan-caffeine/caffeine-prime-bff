import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Env, ENV } from '../../config/env';
import { buildSystemPrompt, parseAssistantOutput } from '../../modules/assistant/system-prompt';
import { AppError } from '../../common/errors';
import { AssistantProvider, AssistantReply, AssistantReplyInput } from '../../ports';

/**
 * Assistente real usando a API da Anthropic (`@anthropic-ai/sdk`).
 * Env: ANTHROPIC_API_KEY, ASSISTANT_MODEL (padrão claude-sonnet-4-5), ASSISTANT_MAX_TOKENS.
 * O prompt de sistema e a allowlist de deep links estão em `modules/assistant/system-prompt.ts`.
 */
@Injectable()
export class AnthropicAssistantProvider implements AssistantProvider {
  private readonly logger = new Logger(AnthropicAssistantProvider.name);
  private readonly client?: Anthropic;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.assistant.apiKey) this.client = new Anthropic({ apiKey: env.assistant.apiKey });
    else this.logger.warn('ANTHROPIC_API_KEY ausente: assistente indisponível');
  }

  async reply(input: AssistantReplyInput): Promise<AssistantReply> {
    if (!this.client) {
      throw new AppError(
        503,
        'ASSISTANT_UNAVAILABLE',
        'O assistente está indisponível no momento.',
      );
    }
    // Histórico limitado às últimas 20 mensagens; a mensagem nova já está no fim do thread.
    const history = input.thread.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      history.push({ role: 'user', content: input.message });
    }
    try {
      const response = await this.client.messages.create({
        model: this.env.assistant.model,
        max_tokens: this.env.assistant.maxTokens,
        system: buildSystemPrompt(input.customerContext),
        messages: history,
      });
      const raw = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return parseAssistantOutput(raw);
    } catch (err) {
      // Log sem o conteúdo da conversa.
      this.logger.error(`falha na API da Anthropic: ${(err as Error).message}`);
      throw new AppError(
        503,
        'ASSISTANT_UNAVAILABLE',
        'O assistente está indisponível no momento.',
      );
    }
  }
}
