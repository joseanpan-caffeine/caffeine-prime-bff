import { Injectable, Logger } from '@nestjs/common';
import { PushMessage, PushSender, PushTarget } from '../../ports';

/** Push fake: só registra em log e guarda o histórico (útil nos testes). */
@Injectable()
export class FakePushSender implements PushSender {
  private readonly logger = new Logger(FakePushSender.name);
  readonly sent: Array<{ targets: PushTarget[]; message: PushMessage }> = [];

  async send(targets: PushTarget[], message: PushMessage): Promise<void> {
    this.sent.push({ targets, message });
    if (targets.length === 0) return;
    const byProvider = targets.reduce<Record<string, number>>((acc, t) => {
      acc[t.provider] = (acc[t.provider] ?? 0) + 1;
      return acc;
    }, {});
    this.logger.log(`push "${message.title}" → ${JSON.stringify(byProvider)}`);
  }
}
