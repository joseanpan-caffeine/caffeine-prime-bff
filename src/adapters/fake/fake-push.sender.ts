import { Injectable, Logger } from '@nestjs/common';
import { PushMessage, PushSender } from '../../ports';

/** Push fake: só registra em log e guarda o histórico (útil nos testes). */
@Injectable()
export class FakePushSender implements PushSender {
  private readonly logger = new Logger(FakePushSender.name);
  readonly sent: Array<{ tokens: string[]; message: PushMessage }> = [];

  async send(expoPushTokens: string[], message: PushMessage): Promise<void> {
    this.sent.push({ tokens: expoPushTokens, message });
    if (expoPushTokens.length === 0) return;
    this.logger.log(`push "${message.title}" → ${expoPushTokens.length} dispositivo(s)`);
  }
}
